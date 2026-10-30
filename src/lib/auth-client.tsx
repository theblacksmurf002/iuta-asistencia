"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { Session, User } from "./auth-types";

export interface SessionContextValue {
  data: Session | null;
  status: "authenticated" | "unauthenticated" | "loading";
  update: () => Promise<Session | null>;
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
  update: async () => null,
});

export const SESSION_STORAGE_KEY = "iuta_auth_session_data";

export function SessionProvider({
  children,
  session: initialSession,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  const [session, setSession] = useState<Session | null>(initialSession ?? null);
  const [status, setStatus] = useState<"authenticated" | "unauthenticated" | "loading">("loading");

  const syncSession = useCallback(async () => {
    try {
      // 1. Primero comprobar si hay sesión en localStorage para renderizado instantáneo
      const local = typeof window !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null;
      let localSession: Session | null = null;
      if (local) {
        try {
          localSession = JSON.parse(local);
          if (localSession?.user?.name) {
            setSession(localSession);
            setStatus("authenticated");
          }
        } catch {}
      }

      // 2. Consultar al endpoint estándar NextAuth /api/auth/session
      const res = await fetch("/api/auth/session", {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.user && data.user.name) {
          setSession(data);
          setStatus("authenticated");
          if (typeof window !== "undefined") {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
          }
          return data;
        }
      }

      // Si el servidor indica que no hay sesión activa
      if (!localSession?.user?.name) {
        setSession(null);
        setStatus("unauthenticated");
        if (typeof window !== "undefined") {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
      return null;
    } catch (err) {
      console.warn("[SessionProvider] Error sincronizando sesión:", err);
      // Fallback a localStorage si falló la red
      const local = typeof window !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null;
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (parsed?.user?.name) {
            setSession(parsed);
            setStatus("authenticated");
            return parsed;
          }
        } catch {}
      }
      setStatus("unauthenticated");
      return null;
    }
  }, []);

  useEffect(() => {
    syncSession();

    // Escuchar eventos de almacenamiento entre pestañas
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SESSION_STORAGE_KEY) {
        syncSession();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [syncSession]);

  const value = useMemo(
    () => ({
      data: session,
      status,
      update: syncSession,
    }),
    [session, status, syncSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

export async function signIn(
  provider: string = "google",
  options?: {
    callbackUrl?: string;
    redirect?: boolean;
    user?: Partial<User>;
  }
) {
  try {
    const res = await fetch(`/api/auth/signin/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options || {}),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.session) {
        if (typeof window !== "undefined") {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data.session));
        }
      }
      if (data.url && (options?.redirect ?? true)) {
        window.location.href = data.url;
        return;
      }
      if (options?.redirect ?? true) {
        window.location.href = options?.callbackUrl || "/";
      }
    }
  } catch (err) {
    console.error("[signIn] Error al iniciar sesión:", err);
  }
}

export async function signOut(options?: { callbackUrl?: string; redirect?: boolean }) {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[signOut] Error al cerrar sesión:", err);
  }

  if (options?.redirect ?? true) {
    window.location.href = options?.callbackUrl || "/";
  } else if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export async function getSession(): Promise<Session | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data?.user) return data;
    }
  } catch {}
  return null;
}
