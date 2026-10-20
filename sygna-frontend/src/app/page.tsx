"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VitalsMonitor } from "@/components/VitalsMonitor";
import { PatientPanel } from "@/components/PatientPanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ControlBar } from "@/components/ControlBar";
import { mockPatientName } from "@/lib/mock-data";
import { AuditorDashboard } from "@/components/AuditorDashboard";
import type { EvaluationReport, Scenario } from "@/lib/types";
import { useRealtimeAudio } from "@/lib/use-realtime-audio";
import { useVitalsStream } from "@/lib/use-vitals-stream";

function isScenarioList(value: unknown): value is Scenario[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.age === "number",
    )
  );
}

function isEvaluationReport(value: unknown): value is EvaluationReport {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const isStringList = (list: unknown) =>
    Array.isArray(list) && list.every((item) => typeof item === "string");
  return (
    typeof candidate.score === "number" &&
    isStringList(candidate.strengths) &&
    isStringList(candidate.weaknesses) &&
    typeof candidate.cognitive_bias === "string"
  );
}

export default function SimulationRoom() {
  const [connected, setConnected] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const vitalsStream = useVitalsStream();
  const audio = useRealtimeAudio(vitalsStream.vitals, connected);
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId);

  const setBackendSessionActive = useCallback(async (active: boolean, scenarioId?: string) => {
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    try {
      const response = await fetch(`${apiBaseUrl}/session/${active ? "start" : "end"}`, {
        method: "POST",
        ...(active && scenarioId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scenario_id: scenarioId }),
            }
          : {}),
      });
      if (!response.ok) {
        throw new Error(`El backend respondió con estado ${response.status}.`);
      }
      setSessionError(null);
    } catch (error) {
      console.error("No se pudo actualizar la sesión fisiológica:", error);
      setSessionError("No se pudo iniciar o detener el motor fisiológico. Comprueba que FastAPI esté activo.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    async function loadScenariosAndStart() {
      let firstId: string | undefined;
      try {
        const response = await fetch(`${apiBaseUrl}/api/scenarios`);
        if (!response.ok) throw new Error(`El backend respondió con estado ${response.status}.`);
        const payload: unknown = await response.json();
        if (!isScenarioList(payload)) throw new Error("El catálogo de escenarios tiene un formato inválido.");
        if (!active) return;
        setScenarios(payload);
        firstId = payload[0]?.id;
        if (firstId) setSelectedScenarioId(firstId);
        setScenariosError(null);
      } catch (error) {
        console.error("No se pudieron cargar los escenarios:", error);
        if (!active) return;
        setScenariosError("No se pudieron cargar los escenarios clínicos. Comprueba que FastAPI esté activo.");
      }
      if (active) await setBackendSessionActive(true, firstId);
    }

    const startTimer = window.setTimeout(() => void loadScenariosAndStart(), 0);
    return () => {
      active = false;
      window.clearTimeout(startTimer);
    };
  }, [setBackendSessionActive]);

  function handleScenarioChange(scenarioId: string) {
    setSelectedScenarioId(scenarioId);
    if (connected) void setBackendSessionActive(true, scenarioId);
  }

  async function evaluateSession() {
    const transcript = audio.messages.map(({ speaker, text }) => ({ speaker, text }));
    if (transcript.length === 0) {
      setEvaluationError("No hay conversación para evaluar. Habla con el paciente antes de finalizar.");
      return;
    }
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    setEvaluating(true);
    setEvaluationError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: transcript }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string"
            ? payload.detail
            : `El backend respondió con estado ${response.status}.`;
        throw new Error(detail);
      }
      if (!isEvaluationReport(payload)) {
        throw new Error("El informe recibido tiene un formato inválido.");
      }
      setReport(payload);
    } catch (error) {
      console.error("No se pudo evaluar la sesión:", error);
      setEvaluationError(error instanceof Error ? error.message : "No se pudo evaluar la sesión.");
    } finally {
      setEvaluating(false);
    }
  }

  function handleToggleSession() {
    if (connected) {
      setConnected(false);
      void setBackendSessionActive(false);
      void evaluateSession();
      return;
    }
    setEvaluationError(null);
    setConnected(true);
    void setBackendSessionActive(true, selectedScenarioId || undefined);
  }

  function handleNewSimulation() {
    setReport(null);
    setEvaluationError(null);
    setConnected(true);
    void setBackendSessionActive(true, selectedScenarioId || undefined);
  }

  return (
    <main className="simulation-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="SygnIA, inicio">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span className="brand-name">Sygn<span>IA</span></span>
        </Link>
        <div className="topbar-divider" />
        <span className="topbar-label">ENTRENAMIENTO CLÍNICO</span>
        <div className="topbar-status">
          <span className={`status-dot ${connected ? "is-online" : ""}`} />
          {connected ? "Entorno de simulación" : "Sesión finalizada"}
        </div>
      </header>

      <section className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">CENTRO DE SIMULACIÓN <span>/</span> CASO 014</p>
            <h1>Sala de simulación</h1>
            <p className="page-description">
              Entrevista clínica simulada <span className="heading-separator">·</span>{" "}
              {selectedScenario?.name ?? "Dolor torácico"}
            </p>
          </div>
          {report ? (
            <div className="scenario-badge">
              <span className="scenario-icon" aria-hidden="true">✳</span>
              Escenario de práctica
            </div>
          ) : (
            <label className="flex flex-col gap-1.5 text-[10px] font-medium uppercase tracking-[0.8px] text-[#829397]">
              Caso clínico
              <select
                value={selectedScenarioId}
                onChange={(event) => handleScenarioChange(event.target.value)}
                disabled={
                  scenarios.length === 0 ||
                  evaluating ||
                  (connected && audio.messages.length > 0)
                }
                title={
                  connected && audio.messages.length > 0
                    ? "Finaliza la sesión para cambiar de caso."
                    : undefined
                }
                className="h-10 min-w-[260px] rounded-xl border border-white/[0.1] bg-[#182226] px-3 text-[12px] font-medium normal-case tracking-normal text-[#dce7e7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scenarios.length === 0 && <option value="">Cargando casos…</option>}
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {report ? (
          <AuditorDashboard report={report} onNewSimulation={handleNewSimulation} />
        ) : (
          <>
            <VitalsMonitor
              vitals={vitalsStream.vitals}
              status={vitalsStream.status}
              hasLiveData={vitalsStream.hasLiveData}
              errorMessage={vitalsStream.errorMessage}
            />

            <div className="session-grid">
              <PatientPanel
                patientName={
                  selectedScenario
                    ? `Paciente simulado · ${selectedScenario.age} años`
                    : mockPatientName
                }
                chiefComplaint={selectedScenario?.chief_complaint ?? "dolor torácico"}
                voiceState={audio.voiceState}
                anxietyLevel={vitalsStream.vitals.anxietyLevel}
                healthLiteracy={vitalsStream.vitals.healthLiteracy}
              />
              <TranscriptPanel messages={audio.messages} draft={audio.draft} />
            </div>

            <ControlBar
              connected={connected}
              evaluating={evaluating}
              micMuted={!audio.micEnabled}
              audioStatus={audio.status}
              onToggleMic={audio.toggleMic}
              onToggleSession={handleToggleSession}
            />
            {[audio.error, sessionError, evaluationError, scenariosError].map(
              (message) =>
                message && (
                  <p key={message} className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-[11px] leading-relaxed text-rose-200" role="alert">
                    {message}
                  </p>
                ),
            )}
          </>
        )}

        <p className="simulation-disclaimer">
          <span aria-hidden="true">ⓘ</span>
          Datos ficticios. La voz se procesa con Web Speech API y su transcripción se envía a Groq; no ingreses datos identificables. No es un dispositivo médico.
        </p>
      </section>
    </main>
  );
}
