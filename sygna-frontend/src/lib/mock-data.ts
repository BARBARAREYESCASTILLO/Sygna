import type { VitalsState } from "./types";

// Valores iniciales de respaldo hasta recibir el primer mensaje del backend.
export const mockVitals: VitalsState = {
  spo2: { label: "SpO2", value: 96, unit: "%", level: "normal" },
  heartRate: { label: "FC", value: 88, unit: "lpm", level: "warning" },
  bloodPressure: { systolic: 118, diastolic: 76, level: "normal" },
  respiratoryRate: { label: "FR", value: 18, unit: "rpm", level: "normal" },
  anxietyLevel: 5,
  healthLiteracy: 3,
};

export const mockPatientName = "Paciente simulado · 45 años";
