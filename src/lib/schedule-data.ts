export interface SubjectSchedule {
  id: string;
  code: string;
  name: string;
  room: string;
  professorDefault: string;
  dayName: string;
  startMinutes: number; // minutes from 00:00 (e.g. 7:45 = 7*60 + 45 = 465)
  endMinutes: number;   // e.g. 10:20 = 10*60 + 20 = 620
  firstHourLimitMinutes: number; // Límite para "Presente" (startMinutes + 60)
  startTimeDisplay: string;
  firstHourLimitDisplay: string;
  endTimeDisplay: string;
  hasBreak?: boolean;
  breakStartMinutes?: number;
  breakEndMinutes?: number;
  breakDisplay?: string;
  description: string;
  color: string;
}

export const IUTA_CAMPUS_COORDINATES = {
  lat: 10.4910,
  lng: -66.8920,
  name: "IUTA - Extensión Región Capital",
  defaultAllowedRadiusMeters: 100,
};

export const SABATINO_SUBJECTS: SubjectSchedule[] = [
  {
    id: "inb-143",
    code: "INB-143",
    name: "Informática Básica",
    room: "Laboratorio de Computación 2",
    professorDefault: "Ing. R. Méndez",
    dayName: "Sábado",
    startMinutes: 7 * 60 + 45, // 07:45 am = 465
    endMinutes: 10 * 60 + 20,  // 10:20 am = 620
    firstHourLimitMinutes: 8 * 60 + 45, // 08:45 am = 525 (1era hora)
    startTimeDisplay: "07:45 am",
    firstHourLimitDisplay: "08:45 am",
    endTimeDisplay: "10:20 am",
    hasBreak: true,
    breakStartMinutes: 9 * 60 + 15, // 09:15 am = 555
    breakEndMinutes: 9 * 60 + 35,   // 09:35 am = 575
    breakDisplay: "09:15 am - 09:35 am (Receso)",
    description: "Presencial • Fundamentos de Sistemas, Hardware y Ofimática",
    color: "from-blue-600 to-indigo-600",
  },
  {
    id: "mat-143",
    code: "MAT-143",
    name: "Matemática",
    room: "Aula 104 - Módulo A",
    professorDefault: "Lic. E. Salazar",
    dayName: "Sábado",
    startMinutes: 10 * 60 + 20, // 10:20 am = 620
    endMinutes: 12 * 60 + 35,  // 12:35 pm = 755
    firstHourLimitMinutes: 11 * 60 + 20, // 11:20 am = 680 (1era hora)
    startTimeDisplay: "10:20 am",
    firstHourLimitDisplay: "11:20 am",
    endTimeDisplay: "12:35 pm",
    description: "Presencial • Álgebra Universitaria, Funciones y Cálculo",
    color: "from-emerald-600 to-teal-600",
  },
  {
    id: "alg-142",
    code: "ALG-142",
    name: "Algoritmos",
    room: "Laboratorio de Computación 1",
    professorDefault: "Prof. C. Vargas",
    dayName: "Sábado",
    startMinutes: 13 * 60 + 15, // 01:15 pm = 795
    endMinutes: 15 * 60 + 30,  // 03:30 pm = 930
    firstHourLimitMinutes: 14 * 60 + 15, // 02:15 pm = 855 (1era hora)
    startTimeDisplay: "01:15 pm",
    firstHourLimitDisplay: "02:15 pm",
    endTimeDisplay: "03:30 pm",
    description: "Presencial • Estructuras Lógicas, Pseudocódigo y Diagramación",
    color: "from-purple-600 to-violet-600",
  },
];

export interface ActiveSession {
  sessionId: string;
  subjectCode: string;
  subjectName: string;
  room: string;
  professorName: string;
  openedAt: string; // ISO
  expiresAt: string; // ISO
  pin: string; // 4 digits
  qrSecretToken: string;
  isOpen: boolean;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  subjectCode: string;
  subjectName: string;
  studentCedula: string;
  studentName: string;
  timestamp: string; // ISO string
  timeFormatted: string; // e.g. "08:12:45 am"
  status: "Presente" | "Tardado";
  isSimulatedGPS: boolean;
  distanceMeters: number;
  verificationMethod: "QR_SCAN" | "MANUAL_PIN";
}

export interface StudentProfile {
  cedula: string;
  fullName: string;
  career?: string;
}

// Calculate Haversine distance in meters
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function getCurrentSubjectByTime(date: Date = new Date()): {
  current: SubjectSchedule | null;
  next: SubjectSchedule | null;
  isLunchBreak: boolean;
  statusText: string;
} {
  const minutesNow = date.getHours() * 60 + date.getMinutes();

  // Sabatino Lunch break: 12:35 pm (755) to 01:15 pm (795)
  if (minutesNow >= 755 && minutesNow < 795) {
    return {
      current: null,
      next: SABATINO_SUBJECTS[2], // ALG-142
      isLunchBreak: true,
      statusText: "Hora de Almuerzo / Descanso (12:35 pm - 01:15 pm)",
    };
  }

  const active = SABATINO_SUBJECTS.find(
    (s) => minutesNow >= s.startMinutes && minutesNow < s.endMinutes
  );

  if (active) {
    // Check if in internal break
    if (
      active.hasBreak &&
      active.breakStartMinutes &&
      active.breakEndMinutes &&
      minutesNow >= active.breakStartMinutes &&
      minutesNow < active.breakEndMinutes
    ) {
      return {
        current: active,
        next: null,
        isLunchBreak: false,
        statusText: `En receso de ${active.name} (${active.breakDisplay})`,
      };
    }

    const nextIndex = SABATINO_SUBJECTS.findIndex((s) => s.id === active.id) + 1;
    const next = nextIndex < SABATINO_SUBJECTS.length ? SABATINO_SUBJECTS[nextIndex] : null;

    return {
      current: active,
      next,
      isLunchBreak: false,
      statusText: `Clase en curso: ${active.name} (${active.startTimeDisplay} - ${active.endTimeDisplay})`,
    };
  }

  // Before first class
  if (minutesNow < SABATINO_SUBJECTS[0].startMinutes) {
    return {
      current: null,
      next: SABATINO_SUBJECTS[0],
      isLunchBreak: false,
      statusText: `Próxima clase: ${SABATINO_SUBJECTS[0].name} a las ${SABATINO_SUBJECTS[0].startTimeDisplay}`,
    };
  }

  // After last class
  return {
    current: null,
    next: null,
    isLunchBreak: false,
    statusText: "Jornada sabatina finalizada por hoy",
  };
}
