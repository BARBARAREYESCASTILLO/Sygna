"use client";

import { useEffect, useState } from "react";
import { mockVitals } from "@/lib/mock-data";
import type { AlertLevel, VitalsState } from "@/lib/types";

export type StreamStatus = "connecting" | "connected" | "disconnected" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAlertLevel(value: unknown): value is AlertLevel {
  return value === "normal" || value === "warning" || value === "critical";
}

function isVitalReading(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.value === "number" &&
    typeof value.unit === "string" &&
    isAlertLevel(value.level)
  );
}

function isVitalsState(value: unknown): value is VitalsState {
  return (
    isRecord(value) &&
    isVitalReading(value.spo2) &&
    isVitalReading(value.heartRate) &&
    isVitalReading(value.respiratoryRate) &&
    typeof value.anxietyLevel === "number" &&
    typeof value.healthLiteracy === "number" &&
    isRecord(value.bloodPressure) &&
    typeof value.bloodPressure.systolic === "number" &&
    typeof value.bloodPressure.diastolic === "number" &&
    isAlertLevel(value.bloodPressure.level)
  );
}

export function useVitalsStream() {
  const [vitals, setVitals] = useState<VitalsState>(mockVitals);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [hasLiveData, setHasLiveData] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;
    let socket: WebSocket | undefined;
    const url =
      process.env.NEXT_PUBLIC_VITALS_WS_URL ?? "ws://localhost:8000/ws/vitals";

    function connect() {
      if (!active) return;
      setStatus("connecting");
      socket = new WebSocket(url);

      socket.onopen = () => {
        setStatus("connected");
        setErrorMessage(null);
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload: unknown = JSON.parse(event.data);
          if (!isVitalsState(payload)) {
            throw new Error("El mensaje no coincide con el formato de signos vitales.");
          }
          setVitals(payload);
          setHasLiveData(true);
          setErrorMessage(null);
        } catch (error) {
          console.error("No se pudo procesar el mensaje de signos vitales:", error);
          setStatus("error");
          setErrorMessage("El backend envió datos con un formato inválido.");
        }
      };

      socket.onerror = () => {
        setStatus("error");
        setErrorMessage("No se pudo conectar con el backend de simulación.");
      };

      socket.onclose = () => {
        if (!active) return;
        setStatus("disconnected");
        retryTimer = window.setTimeout(connect, 2000);
      };
    }

    const connectTimer = window.setTimeout(connect, 0);
    return () => {
      active = false;
      if (connectTimer !== undefined) window.clearTimeout(connectTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { vitals, status, hasLiveData, errorMessage };
}
