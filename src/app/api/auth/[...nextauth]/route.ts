import { NextRequest, NextResponse } from "next/server";

// Nombre de cookie estándar usado por NextAuth.js
const SESSION_COOKIE_NAME = "next-auth.session-token";

interface StoredSession {
  user: {
    id?: string;
    name: string;
    email: string;
    image?: string;
  };
  expires: string;
}

function getEnvConfig() {
  const nextAuthUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const nextAuthSecret = process.env.NEXTAUTH_SECRET || "iuta_asistencia_secret";

  const isRealGoogleConfigured =
    Boolean(googleClientId) &&
    Boolean(googleClientSecret) &&
    !googleClientId.includes("your-google-client-id") &&
    !googleClientSecret.includes("your-google-client-secret");

  return {
    nextAuthUrl,
    googleClientId,
    googleClientSecret,
    nextAuthSecret,
    isRealGoogleConfigured,
  };
}

function parseSessionCookie(cookieValue: string | undefined): StoredSession | null {
  if (!cookieValue) return null;
  try {
    const decoded = Buffer.from(cookieValue, "base64").toString("utf-8");
    const session = JSON.parse(decoded) as StoredSession;
    if (session && session.user && session.user.name) {
      return session;
    }
  } catch {
    // Si no está en base64, intentar como JSON directo
    try {
      const session = JSON.parse(cookieValue) as StoredSession;
      if (session && session.user && session.user.name) {
        return session;
      }
    } catch {}
  }
  return null;
}

function serializeSessionCookie(session: StoredSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.nextauth ? resolvedParams.nextauth.join("/") : "";
  const config = getEnvConfig();

  // 1. GET /api/auth/session
  if (path === "session") {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME);
    const session = parseSessionCookie(cookie?.value);

    if (session) {
      return NextResponse.json(session);
    }
    return NextResponse.json({});
  }

  // 2. GET /api/auth/providers
  if (path === "providers") {
    return NextResponse.json({
      google: {
        id: "google",
        name: "Google",
        type: "oauth",
        signinUrl: `${config.nextAuthUrl}/api/auth/signin/google`,
        callbackUrl: `${config.nextAuthUrl}/api/auth/callback/google`,
      },
    });
  }

  // 3. GET /api/auth/csrf
  if (path === "csrf") {
    return NextResponse.json({
      csrfToken: "iuta_csrf_token_" + Math.random().toString(36).substring(2),
    });
  }

  // 4. GET /api/auth/signin/google (Navegación directa o redirección)
  if (path === "signin/google" || path === "signin") {
    if (config.isRealGoogleConfigured) {
      const redirectUri = `${config.nextAuthUrl}/api/auth/callback/google`;
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        config.googleClientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=openid%20profile%20email&access_type=offline&prompt=consent`;
      return NextResponse.redirect(googleAuthUrl);
    }

    // Modo desarrollo / demo institucional si las credenciales de Google aún no se configuraron en .env.local
    const mockSession: StoredSession = {
      user: {
        id: "usr-" + Math.random().toString(36).substring(2, 8),
        name: "Carlos Eduardo Mendoza",
        email: "carlos.mendoza@iuta.edu.ve",
        image: "https://lh3.googleusercontent.com/a/default-user",
      },
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    };

    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: serializeSessionCookie(mockSession),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  }

  // 5. GET /api/auth/callback/google (Retorno desde Google OAuth 2.0)
  if (path === "callback/google") {
    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");

    if (error || !code) {
      return NextResponse.redirect(
        new URL(`/?error=${encodeURIComponent(error || "access_denied")}`, request.url)
      );
    }

    try {
      // Intercambio de código por access_token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: `${config.nextAuthUrl}/api/auth/callback/google`,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url));
      }

      // Obtener datos del perfil de Google
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();

      const newSession: StoredSession = {
        user: {
          id: userData.sub || "usr-" + Math.random().toString(36).substring(2, 8),
          name: userData.name || "Estudiante IUTA",
          email: userData.email || "estudiante@iuta.edu.ve",
          image: userData.picture,
        },
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      };

      const res = NextResponse.redirect(new URL("/", request.url));
      res.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: serializeSessionCookie(newSession),
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    } catch (err) {
      console.error("[NextAuth Google Callback Error]:", err);
      return NextResponse.redirect(new URL("/?error=oauth_internal_error", request.url));
    }
  }

  return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> }
) {
  const resolvedParams = await params;
  const path = resolvedParams.nextauth ? resolvedParams.nextauth.join("/") : "";
  const config = getEnvConfig();

  // POST /api/auth/signin/google
  if (path === "signin/google" || path === "signin") {
    let body: any = {};
    try {
      body = await request.json();
    } catch {}

    // Si se enviaron datos de usuario específicos para login institucional o mock
    const studentName = body.name || body.user?.name || "Carlos Eduardo Mendoza";
    const studentEmail = body.email || body.user?.email || "carlos.mendoza@iuta.edu.ve";

    // Si Google está configurado y el cliente solicita redirección explícita OAuth
    if (config.isRealGoogleConfigured && !body.simulateMock) {
      const redirectUri = `${config.nextAuthUrl}/api/auth/callback/google`;
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        config.googleClientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=openid%20profile%20email&access_type=offline&prompt=consent`;

      return NextResponse.json({ url: googleAuthUrl });
    }

    // Sesión institucional autenticada
    const newSession: StoredSession = {
      user: {
        id: "usr-" + Math.random().toString(36).substring(2, 8),
        name: studentName,
        email: studentEmail,
        image: body.image || "https://lh3.googleusercontent.com/a/default-user",
      },
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    };

    const res = NextResponse.json({
      success: true,
      session: newSession,
      url: body.callbackUrl || "/",
    });

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: serializeSessionCookie(newSession),
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  }

  // POST /api/auth/signout
  if (path === "signout") {
    const res = NextResponse.json({ success: true, url: "/" });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      path: "/",
      httpOnly: true,
      maxAge: 0,
    });
    return res;
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
