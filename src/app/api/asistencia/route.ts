import { NextResponse } from "next/server";

export interface AttendanceRecord {
  id: string;
  cedula: string;
  nombre: string;
  claseCodigo: string;
  materiaNombre: string;
  timestamp: number;
  horaExacta: string;
  estado: "Presente" | "Tardado";
  metodo: "QR_SCAN" | "URL_PARAM" | "PIN_MANUAL";
  distanciaMetros: number;
  isDemo: boolean;
}

export interface ActiveSessionState {
  clase: string;
  token: string;
  pin: string;
  timestamp: number;
  activa: boolean;
}

interface GlobalAttendanceStore {
  session: ActiveSessionState;
  records: AttendanceRecord[];
}

declare global {
  var __IUTA_STORE__: GlobalAttendanceStore | undefined;
}

export const PROFESSOR_PASSWORD = "Labor*24";

// Horarios oficiales del turno sabatino IUTA
export const CLASS_TIME_LIMITS: Record<
  string,
  {
    name: string;
    startMinutes: number;
    endMinutes: number;
    firstHourLimitMinutes: number; // Límite para "Presente" (exactamente 1 hora después del inicio)
    startTimeDisplay: string;
    firstHourLimitDisplay: string;
    endTimeDisplay: string;
  }
> = {
  "INB-143": {
    name: "Informática Básica",
    startMinutes: 7 * 60 + 45, // 07:45 am = 465
    endMinutes: 10 * 60 + 20,  // 10:20 am = 620
    firstHourLimitMinutes: 8 * 60 + 45, // 08:45 am = 525 (1era hora)
    startTimeDisplay: "07:45 am",
    firstHourLimitDisplay: "08:45 am",
    endTimeDisplay: "10:20 am",
  },
  "MAT-143": {
    name: "Matemática",
    startMinutes: 10 * 60 + 20, // 10:20 am = 620
    endMinutes: 12 * 60 + 35,  // 12:35 pm = 755
    firstHourLimitMinutes: 11 * 60 + 20, // 11:20 am = 680 (1era hora)
    startTimeDisplay: "10:20 am",
    firstHourLimitDisplay: "11:20 am",
    endTimeDisplay: "12:35 pm",
  },
  "ALG-142": {
    name: "Algoritmos",
    startMinutes: 13 * 60 + 15, // 01:15 pm = 795
    endMinutes: 15 * 60 + 30,  // 03:30 pm = 930
    firstHourLimitMinutes: 14 * 60 + 15, // 02:15 pm = 855 (1era hora)
    startTimeDisplay: "01:15 pm",
    firstHourLimitDisplay: "02:15 pm",
    endTimeDisplay: "03:30 pm",
  },
};

/**
 * Determina si el registro es "Presente" o "Tardado":
 * Solo la primera hora de clase (startMinutes a startMinutes + 60 min) califica como "Presente".
 * Posterior a esa hora límite, se clasifica como "Tardado".
 */
export function calculateAttendanceStatus(
  claseCodigo: string,
  date: Date = new Date(),
  simulatedStatus?: "Presente" | "Tardado"
): "Presente" | "Tardado" {
  if (simulatedStatus === "Presente" || simulatedStatus === "Tardado") {
    return simulatedStatus;
  }

  const classInfo = CLASS_TIME_LIMITS[claseCodigo];
  if (!classInfo) return "Presente";

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  return currentMinutes <= classInfo.firstHourLimitMinutes ? "Presente" : "Tardado";
}

// Inicialización persistente en memoria global del proceso Node.js
if (!globalThis.__IUTA_STORE__) {
  globalThis.__IUTA_STORE__ = {
    session: {
      clase: "INB-143",
      token: "tok-inicial",
      pin: "1234",
      timestamp: Date.now(),
      activa: true,
    },
    records: [
      {
        id: "ATT-DEMO-01",
        cedula: "V-27.410.882",
        nombre: "Alejandro Rodríguez",
        claseCodigo: "INB-143",
        materiaNombre: "Informática Básica",
        timestamp: Date.now() - 1000 * 60 * 40,
        horaExacta: "08:12:15 am",
        estado: "Presente",
        metodo: "QR_SCAN",
        distanciaMetros: 12,
        isDemo: false,
      },
      {
        id: "ATT-DEMO-02",
        cedula: "V-29.004.129",
        nombre: "Mariana Silva",
        claseCodigo: "INB-143",
        materiaNombre: "Informática Básica",
        timestamp: Date.now() - 1000 * 60 * 25,
        horaExacta: "08:35:40 am",
        estado: "Presente",
        metodo: "PIN_MANUAL",
        distanciaMetros: 18,
        isDemo: false,
      },
      {
        id: "ATT-DEMO-03",
        cedula: "V-28.751.309",
        nombre: "Gabriel Fernández",
        claseCodigo: "INB-143",
        materiaNombre: "Informática Básica",
        timestamp: Date.now() - 1000 * 60 * 5,
        horaExacta: "09:05:22 am",
        estado: "Tardado",
        metodo: "QR_SCAN",
        distanciaMetros: 24,
        isDemo: false,
      },
    ],
  };
}

const store = globalThis.__IUTA_STORE__;

export async function GET() {
  return NextResponse.json({
    success: true,
    session: store.session,
    records: store.records,
    serverTime: Date.now(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // Acción 0: Validación de contraseña del profesor ("Labor*24")
    if (action === "verify_professor") {
      const { password } = body;
      const isValid = String(password || "").trim() === PROFESSOR_PASSWORD;
      return NextResponse.json({
        success: isValid,
        error: isValid ? undefined : "Contraseña de docente incorrecta.",
      });
    }

    // Acción 1: Profesor actualiza sesión activa (cada 20s con nuevo QR y PIN)
    if (action === "update_session") {
      const { clase, token, pin, timestamp, activa } = body;
      store.session = {
        clase: clase ?? store.session.clase,
        token: token ?? store.session.token,
        pin: pin ?? store.session.pin,
        timestamp: timestamp ?? Date.now(),
        activa: activa !== undefined ? activa : true,
      };
      return NextResponse.json({ success: true, session: store.session });
    }

    // Acción 2: Estudiante confirma asistencia desde su teléfono
    if (action === "register_attendance") {
      const {
        cedula,
        nombre,
        claseCodigo,
        materiaNombre,
        metodo,
        distanciaMetros,
        isDemo,
        pin,
        token,
        simulatedStatus,
      } = body;

      if (!cedula || !nombre || !claseCodigo) {
        return NextResponse.json(
          { success: false, error: "Datos de estudiante incompletos." },
          { status: 400 }
        );
      }

      if (!store.session.activa) {
        return NextResponse.json(
          { success: false, error: "La sesión del aula no se encuentra activa." },
          { status: 400 }
        );
      }

      // Validación de PIN o Token
      const cleanPin = (pin || "").toString().trim();
      const cleanToken = (token || "").toString().trim();
      const isValidPin = cleanPin === store.session.pin.trim();
      const isValidToken = cleanToken === store.session.token.trim();

      if (!isValidPin && !isValidToken) {
        return NextResponse.json(
          {
            success: false,
            error: "El código o PIN no coincide con la clase proyectada en el aula.",
          },
          { status: 400 }
        );
      }

      // Validación anti-duplicados por Cédula en la misma clase
      const cleanCi = cedula.toUpperCase().trim();
      const alreadyRegistered = store.records.some(
        (r) =>
          r.claseCodigo === claseCodigo &&
          r.cedula.toUpperCase().trim() === cleanCi
      );

      if (alreadyRegistered) {
        return NextResponse.json(
          {
            success: false,
            error: `La cédula ${cleanCi} ya tiene asistencia confirmada para la clase de ${claseCodigo}.`,
          },
          { status: 400 }
        );
      }

      const now = new Date();
      // Regla: Primera hora = "Presente", después = "Tardado"
      const estadoCalculado = calculateAttendanceStatus(claseCodigo, now, simulatedStatus);

      const record: AttendanceRecord = {
        id: "IUTA-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        cedula: cleanCi,
        nombre: nombre.trim(),
        claseCodigo,
        materiaNombre: materiaNombre || claseCodigo,
        timestamp: Date.now(),
        horaExacta: now.toLocaleTimeString("es-VE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        estado: estadoCalculado,
        metodo: metodo || "QR_SCAN",
        distanciaMetros: Number(distanciaMetros) || 0,
        isDemo: Boolean(isDemo),
      };

      store.records = [record, ...store.records];

      return NextResponse.json({
        success: true,
        record,
        total: store.records.length,
      });
    }

    // Acción 3: Limpiar registros (profesor con contraseña "Labor*24")
    if (action === "clear_records") {
      const { password } = body;
      if (password && password !== PROFESSOR_PASSWORD) {
        return NextResponse.json(
          { success: false, error: "Contraseña docente no autorizada." },
          { status: 403 }
        );
      }
      store.records = [];
      return NextResponse.json({ success: true, records: [] });
    }

    return NextResponse.json(
      { success: false, error: "Acción no reconocida." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
