"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import confetti from "canvas-confetti";
import { QRCodeSVG } from "qrcode.react";
import { useSession, signIn, signOut } from "next-auth/react";
import { QrScannerComponent } from "@/components/qr-scanner";
import {
  Clock,
  MapPin,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  GraduationCap,
  Sparkles,
  Download,
  Copy,
  Radio,
  Moon,
  Sun,
  RefreshCw,
  Award,
  Printer,
  Trash2,
  Lock,
  Unlock,
  Camera,
  ShieldAlert,
  Eye,
  EyeOff,
  Timer,
  LogOut,
  Mail,
  Smartphone,
  ShieldCheck,
} from "lucide-react";

// =========================================================================
// 1. CONFIGURACIÓN INSTITUCIONAL Y HORARIOS OFICIALES IUTA
// =========================================================================
const IUTA_SEDE = {
  lat: 10.5028,
  lng: -66.8973,
  radiusMeters: 60,
  name: "IUTA - Sede Principal / Región Capital",
};

export const PROFESSOR_ACCESS_PASSWORD = "Labor*24";

export interface SabatinoClass {
  code: string;
  name: string;
  modality: string;
  scheduleDisplay: string;
  startMinutes: number;
  endMinutes: number;
  firstHourLimitMinutes: number; // Límite para "Presente" (startMinutes + 60)
  firstHourLimitDisplay: string;
  room: string;
  professor: string;
  accentColor: string;
  badgeBg: string;
}

export const SABATINO_CLASSES: SabatinoClass[] = [
  {
    code: "INB-143",
    name: "Informática Básica",
    modality: "Presencial",
    scheduleDisplay: "07:45 am a 10:20 am",
    startMinutes: 7 * 60 + 45, // 07:45 am = 465 min
    endMinutes: 10 * 60 + 20,  // 10:20 am = 620 min
    firstHourLimitMinutes: 8 * 60 + 45, // 08:45 am = 525 min (Límite 1ra hora)
    firstHourLimitDisplay: "08:45 am",
    room: "Laboratorio de Computación 2",
    professor: "Ing. R. Méndez",
    accentColor: "from-blue-500 to-indigo-600",
    badgeBg: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  },
  {
    code: "MAT-143",
    name: "Matemática",
    modality: "Presencial",
    scheduleDisplay: "10:20 am a 12:35 pm",
    startMinutes: 10 * 60 + 20, // 10:20 am = 620 min
    endMinutes: 12 * 60 + 35,  // 12:35 pm = 755 min
    firstHourLimitMinutes: 11 * 60 + 20, // 11:20 am = 680 min (Límite 1ra hora)
    firstHourLimitDisplay: "11:20 am",
    room: "Aula 104 - Módulo A",
    professor: "Lic. E. Salazar",
    accentColor: "from-emerald-500 to-teal-600",
    badgeBg: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  },
  {
    code: "ALG-142",
    name: "Algoritmos",
    modality: "Presencial",
    scheduleDisplay: "01:15 pm a 03:30 pm",
    startMinutes: 13 * 60 + 15, // 01:15 pm = 795 min
    endMinutes: 15 * 60 + 30,  // 03:30 pm = 930 min
    firstHourLimitMinutes: 14 * 60 + 15, // 02:15 pm = 855 min (Límite 1ra hora)
    firstHourLimitDisplay: "02:15 pm",
    room: "Laboratorio de Computación 1",
    professor: "Prof. C. Vargas",
    accentColor: "from-purple-500 to-violet-600",
    badgeBg: "bg-purple-500/15 text-purple-300 border-purple-400/30",
  },
];

export interface AttendanceRecordV2 {
  id: string;
  cedula: string;
  nombre: string;
  correo?: string;
  deviceFingerprint?: string;
  claseCodigo: string;
  materiaNombre: string;
  timestamp: number;
  horaExacta: string;
  estado: "Presente" | "Tardado";
  metodo: "QR_SCAN" | "URL_PARAM" | "PIN_MANUAL";
  distanciaMetros: number;
  isDemo: boolean;
}

const STORAGE_KEYS = {
  CI: "iuta_student_ci_v2",
  NAME: "iuta_student_name_v2",
  DEMO_MODE: "iuta_demo_mode_v2",
  THEME: "iuta_theme_mode_v2",
  PROFESSOR_AUTH: "iuta_prof_auth_v2",
  DEVICE_FINGERPRINT: "iuta_device_fingerprint_v2",
};

// =========================================================================
// GENERACIÓN Y PERSISTENCIA DE IDENTIFICADOR DE HARDWARE (DEVICE FINGERPRINT)
// Evita el préstamo de cuentas entre alumnos desde un mismo teléfono
// =========================================================================
export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  let fp = localStorage.getItem(STORAGE_KEYS.DEVICE_FINGERPRINT);
  if (!fp) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      fp = "dev-" + crypto.randomUUID();
    } else {
      fp = "dev-" + Math.random().toString(36).substring(2, 10) + "-" + Date.now().toString(36);
    }
    localStorage.setItem(STORAGE_KEYS.DEVICE_FINGERPRINT, fp);
  }
  return fp;
}

// =========================================================================
// 2. FÓRMULA DE HAVERSINE (DISTANCIA EN METROS)
// =========================================================================
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_METERS = 6371000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

function getAutoSelectedClassCode(date?: Date): string {
  if (!date) return SABATINO_CLASSES[0].code;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const match = SABATINO_CLASSES.find(
    (c) => currentMinutes >= c.startMinutes && currentMinutes < c.endMinutes
  );
  return match ? match.code : SABATINO_CLASSES[0].code;
}

/**
 * Evalúa si el registro se encuentra dentro de la primera hora de clase.
 * Solo la primera hora califica como "Presente"; luego es "Tardado".
 */
function evaluateAttendanceStatus(
  classCode: string,
  date?: Date | null
): { status: "Presente" | "Tardado"; isWithinFirstHour: boolean; limitDisplay: string } {
  const cls = SABATINO_CLASSES.find((c) => c.code === classCode) || SABATINO_CLASSES[0];
  if (!date) {
    return {
      status: "Presente",
      isWithinFirstHour: true,
      limitDisplay: cls.firstHourLimitDisplay,
    };
  }

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const isWithin = currentMinutes <= cls.firstHourLimitMinutes;

  return {
    status: isWithin ? "Presente" : "Tardado",
    isWithinFirstHour: isWithin,
    limitDisplay: cls.firstHourLimitDisplay,
  };
}

export default function AttendanceApp() {
  // Montaje del componente
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Navegación de Roles
  const [activeTab, setActiveTab] = useState<"student" | "professor">("student");
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Seguridad Docente ("Labor*24")
  const [isProfessorUnlocked, setIsProfessorUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  // Reloj en tiempo real
  const [nowDate, setNowDate] = useState<Date | null>(null);

  // Modo Demo / Pruebas
  const [demoMode, setDemoMode] = useState(false);
  const [demoForcedStatus, setDemoForcedStatus] = useState<"auto" | "Presente" | "Tardado">("auto");

  // GPS ('loading' | 'allowed' | 'denied' | 'out_of_bounds')
  const [gpsStatus, setGpsStatus] = useState<"loading" | "allowed" | "denied" | "out_of_bounds">("loading");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);
  const [gpsRetryKey, setGpsRetryKey] = useState<number>(0);

  // Sesión QR Rotativo (Profesor)
  const [selectedClassCode, setSelectedClassCode] = useState<string>(SABATINO_CLASSES[0].code);
  const [qrToken, setQrToken] = useState<string>("");
  const [qrPin, setQrPin] = useState<string>("");
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number>(20);
  const [copiedPin, setCopiedPin] = useState(false);

  // Filtro en lista de profesor ("all" | "presente" | "tardado")
  const [recordsFilter, setRecordsFilter] = useState<"all" | "presente" | "tardado">("all");

  // Autenticación con Google (NextAuth / Cuenta Institucional)
  const { data: session, status: authStatus } = useSession();
  const [deviceBlockedError, setDeviceBlockedError] = useState<string | null>(null);

  // Datos del Estudiante
  const [studentCi, setStudentCi] = useState("");
  const [studentName, setStudentName] = useState("");

  // Entradas de Asistencia
  const [manualPin, setManualPin] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [incomingToken, setIncomingToken] = useState<string | null>(null);

  // Registros y Comprobante
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecordV2[]>([]);
  const [lastVoucher, setLastVoucher] = useState<AttendanceRecordV2 | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // =========================================================================
  // EFECTO: Reloj del Sistema
  // =========================================================================
  useEffect(() => {
    setNowDate(new Date());
    const interval = setInterval(() => {
      setNowDate(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // =========================================================================
  // EFECTO: Carga Inicial de Almacenamiento Local y Parámetros URL
  // =========================================================================
  useEffect(() => {
    try {
      // Modo Demo
      const savedDemo = localStorage.getItem(STORAGE_KEYS.DEMO_MODE);
      if (savedDemo !== null) setDemoMode(savedDemo === "true");

      // Autenticación de profesor previa en la misma sesión
      const savedProfAuth = sessionStorage.getItem(STORAGE_KEYS.PROFESSOR_AUTH);
      if (savedProfAuth === "true") setIsProfessorUnlocked(true);

      // Tema
      const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (savedTheme === "light") {
        setIsDarkMode(false);
        document.documentElement.classList.remove("dark");
      } else {
        setIsDarkMode(true);
        document.documentElement.classList.add("dark");
      }

      // Estudiante
      const savedCi = localStorage.getItem(STORAGE_KEYS.CI);
      const savedName = localStorage.getItem(STORAGE_KEYS.NAME);
      if (savedCi) setStudentCi(savedCi);
      if (savedName && !session?.user?.name) setStudentName(savedName);

      // Auto-selección horaria
      const autoCode = getAutoSelectedClassCode(new Date());
      setSelectedClassCode(autoCode);

      // Parámetros de URL
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get("role");
      if (roleParam === "estudiante" || roleParam === "student") {
        setActiveTab("student");
      }

      const urlClase = params.get("clase");
      const urlToken = params.get("token");
      const urlPin = params.get("pin");

      if (urlClase) setSelectedClassCode(urlClase);
      if (urlPin) setManualPin(urlPin);
      if (urlToken) setIncomingToken(urlToken);

      if (urlToken || urlPin) {
        setActiveTab("student");
        setStatusMessage({
          type: "info",
          text: `Datos vinculados desde el código QR de ${urlClase || "la clase"}. Confirma tu asistencia.`,
        });
      }
    } catch {}
  }, []);

  // =========================================================================
  // EFECTO: Sincronización Estricta de Identidad desde Google (NextAuth)
  // =========================================================================
  useEffect(() => {
    if (session?.user?.name) {
      setStudentName(session.user.name);
      try {
        localStorage.setItem(STORAGE_KEYS.NAME, session.user.name);
      } catch {}
    }
  }, [session?.user?.name]);

  // =========================================================================
  // 1. BACKEND SYNC: Polling en tiempo real para el Panel del Profesor
  // =========================================================================
  const fetchServerAttendance = useCallback(async () => {
    try {
      const res = await fetch("/api/asistencia");
      if (res.ok) {
        const data = await res.json();
        if (data.records) {
          setAttendanceRecords(data.records);
        }
      }
    } catch {}
  }, []);

  // Polling continuo cuando el profesor tiene el panel desbloqueado
  useEffect(() => {
    fetchServerAttendance();
    if (activeTab === "professor" && isProfessorUnlocked) {
      const pollTimer = setInterval(fetchServerAttendance, 2000);
      return () => clearInterval(pollTimer);
    }
  }, [activeTab, isProfessorUnlocked, fetchServerAttendance]);

  // =========================================================================
  // 2. BLOQUEO DE GPS (Vista Estudiante)
  // =========================================================================
  useEffect(() => {
    if (activeTab !== "student") return;

    if (demoMode) {
      setGpsStatus("allowed");
      setDistanceMeters(6);
      setUserLocation({ lat: IUTA_SEDE.lat + 0.00004, lng: IUTA_SEDE.lng + 0.00004 });
      setGpsErrorMessage(null);
      return;
    }

    if (!navigator.geolocation) {
      setGpsStatus("denied");
      setGpsErrorMessage("Tu dispositivo o navegador no soporta geolocalización satelital.");
      return;
    }

    setGpsStatus("loading");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        const dist = calculateHaversineDistance(
          latitude,
          longitude,
          IUTA_SEDE.lat,
          IUTA_SEDE.lng
        );
        setDistanceMeters(dist);

        if (dist <= IUTA_SEDE.radiusMeters) {
          setGpsStatus("allowed");
          setGpsErrorMessage(null);
        } else {
          setGpsStatus("out_of_bounds");
        }
      },
      (err) => {
        setGpsStatus("denied");
        let msg = "No se pudo obtener la posición satelital GPS.";
        if (err.code === err.PERMISSION_DENIED) {
          msg = "Permiso de ubicación denegado. Habilita los permisos de GPS en el navegador.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = "Señal satelital no disponible en este momento.";
        } else if (err.code === err.TIMEOUT) {
          msg = "Tiempo de espera agotado al consultar satélites GPS.";
        }
        setGpsErrorMessage(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [activeTab, demoMode, gpsRetryKey]);

  const handleRetryGPS = () => {
    setGpsStatus("loading");
    setGpsRetryKey((k) => k + 1);
  };

  // Alternar Modo Demo
  const toggleDemoMode = () => {
    setDemoMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEYS.DEMO_MODE, String(next));
      } catch {}
      return next;
    });
  };

  // Alternar Tema
  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        try {
          localStorage.setItem(STORAGE_KEYS.THEME, "dark");
        } catch {}
      } else {
        document.documentElement.classList.remove("dark");
        try {
          localStorage.setItem(STORAGE_KEYS.THEME, "light");
        } catch {}
      }
      return next;
    });
  };

  // =========================================================================
  // 3. SEGURIDAD DOCENTE: Validación de Contraseña "Labor*24"
  // =========================================================================
  const handleUnlockProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;

    setIsVerifyingPassword(true);
    setPasswordError(false);

    if (passwordInput.trim() === PROFESSOR_ACCESS_PASSWORD) {
      setIsProfessorUnlocked(true);
      setPasswordError(false);
      setPasswordInput("");
      try {
        sessionStorage.setItem(STORAGE_KEYS.PROFESSOR_AUTH, "true");
      } catch {}
      fetchServerAttendance();
    } else {
      setPasswordError(true);
    }
    setIsVerifyingPassword(false);
  };

  const handleLockProfessor = () => {
    setIsProfessorUnlocked(false);
    setPasswordInput("");
    setPasswordError(false);
    try {
      sessionStorage.removeItem(STORAGE_KEYS.PROFESSOR_AUTH);
    } catch {}
  };

  // Guardar datos del estudiante
  const handleSaveStudentCi = (val: string) => {
    setStudentCi(val);
    try {
      localStorage.setItem(STORAGE_KEYS.CI, val);
    } catch {}
  };

  const handleSaveStudentName = (val: string) => {
    // Si la sesión de Google está activa, el nombre es inmutable y certificado
    if (session?.user?.name) return;
    setStudentName(val);
    try {
      localStorage.setItem(STORAGE_KEYS.NAME, val);
    } catch {}
  };

  const handleStudentSignOut = async () => {
    setDeviceBlockedError(null);
    setStudentName("");
    try {
      localStorage.removeItem(STORAGE_KEYS.NAME);
    } catch {}
    await signOut({ callbackUrl: "/" });
  };

  const handleGoogleSignIn = () => {
    signIn("google");
  };

  // =========================================================================
  // 4. QR DINÁMICO ROTATIVO (CADA 20 SEGUNDOS) + BACKEND UPDATE
  // =========================================================================
  const generateNewQRCycle = useCallback(async () => {
    const newToken = "tok-" + Math.random().toString(36).substring(2, 8) + "-" + Date.now().toString(36);
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    const nowTime = Date.now();

    setQrToken(newToken);
    setQrPin(newPin);
    setQrSecondsLeft(20);

    try {
      await fetch("/api/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_session",
          clase: selectedClassCode,
          token: newToken,
          pin: newPin,
          timestamp: nowTime,
          activa: true,
        }),
      });
    } catch {}
  }, [selectedClassCode]);

  useEffect(() => {
    if (activeTab === "professor" && isProfessorUnlocked) {
      generateNewQRCycle();
      const timer = setInterval(() => {
        setQrSecondsLeft((prev) => {
          if (prev <= 1) {
            generateNewQRCycle();
            return 20;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [activeTab, isProfessorUnlocked, generateNewQRCycle]);

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const qrDynamicUrl = `${currentOrigin}/?role=estudiante&clase=${selectedClassCode}&token=${qrToken}&pin=${qrPin}`;

  // =========================================================================
  // 5. CONFIRMAR ASISTENCIA (ESTUDIANTE -> BACKEND /api/asistencia)
  // =========================================================================
  const handleConfirmAttendance = async (methodUsed: "QR_SCAN" | "URL_PARAM" | "PIN_MANUAL") => {
    setStatusMessage(null);
    setDeviceBlockedError(null);

    // Verificación obligatoria de Autenticación con Google
    if (!session?.user) {
      setStatusMessage({
        type: "error",
        text: "Acceso denegado: Debes iniciar sesión con tu cuenta de Google institucional para confirmar asistencia.",
      });
      return;
    }

    if (!studentCi.trim()) {
      setStatusMessage({
        type: "error",
        text: "Por favor introduce tu Cédula de Identidad.",
      });
      return;
    }

    if (!demoMode && gpsStatus !== "allowed") {
      setStatusMessage({
        type: "error",
        text: `Acceso restringido: Debes encontrarte dentro del campus IUTA (${IUTA_SEDE.radiusMeters}m).`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const activeClass = SABATINO_CLASSES.find((c) => c.code === selectedClassCode) || SABATINO_CLASSES[0];

      let simulatedStatusParam: "Presente" | "Tardado" | undefined = undefined;
      if (demoMode && demoForcedStatus !== "auto") {
        simulatedStatusParam = demoForcedStatus;
      }

      // Obtener o generar identificador físico de hardware (Device Fingerprint)
      const deviceFp = getOrCreateDeviceFingerprint();

      const res = await fetch("/api/asistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_attendance",
          cedula: studentCi.trim(),
          nombre: session.user.name || studentName.trim(),
          correo: session.user.email || undefined,
          device_fingerprint: deviceFp,
          claseCodigo: selectedClassCode,
          materiaNombre: activeClass.name,
          metodo: methodUsed,
          distanciaMetros: demoMode ? 6 : (distanceMeters || 12),
          isDemo: demoMode,
          pin: manualPin,
          token: incomingToken,
          simulatedStatus: simulatedStatusParam,
        }),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (!res.ok || !data.success) {
        if (res.status === 403 || data.code === "DEVICE_BLOCKED") {
          const blockedMsg =
            data.error ||
            "Dispositivo bloqueado: Este teléfono ya registró una asistencia para esta clase. No se permite registrar múltiples alumnos desde el mismo equipo.";
          setDeviceBlockedError(blockedMsg);
          setStatusMessage({
            type: "error",
            text: blockedMsg,
          });
          return;
        }

        setStatusMessage({
          type: "error",
          text: data.error || "No se pudo confirmar la asistencia.",
        });
        return;
      }

      const record: AttendanceRecordV2 = data.record;
      setLastVoucher(record);
      setScannerOpen(false);
      setManualPin("");

      setAttendanceRecords((prev) => [record, ...prev]);

      try {
        confetti({
          particleCount: 110,
          spread: 70,
          origin: { y: 0.65 },
          colors: record.estado === "Presente" ? ["#10b981", "#3b82f6", "#6366f1"] : ["#f59e0b", "#3b82f6", "#ef4444"],
        });
      } catch {}

      const timeStatusText =
        record.estado === "Presente"
          ? "¡Asistencia a tiempo registrada como Presente!"
          : "Asistencia confirmada registrada como Tardado (posterior a la primera hora).";

      setStatusMessage({
        type: "success",
        text: timeStatusText,
      });
    } catch {
      setIsSubmitting(false);
      setStatusMessage({
        type: "error",
        text: "Error de comunicación con el servidor central IUTA.",
      });
    }
  };

  const handleCopyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  // Exportar CSV
  const handleExportCSV = () => {
    const classRecords = attendanceRecords.filter((r) => r.claseCodigo === selectedClassCode);

    if (classRecords.length === 0) {
      alert("No hay alumnos registrados para esta materia.");
      return;
    }

    const headers = [
      "ID Registro",
      "Cedula",
      "Nombre Completo",
      "Correo Institucional",
      "Codigo Materia",
      "Nombre Asignatura",
      "Hora Exacta",
      "Estado (Presente/Tardado)",
      "Metodo",
      "Distancia Sede (m)",
      "ID Dispositivo (Anti-Fraude)",
      "Modo Demo",
    ];

    const rows = classRecords.map((r) => [
      r.id,
      `"${r.cedula}"`,
      `"${r.nombre}"`,
      `"${r.correo || "No registrado"}"`,
      r.claseCodigo,
      `"${r.materiaNombre}"`,
      r.horaExacta,
      r.estado,
      r.metodo,
      r.distanciaMetros,
      `"${r.deviceFingerprint || "N/A"}"`,
      r.isDemo ? "SI" : "NO",
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `IUTA_Asistencia_${selectedClassCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Limpiar lista en servidor (requiere clave docente)
  const handleClearRecords = async () => {
    if (confirm("¿Deseas reiniciar y limpiar los registros de asistencia en el servidor?")) {
      try {
        await fetch("/api/asistencia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "clear_records",
            password: PROFESSOR_ACCESS_PASSWORD,
          }),
        });
        setAttendanceRecords([]);
        setLastVoucher(null);
      } catch {}
    }
  };

  const currentClassRecords = useMemo(() => {
    return attendanceRecords.filter((r) => r.claseCodigo === selectedClassCode);
  }, [attendanceRecords, selectedClassCode]);

  const filteredClassRecords = useMemo(() => {
    if (recordsFilter === "presente") {
      return currentClassRecords.filter((r) => r.estado === "Presente");
    }
    if (recordsFilter === "tardado") {
      return currentClassRecords.filter((r) => r.estado === "Tardado");
    }
    return currentClassRecords;
  }, [currentClassRecords, recordsFilter]);

  const totalStudents = currentClassRecords.length;
  const totalPresentes = currentClassRecords.filter((r) => r.estado === "Presente").length;
  const totalTardados = currentClassRecords.filter((r) => r.estado === "Tardado").length;
  const punctualityRate = totalStudents > 0 ? Math.round((totalPresentes / totalStudents) * 100) : 100;

  const activeClassObj = useMemo(() => {
    return SABATINO_CLASSES.find((c) => c.code === selectedClassCode) || SABATINO_CLASSES[0];
  }, [selectedClassCode]);

  const currentTimingEvaluation = useMemo(() => {
    return evaluateAttendanceStatus(selectedClassCode, nowDate);
  }, [selectedClassCode, nowDate]);

  if (!mounted) {
    return null;
  }

  const isStudentView = activeTab === "student";
  const isGpsBlocked = isStudentView && !demoMode && gpsStatus !== "allowed";

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-200 relative overflow-x-hidden">
      {/* Luces y Gradientes de Fondo para Efecto Glassmorphism */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-gradient-to-b from-blue-600/20 via-indigo-600/15 to-transparent blur-[160px] rounded-full" />
        <div className="absolute top-[30%] -right-48 w-[500px] h-[500px] bg-purple-600/15 blur-[150px] rounded-full" />
        <div className="absolute top-[65%] -left-48 w-[550px] h-[550px] bg-teal-500/15 blur-[160px] rounded-full" />
      </div>

      {/* ============================================================== */}
      {/* 2. PANTALLA DE BLOQUEO GPS (MODAL VIDRIO ESMERILADO PROFUNDO)  */}
      {/* ============================================================== */}
      {isGpsBlocked && (
        <div className="fixed inset-0 z-50 bg-[#07090E]/80 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="max-w-md w-full p-8 rounded-3xl bg-slate-950/70 border border-white/20 shadow-2xl backdrop-blur-2xl space-y-6 relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-80" />

            {/* Loading */}
            {gpsStatus === "loading" && (
              <div className="space-y-5">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500/15 text-blue-400 border border-white/20 shadow-[0_0_25px_rgba(59,130,246,0.25)]">
                  <MapPin className="h-9 w-9 animate-bounce" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Verificando Ubicación Satelital
                  </h2>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Comprobando proximidad al radio del IUTA Sede Principal ({IUTA_SEDE.radiusMeters} metros).
                  </p>
                </div>
              </div>
            )}

            {/* Denied */}
            {gpsStatus === "denied" && (
              <div className="space-y-5">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/15 text-rose-400 border border-white/20 shadow-[0_0_25px_rgba(244,63,94,0.25)]">
                  <Lock className="h-9 w-9" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-rose-400">
                    Permiso de GPS Requerido
                  </h2>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Es indispensable conceder acceso a tu ubicación en el navegador para validar que asistes presencialmente al aula.
                  </p>
                </div>
                {gpsErrorMessage && (
                  <div className="p-3.5 bg-rose-500/10 rounded-2xl border border-rose-500/30 text-xs text-rose-300 font-mono backdrop-blur-md">
                    {gpsErrorMessage}
                  </div>
                )}
                <button
                  onClick={handleRetryGPS}
                  className="w-full py-3.5 bg-blue-600/80 hover:bg-white/20 hover:bg-blue-500 active:scale-[0.98] text-white font-semibold rounded-2xl text-xs tracking-wide shadow-[0_0_20px_rgba(59,130,246,0.35)] transition-all duration-300 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reintentar Comprobación GPS
                </button>
              </div>
            )}

            {/* Out of bounds */}
            {gpsStatus === "out_of_bounds" && (
              <div className="space-y-5">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/15 text-amber-400 border border-white/20 shadow-[0_0_25px_rgba(245,158,11,0.25)]">
                  <ShieldAlert className="h-9 w-9" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-amber-300">
                    Fuera del Campus IUTA
                  </h2>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Tu dispositivo está a <span className="font-bold text-white underline">{distanceMeters} metros</span> de la sede. Solo se permite marcar asistencia dentro del campus institucional ({IUTA_SEDE.radiusMeters}m).
                  </p>
                </div>
                <div className="p-3.5 bg-slate-900/40 rounded-2xl border border-white/15 text-[11px] text-slate-300 space-y-1 backdrop-blur-md">
                  <p>Coordenadas IUTA: {IUTA_SEDE.lat}°N, {IUTA_SEDE.lng}°W</p>
                  <p>Tolerancia de proximidad: {IUTA_SEDE.radiusMeters} metros</p>
                </div>
                <button
                  onClick={handleRetryGPS}
                  className="w-full py-3.5 bg-blue-600/80 hover:bg-white/20 hover:bg-blue-500 active:scale-[0.98] text-white font-semibold rounded-2xl text-xs tracking-wide shadow-[0_0_20px_rgba(59,130,246,0.35)] transition-all duration-300 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reintentar Comprobación GPS
                </button>
              </div>
            )}

            {/* Bypass Demo */}
            <div className="pt-4 border-t border-white/15">
              <button
                type="button"
                onClick={toggleDemoMode}
                className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-amber-300 text-xs font-semibold rounded-2xl border border-white/20 shadow-sm transition-all duration-300 flex items-center justify-center gap-2 backdrop-blur-md"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Activar Modo Demo (Simular estar en el aula)
              </button>
              <p className="text-[11px] text-slate-400 mt-2">
                Permite realizar pruebas o demostraciones sin estar físicamente en la institución.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* BOTÓN FLOTANTE MODO DEMO (ESQUINA INFERIOR DERECHA)            */}
      {/* ============================================================== */}
      <div className="fixed bottom-5 right-5 z-40">
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-slate-950/70 p-3 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Modo Demo (Pruebas)
            </span>
            <span className="text-[10px] text-slate-400">
              {demoMode ? "Bypass GPS Activo (5m)" : "GPS Satelital Real"}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleDemoMode}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              demoMode ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "bg-white/15"
            }`}
            title="Alternar Modo Demo"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                demoMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* BARRA SUPERIOR CRISTALINA GLASSMORPHISM                        */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 bg-slate-900/40 backdrop-blur-xl border-b border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] transition-all">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] font-black text-sm tracking-wider border border-white/30 backdrop-blur-md">
              IU
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-base md:text-lg tracking-tight text-white drop-shadow-sm">
                  IUTA Asistencia
                </h1>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-400/30 backdrop-blur-md">
                  TURNO SABATINO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Control Inteligente de Asistencia • Sede Principal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Reloj Digital Apple en Cristal */}
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/50 backdrop-blur-xl text-xs font-mono font-medium text-slate-200 border border-white/15 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>
                {nowDate
                  ? nowDate.toLocaleTimeString("es-VE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "--:--:--"}
              </span>
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-2xl text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 transition-all duration-300 border border-white/15 backdrop-blur-md shadow-sm"
              aria-label="Cambiar tema visual"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Control Segmentado Glassmorphism */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-2 p-1.5 bg-slate-950/50 rounded-2xl border border-white/15 max-w-sm mx-auto shadow-inner backdrop-blur-xl">
            <button
              onClick={() => setActiveTab("student")}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs md:text-sm font-semibold rounded-xl transition-all duration-300 ${
                activeTab === "student"
                  ? "bg-white/15 text-white shadow-[0_4px_20px_rgba(255,255,255,0.1)] border border-white/25 backdrop-blur-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Vista Estudiante
            </button>

            <button
              onClick={() => setActiveTab("professor")}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs md:text-sm font-semibold rounded-xl transition-all duration-300 ${
                activeTab === "professor"
                  ? "bg-indigo-600/40 text-white shadow-[0_4px_20px_rgba(99,102,241,0.25)] border border-indigo-400/40 backdrop-blur-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {isProfessorUnlocked ? (
                <Unlock className="w-4 h-4 text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 text-amber-400" />
              )}
              Panel Profesor
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* CONTENIDO PRINCIPAL                                            */}
      {/* ============================================================== */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 flex-1 w-full relative z-10">
        {/* Banner de Mensaje de Estado Glass */}
        {statusMessage && (
          <div
            className={`p-4 rounded-3xl border border-white/15 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
              statusMessage.type === "success"
                ? "bg-gradient-to-r from-emerald-950/60 via-slate-900/40 to-emerald-950/50 border-emerald-500/30 text-emerald-200 shadow-emerald-950/30"
                : statusMessage.type === "error"
                ? "bg-gradient-to-r from-rose-950/60 via-slate-900/40 to-rose-950/50 border-rose-500/30 text-rose-200 shadow-rose-950/30"
                : "bg-gradient-to-r from-blue-950/60 via-slate-900/40 to-indigo-950/50 border-blue-500/30 text-blue-200 shadow-blue-950/30"
            }`}
          >
            {statusMessage.type === "success" && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />}
            {statusMessage.type === "error" && <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />}
            {statusMessage.type === "info" && <ShieldAlert className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />}
            <div className="flex-1 font-medium">{statusMessage.text}</div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100 p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* VISTA 1: ESTUDIANTE                                            */}
        {/* ============================================================== */}
        {activeTab === "student" && !isGpsBlocked && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Banner de Política de Horarios (1era hora = Presente) Glass */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-300 border border-white/20 flex items-center justify-center shrink-0 shadow-inner backdrop-blur-md">
                  <Timer className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Regla de Puntualidad IUTA
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md ${
                        currentTimingEvaluation.isWithinFirstHour
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
                          : "bg-amber-500/15 text-amber-300 border-amber-400/30"
                      }`}
                    >
                      {currentTimingEvaluation.isWithinFirstHour ? "A Tiempo (Presente)" : "Fuera de hora (Tardado)"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Solo la <strong>primera hora de clase</strong> califica como <strong>Presente</strong> (límite:{" "}
                    <span className="font-mono text-white font-semibold">{activeClassObj.firstHourLimitDisplay}</span>).
                    Posterior a esa hora se registrará automáticamente como <strong>Tardado</strong>.
                  </p>
                </div>
              </div>

              {/* Selector en Modo Demo para forzar estado de prueba */}
              {demoMode && (
                <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-950/60 p-1.5 rounded-2xl border border-white/15 text-[11px] backdrop-blur-md shadow-inner">
                  <span className="text-slate-400 px-1 font-semibold">Simular:</span>
                  <button
                    type="button"
                    onClick={() => setDemoForcedStatus("auto")}
                    className={`px-2.5 py-1 rounded-xl font-semibold transition-all duration-200 ${
                      demoForcedStatus === "auto" ? "bg-white/20 text-white shadow-sm border border-white/20" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoForcedStatus("Presente")}
                    className={`px-2.5 py-1 rounded-xl font-semibold transition-all duration-200 ${
                      demoForcedStatus === "Presente" ? "bg-emerald-600/80 text-white shadow-sm border border-emerald-400/30" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Presente
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoForcedStatus("Tardado")}
                    className={`px-2.5 py-1 rounded-xl font-semibold transition-all duration-200 ${
                      demoForcedStatus === "Tardado" ? "bg-amber-600/80 text-white shadow-sm border border-amber-400/30" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Tardado
                  </button>
                </div>
              )}
            </div>

            {/* Banner de Infracción de Dispositivo Físico (Anti-Préstamo de Cuentas) */}
            {deviceBlockedError && (
              <div className="p-5 rounded-3xl bg-gradient-to-r from-rose-950/80 via-slate-900/60 to-rose-950/70 border border-rose-500/40 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(244,63,94,0.35)] text-rose-200 animate-in fade-in duration-300">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-rose-500/20 text-rose-300 border border-rose-500/35 flex items-center justify-center shrink-0 shadow-inner backdrop-blur-md">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-sm text-white flex items-center gap-2">
                        Infracción de Seguridad: Bloqueo de Dispositivo Físico
                      </h4>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-200 border border-rose-400/40 uppercase font-mono font-bold shrink-0">
                        Error 403
                      </span>
                    </div>
                    <p className="text-xs text-rose-200/95 leading-relaxed pt-0.5">
                      {deviceBlockedError}
                    </p>
                    <p className="text-[11px] text-rose-300/80 font-mono pt-1">
                      Dispositivo ID: <span className="underline">{getOrCreateDeviceFingerprint().slice(0, 18)}...</span> • Este teléfono móvil ya registró a un estudiante para esta clase.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Georreferenciación IUTA (Tarjeta Flotante de Cristal) */}
            <section className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-white/20 bg-emerald-500/15 text-emerald-300 shadow-inner backdrop-blur-md">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm md:text-base flex items-center gap-2 text-white">
                      Georreferenciación IUTA
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 backdrop-blur-md">
                        En Rango ({demoMode ? "5m Demo" : `${distanceMeters}m`})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Ubicación verificada dentro del perímetro de {IUTA_SEDE.radiusMeters} metros de la sede.
                    </p>
                    {userLocation && (
                      <p className="text-[11px] text-slate-400 font-mono mt-1">
                        GPS: {userLocation.lat.toFixed(5)}°N, {userLocation.lng.toFixed(5)}°W
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleRetryGPS}
                  className="p-2.5 rounded-2xl text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 active:scale-[0.95] backdrop-blur-md shadow-sm"
                  title="Recalcular coordenadas GPS"
                >
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                </button>
              </div>
            </section>

            {/* CONDICIONAL: SI NO HA INICIADO SESIÓN CON GOOGLE */}
            {!session?.user ? (
              <section className="rounded-3xl p-8 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/50 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] backdrop-blur-2xl space-y-6 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600/30 via-indigo-600/30 to-purple-600/30 border border-white/25 flex items-center justify-center mx-auto shadow-inner backdrop-blur-md text-blue-300">
                  <GraduationCap className="w-8 h-8 text-blue-400" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full uppercase bg-blue-500/15 text-blue-300 border border-blue-400/30 backdrop-blur-md inline-block tracking-wider">
                    Acceso Requerido
                  </span>
                  <h3 className="font-bold text-lg md:text-xl text-white">
                    Autenticación Institucional Obligatoria
                  </h3>
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                    Para acceder al formulario de asistencia y validar tu presencia en clase, debes identificarte con tu cuenta de Google o correo institucional. Tu nombre oficial y correo certificarán tu registro.
                  </p>
                </div>

                <div className="max-w-md mx-auto pt-2">
                  <button
                    type="button"
                    onClick={() => signIn("google")}
                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600/80 via-indigo-600/80 to-purple-600/80 hover:from-blue-500/90 hover:to-indigo-500/90 text-white rounded-2xl font-semibold text-sm shadow-[0_0_35px_rgba(59,130,246,0.35)] transition-all duration-300 flex items-center justify-center gap-3.5 border border-white/30 backdrop-blur-xl group hover:border-white/50 active:scale-[0.98] cursor-pointer"
                  >
                    <svg className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Continuar con Cuenta Institucional (Google)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-2 text-left">
                  <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-[11px] text-slate-300 font-medium">Nombre certificado por Google</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-[11px] text-slate-300 font-medium">Correo institucional oficial</span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-[11px] text-slate-300 font-medium">Bloqueo anti-suplantación por equipo</span>
                  </div>
                </div>
              </section>
            ) : (
              <>
                {/* Tarjeta del Usuario con su Nombre y Correo + Botón SignOut */}
                <section className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl space-y-4 animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      {session.user.image ? (
                        <img
                          src={session.user.image}
                          alt={session.user.name || "Usuario"}
                          className="w-12 h-12 rounded-2xl border border-white/20 object-cover shadow-inner backdrop-blur-md"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-300 border border-white/20 flex items-center justify-center shadow-inner backdrop-blur-md font-bold text-lg">
                          {(session.user.name || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base md:text-lg text-white">
                            {session.user.name}
                          </h3>
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 backdrop-blur-md">
                            <CheckCircle2 className="w-3 h-3" />
                            Certificado
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5 font-mono">
                          <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>{session.user.email}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStudentSignOut}
                      className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 border border-white/15 hover:border-rose-500/30 text-xs font-semibold transition-all duration-300 backdrop-blur-md active:scale-95 cursor-pointer shadow-sm self-end sm:self-auto"
                      title="Cerrar sesión institucional de Google"
                    >
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </section>

                {/* Formulario de Asistencia */}
                <section className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-300 border border-white/15 flex items-center justify-center shadow-inner backdrop-blur-md">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">
                        Formulario de Asistencia Oficial
                      </h4>
                      <p className="text-xs text-slate-400">
                        La cédula se almacena de forma persistente en tu dispositivo
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Cédula de Identidad (V-)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: V-32843747"
                        value={studentCi}
                        onChange={(e) => handleSaveStudentCi(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-white/15 bg-slate-950/40 backdrop-blur-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-400/80 focus:ring-4 focus:ring-blue-500/20 transition-all shadow-inner font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                        <span>Nombre Completo</span>
                        <span className="text-[10px] font-semibold text-blue-300 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-blue-400" />
                          Dato Certificado
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          disabled
                          value={session.user.name || ""}
                          className="w-full pl-4 pr-10 py-3 rounded-2xl border border-white/15 bg-slate-900/70 backdrop-blur-md text-sm text-slate-200 cursor-not-allowed opacity-90 shadow-inner select-none font-medium"
                        />
                        <div className="absolute right-3.5 top-3.5 text-blue-400" title="Dato certificado por la cuenta">
                          <Lock className="w-4 h-4" />
                        </div>
                      </div>
                      <p className="text-[11px] text-blue-300/80 flex items-center gap-1 mt-1 font-medium">
                        <Lock className="w-3 h-3 text-blue-400 shrink-0" />
                        Dato certificado por la cuenta (No editable)
                      </p>
                    </div>
                  </div>
                </section>

                {/* 3. Selección de Materia y Asistencia (Tarjeta Flotante de Cristal) */}
                <section className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                      <h3 className="font-bold text-sm md:text-base text-white">
                        Clase Activa y Registro
                      </h3>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-300 bg-blue-500/15 px-3 py-1 rounded-full border border-blue-400/30 backdrop-blur-md">
                      {activeClassObj.code}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Selecciona la asignatura:
                    </label>
                    <select
                      value={selectedClassCode}
                      onChange={(e) => setSelectedClassCode(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-white/15 bg-slate-950/40 backdrop-blur-md text-sm text-white focus:outline-none focus:border-blue-400/80 focus:ring-4 focus:ring-blue-500/20 transition-all shadow-inner"
                    >
                      {SABATINO_CLASSES.map((c) => (
                        <option key={c.code} value={c.code} className="bg-slate-900 text-white">
                          {c.code} — {c.name} ({c.scheduleDisplay})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Botón de Escaneo con Cámara (Efecto Glass Iluminado) */}
                  <div className="space-y-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setScannerOpen(!scannerOpen)}
                      className="w-full py-4 px-4 bg-gradient-to-r from-blue-600/80 via-indigo-600/80 to-purple-600/80 hover:bg-white/20 hover:from-blue-500/90 hover:to-indigo-500/90 active:scale-[0.98] text-white rounded-2xl font-semibold text-sm shadow-[0_0_25px_rgba(59,130,246,0.35)] transition-all duration-300 flex items-center justify-center gap-2.5 border border-white/30 backdrop-blur-xl"
                    >
                      <Camera className="w-5 h-5" />
                      {scannerOpen ? "Cerrar Escáner de Cámara" : "Escanear Código QR en Pantalla"}
                    </button>

                    {scannerOpen && (
                      <div className="p-4 bg-slate-950/70 rounded-3xl border border-white/20 space-y-2.5 backdrop-blur-2xl shadow-2xl">
                        <QrScannerComponent
                          isScanningActive={scannerOpen}
                          onScanSuccess={(decodedText) => {
                            try {
                              if (decodedText.includes("?") || decodedText.startsWith("http")) {
                                const url = new URL(decodedText);
                                const c = url.searchParams.get("clase");
                                const t = url.searchParams.get("token");
                                const p = url.searchParams.get("pin");

                                if (c) setSelectedClassCode(c);
                                if (p) setManualPin(p);
                                if (t) setIncomingToken(t);
                              } else {
                                setIncomingToken(decodedText);
                              }
                              setScannerOpen(false);
                              handleConfirmAttendance("QR_SCAN");
                            } catch {
                              setIncomingToken(decodedText);
                              setScannerOpen(false);
                              handleConfirmAttendance("QR_SCAN");
                            }
                          }}
                        />
                        <p className="text-center text-xs text-slate-300">
                          Apunta la cámara al código QR proyectado en la pantalla del aula.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Separador PIN Manual */}
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-white/15" />
                    <span className="flex-shrink mx-4 text-xs uppercase text-slate-400 font-semibold tracking-wider">
                      O introduce el PIN de 4 dígitos
                    </span>
                    <div className="flex-grow border-t border-white/15" />
                  </div>

                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-4 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="PIN numérico (ej: 8492)"
                      value={manualPin}
                      onChange={(e) => setManualPin(e.target.value.replace(/\D/g, ""))}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-white/15 bg-slate-950/40 backdrop-blur-md text-base font-mono tracking-widest text-center text-white placeholder-slate-500 focus:outline-none focus:border-blue-400/80 focus:ring-4 focus:ring-blue-500/20 transition-all shadow-inner"
                    />
                  </div>

                  {/* Botón de Confirmación Principal (Glass Iluminado) */}
                  <button
                    type="button"
                    disabled={isSubmitting || (!incomingToken && manualPin.length < 4)}
                    onClick={() => handleConfirmAttendance(incomingToken ? "QR_SCAN" : "PIN_MANUAL")}
                    className="w-full py-4 bg-emerald-600/85 hover:bg-emerald-500 hover:bg-white/20 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none text-white rounded-2xl text-sm font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.35)] border border-white/30 backdrop-blur-xl"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {isSubmitting ? "Sincronizando con el aula..." : "Confirmar Mi Asistencia"}
                  </button>
                </section>

                {/* Comprobante Digital (Modal / Ticket Cristal Profundo) */}
                {lastVoucher && (
                  <section className="rounded-3xl p-6 bg-slate-950/70 border border-white/20 shadow-2xl backdrop-blur-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-white/25 flex items-center justify-center shadow-inner backdrop-blur-md">
                          <Award className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm md:text-base text-white">
                            Comprobante Digital de Asistencia
                          </h3>
                          <p className="text-xs text-emerald-400 font-mono">
                            Folio: {lastVoucher.id}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full shadow-md backdrop-blur-md border ${
                          lastVoucher.estado === "Presente"
                            ? "bg-emerald-500 text-slate-950 border-emerald-300/40 shadow-emerald-500/30"
                            : "bg-amber-400 text-slate-950 border-amber-300/40 shadow-amber-400/30"
                        }`}
                      >
                        {lastVoucher.estado === "Presente" ? "Presente (A tiempo)" : "Tardado (Retardo)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-900/40 backdrop-blur-xl p-4 rounded-2xl border border-white/15 shadow-inner">
                      <div>
                        <span className="text-slate-400 block">Estudiante:</span>
                        <strong className="text-white font-medium">{lastVoucher.nombre}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Cédula:</span>
                        <strong className="text-white font-mono">{lastVoucher.cedula}</strong>
                      </div>
                      <div className="pt-2 border-t border-white/15">
                        <span className="text-slate-400 block">Asignatura:</span>
                        <strong className="text-white font-medium">
                          {lastVoucher.materiaNombre} ({lastVoucher.claseCodigo})
                        </strong>
                      </div>
                      <div className="pt-2 border-t border-white/15">
                        <span className="text-slate-400 block">Hora de Registro:</span>
                        <strong className="text-white font-mono">{lastVoucher.horaExacta}</strong>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-white/15 flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Método: {lastVoucher.metodo === "QR_SCAN" ? "Código QR" : "PIN Manual"}
                        </span>
                        <span>
                          Distancia Sede: {lastVoucher.distanciaMetros}m {lastVoucher.isDemo ? "(Modo Demo)" : ""}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-[0.98] text-xs font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-md shadow-sm"
                    >
                      <Printer className="w-4 h-4 text-slate-300" />
                      Imprimir / Guardar Comprobante PDF
                    </button>
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* VISTA 2: PANEL PROFESOR (CON CLAVE INSTITUCIONAL "Labor*24")   */}
        {/* ============================================================== */}
        {activeTab === "professor" && (
          <div>
            {!isProfessorUnlocked ? (
              /* PANTALLA DE BLOQUEO DE SEGURIDAD (MODAL VIDRIO ESMERILADO PROFUNDO) */
              <div className="max-w-md mx-auto my-8 p-8 rounded-3xl backdrop-blur-2xl bg-slate-950/70 border border-white/20 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-80" />

                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-500/15 text-indigo-300 border border-white/20 shadow-[0_0_25px_rgba(99,102,241,0.25)]">
                  <Lock className="h-9 w-9" />
                </div>

                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">
                    Acceso Exclusivo de Docentes
                  </h2>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    Esta sección está protegida. Ingresa la contraseña oficial de profesor para proyectar el código QR y monitorear la asistencia del aula.
                  </p>
                </div>

                <form onSubmit={handleUnlockProfessor} className="space-y-4 text-left">
                  <div className={passwordError ? "animate-shake" : ""}>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Contraseña de Profesor
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Introduce la contraseña"
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          if (passwordError) setPasswordError(false);
                        }}
                        autoFocus
                        className={`w-full pl-4 pr-11 py-3 rounded-2xl border text-sm bg-slate-900/40 backdrop-blur-md text-white placeholder-slate-500 focus:outline-none transition-all shadow-inner ${
                          passwordError
                            ? "border-rose-500 ring-4 ring-rose-500/20"
                            : "border-white/15 focus:border-indigo-400/80 focus:ring-4 focus:ring-indigo-500/20"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white transition"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {passwordError && (
                      <p className="text-[11px] font-semibold text-rose-400 mt-1.5 flex items-center gap-1 animate-in fade-in duration-200">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Contraseña incorrecta. Solo docentes autorizados IUTA.
                      </p>
                    )}
                  </div>

                  {/* Botón Iniciar Sesión / Desbloquear (Glass Iluminado) */}
                  <button
                    type="submit"
                    disabled={isVerifyingPassword || !passwordInput.trim()}
                    className="w-full py-3.5 bg-gradient-to-r from-indigo-600/90 to-purple-600/90 hover:bg-white/20 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white font-semibold rounded-2xl text-xs tracking-wide shadow-[0_0_25px_rgba(99,102,241,0.35)] transition-all duration-300 flex items-center justify-center gap-2 border border-white/30 backdrop-blur-xl"
                  >
                    <Unlock className="w-4 h-4" />
                    {isVerifyingPassword ? "Comprobando credencial..." : "Desbloquear Panel Docente"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("student")}
                    className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 text-center transition"
                  >
                    ← Regresar a la vista de estudiante
                  </button>
                </form>
              </div>
            ) : (
              /* PANEL DE PROFESOR DESBLOQUEADO */
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Barra de Sesión de Profesor con Bloqueo (Glass) */}
                <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 backdrop-blur-xl flex items-center justify-between gap-3 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-300 border border-white/20 flex items-center justify-center shadow-inner backdrop-blur-md">
                      <Unlock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs md:text-sm font-bold text-white">
                        Sesión Docente Autorizada
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Proyección dinámica y sincronización activa
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLockProfessor}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-rose-500/30 hover:text-rose-200 text-slate-300 border border-white/20 text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 backdrop-blur-md"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Bloquear Panel
                  </button>
                </div>

                {/* Selección de Asignatura (Glass) */}
                <section className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl space-y-4">
                  <div>
                    <h3 className="font-bold text-base md:text-lg text-white">
                      Proyección en Aula — Turno Sabatino
                    </h3>
                    <p className="text-xs text-slate-400">
                      Selecciona la materia activa para rotar el código QR dinámico cada 20 segundos
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {SABATINO_CLASSES.map((subj) => {
                      const isSelected = selectedClassCode === subj.code;
                      return (
                        <button
                          key={subj.code}
                          type="button"
                          onClick={() => {
                            setSelectedClassCode(subj.code);
                            generateNewQRCycle();
                          }}
                          className={`p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden active:scale-[0.98] backdrop-blur-md ${
                            isSelected
                              ? "bg-indigo-600/30 border-indigo-400/60 ring-2 ring-indigo-500/30 text-white shadow-[0_4px_25px_rgba(99,102,241,0.25)]"
                              : "bg-slate-950/40 border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-blue-400">
                              {subj.code}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 uppercase">
                              {subj.modality}
                            </span>
                          </div>
                          <div className="font-bold text-sm text-white mt-1">
                            {subj.name}
                          </div>
                          <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {subj.scheduleDisplay}
                          </div>
                          <div className="text-[10px] text-amber-300/90 font-medium mt-1">
                            Límite Presente: {subj.firstHourLimitDisplay}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            {subj.room}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* QR Dinámico Rotativo para Proyector de Aula (Cristal Luminoso) */}
                <section className="rounded-3xl p-6 md:p-8 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/70 text-white border border-white/20 shadow-[0_12px_48px_0_rgba(0,0,0,0.5)] backdrop-blur-2xl space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/15 pb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-white/20 backdrop-blur-md shadow-sm">
                          CÓDIGO QR DINÁMICO ROTATIVO
                        </span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-white/20 backdrop-blur-md">
                          1ra Hora: hasta las {activeClassObj.firstHourLimitDisplay}
                        </span>
                      </div>
                      <h2 className="text-xl md:text-2xl font-black mt-2 text-white">
                        {activeClassObj.name} ({activeClassObj.code})
                      </h2>
                      <p className="text-xs text-indigo-200 mt-0.5">
                        {activeClassObj.room} • Docente: {activeClassObj.professor}
                      </p>
                    </div>

                    <div className="w-full md:w-64 space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-indigo-200">El código QR rota en:</span>
                        <span className="font-mono text-amber-400 font-bold text-sm">{qrSecondsLeft}s</span>
                      </div>
                      <div className="w-full bg-slate-950/70 rounded-full h-2 overflow-hidden border border-white/15 shadow-inner">
                        <div
                          className="bg-amber-400 h-full transition-all duration-1000 ease-linear rounded-full shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                          style={{ width: `${(qrSecondsLeft / 20) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl shadow-2xl text-slate-950 border border-white/40">
                      <QRCodeSVG
                        value={qrDynamicUrl}
                        size={220}
                        level="H"
                        includeMargin={true}
                      />
                      <p className="text-xs font-bold text-slate-800 mt-2 text-center max-w-[220px]">
                        Escanea con tu teléfono para confirmar asistencia
                      </p>
                    </div>

                    <div className="flex flex-col items-center justify-center p-6 bg-slate-900/40 rounded-3xl border border-white/15 space-y-4 text-center backdrop-blur-xl shadow-inner">
                      <div className="space-y-1">
                        <span className="text-xs uppercase font-bold tracking-wider text-indigo-300">
                          PIN NUMÉRICO DE 4 DÍGITOS
                        </span>
                        <p className="text-xs text-slate-300">
                          Alternativa para teléfonos sin cámara o con fallas de escaneo:
                        </p>
                      </div>

                      <div className="text-6xl font-black font-mono tracking-widest text-amber-300 bg-black/50 px-8 py-4 rounded-3xl border border-white/20 shadow-inner backdrop-blur-md">
                        {qrPin}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyPin(qrPin)}
                        className="px-4 py-2 bg-indigo-700/50 hover:bg-white/20 hover:bg-indigo-600/70 text-xs font-semibold rounded-2xl transition-all duration-300 flex items-center gap-1.5 border border-white/30 backdrop-blur-md shadow-sm"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedPin ? "¡PIN Copiado al portapapeles!" : "Copiar PIN"}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Métricas y Monitoreo en Tiempo Real (Glass) */}
                <section className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950/60 border border-white/15 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl space-y-5">
                  {/* Tarjetas de Estadísticas Glass */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/15 text-center backdrop-blur-md shadow-inner">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase">Total Asistentes</span>
                      <div className="text-2xl font-black text-white mt-1">{totalStudents}</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-center backdrop-blur-md shadow-inner">
                      <span className="text-[11px] text-emerald-300 font-semibold uppercase">Presentes (A tiempo)</span>
                      <div className="text-2xl font-black text-emerald-300 mt-1">{totalPresentes}</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-center backdrop-blur-md shadow-inner">
                      <span className="text-[11px] text-amber-300 font-semibold uppercase">Tardados (Retardo)</span>
                      <div className="text-2xl font-black text-amber-300 mt-1">{totalTardados}</div>
                    </div>
                    <div className="p-4 rounded-2xl bg-blue-500/15 border border-blue-400/30 text-center backdrop-blur-md shadow-inner">
                      <span className="text-[11px] text-blue-300 font-semibold uppercase">Tasa de Puntualidad</span>
                      <div className="text-2xl font-black text-blue-300 mt-1">{punctualityRate}%</div>
                    </div>
                  </div>

                  {/* Cabecera de la Tabla */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-400/30 backdrop-blur-md shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                        Sincronizando en vivo cada 2s
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Filtro por Estado */}
                      <div className="flex bg-slate-950/60 p-1 rounded-xl border border-white/15 text-xs backdrop-blur-md shadow-inner">
                        <button
                          type="button"
                          onClick={() => setRecordsFilter("all")}
                          className={`px-2.5 py-1 rounded-lg font-semibold transition-all duration-200 ${
                            recordsFilter === "all" ? "bg-white/20 text-white shadow-sm border border-white/20" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Todos ({totalStudents})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordsFilter("presente")}
                          className={`px-2.5 py-1 rounded-lg font-semibold transition-all duration-200 ${
                            recordsFilter === "presente" ? "bg-emerald-600/80 text-white shadow-sm border border-emerald-400/30" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Presentes ({totalPresentes})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordsFilter("tardado")}
                          className={`px-2.5 py-1 rounded-lg font-semibold transition-all duration-200 ${
                            recordsFilter === "tardado" ? "bg-amber-600/80 text-white shadow-sm border border-amber-400/30" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Tardados ({totalTardados})
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleExportCSV}
                        className="px-4 py-2.5 bg-emerald-600/80 hover:bg-white/20 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-xl text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-white/30 backdrop-blur-md"
                      >
                        <Download className="w-4 h-4" />
                        Exportar CSV
                      </button>

                      <button
                        type="button"
                        onClick={handleClearRecords}
                        className="p-2.5 text-slate-300 hover:text-rose-300 rounded-xl bg-white/10 hover:bg-rose-500/30 border border-white/20 transition-all duration-300 backdrop-blur-md shadow-sm"
                        title="Reiniciar lista en servidor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Tabla de Asistencias Glass */}
                  <div className="overflow-x-auto rounded-2xl border border-white/15 bg-slate-950/50 backdrop-blur-xl shadow-inner">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/60 text-slate-300 font-semibold border-b border-white/15 backdrop-blur-md">
                        <tr>
                          <th className="p-3.5">Cédula</th>
                          <th className="p-3.5">Nombre Completo</th>
                          <th className="p-3.5">Hora Exacta</th>
                          <th className="p-3.5">Método</th>
                          <th className="p-3.5">Distancia Sede</th>
                          <th className="p-3.5">Estado Oficial</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {filteredClassRecords.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">
                              No hay registros de asistencia bajo este criterio.
                            </td>
                          </tr>
                        ) : (
                          filteredClassRecords.map((r) => (
                            <tr key={r.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-3.5 font-mono text-slate-300">{r.cedula}</td>
                              <td className="p-3.5">
                                <div className="font-semibold text-white">{r.nombre}</div>
                                {r.correo && (
                                  <div className="text-[10px] text-blue-300 font-mono flex items-center gap-1 mt-0.5">
                                    <Mail className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span>{r.correo}</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3.5 font-mono text-slate-400">{r.horaExacta}</td>
                              <td className="p-3.5">
                                <span className="text-[11px] text-slate-300">
                                  {r.metodo === "QR_SCAN" ? "Código QR" : "PIN Manual"}
                                </span>
                              </td>
                              <td className="p-3.5 font-mono text-slate-400">
                                {r.distanciaMetros}m {r.isDemo ? "(Demo)" : ""}
                              </td>
                              <td className="p-3.5">
                                <span
                                  className={`px-2.5 py-1 rounded-full font-bold text-[10px] border backdrop-blur-md ${
                                    r.estado === "Presente"
                                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
                                      : "bg-amber-500/15 text-amber-300 border-amber-400/30"
                                  }`}
                                >
                                  {r.estado}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
        )}

        {/* PIE INSTITUCIONAL */}
        <footer className="text-center text-xs text-slate-400 py-8 space-y-1.5 border-t border-white/15 mt-10">
          <p className="font-medium text-slate-300">
            IUTA • Instituto Universitario de Tecnología de Administración Industrial — Sede Principal
          </p>
          <p className="font-mono text-[11px] text-slate-400">
            Geofencing Satelital ({IUTA_SEDE.lat}°N, {IUTA_SEDE.lng}°W - Radio {IUTA_SEDE.radiusMeters}m) • Sincronización en Vivo
          </p>
        </footer>
      </main>
    </div>
  );
}
