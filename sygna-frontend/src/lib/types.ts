export type AlertLevel = "normal" | "warning" | "critical";

export interface VitalReading {
  label: string;
  value: number;
  unit: string;
  level: AlertLevel;
}

export interface VitalsState {
  spo2: VitalReading;
  heartRate: VitalReading;
  bloodPressure: {
    systolic: number;
    diastolic: number;
    level: AlertLevel;
  };
  respiratoryRate: VitalReading;
  anxietyLevel: number;
  healthLiteracy: number;
}

export type Speaker = "student" | "patient";

export interface TranscriptMessage {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp: string;
}

export type PatientVoiceState = "speaking" | "listening" | "idle";

export interface Scenario {
  id: string;
  name: string;
  age: number;
  chief_complaint?: string;
}

export interface EvaluationReport {
  score: number;
  strengths: string[];
  weaknesses: string[];
  cognitive_bias: string;
}

export interface ConnectionState {
  connected: boolean;
  micMuted: boolean;
  patientVoiceState: PatientVoiceState;
}
