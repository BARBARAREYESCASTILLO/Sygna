"use client";

import type { PatientVoiceState } from "@/lib/types";

const stateLabels: Record<PatientVoiceState, string> = {
  speaking: "Hablando",
  listening: "Escuchando",
  idle: "En espera",
};

const stateStyles: Record<PatientVoiceState, string> = {
  speaking: "border-sky-400/20 bg-sky-400/[0.08] text-sky-300",
  listening: "border-violet-400/20 bg-violet-400/[0.08] text-violet-300",
  idle: "border-white/[0.09] bg-white/[0.03] text-[#a0adaf]",
};

const waveformBars = [8, 16, 11, 22, 14, 27, 17, 11, 23, 15, 9, 19, 13, 25, 10, 18];

function StateBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  const clamped = Math.max(0, Math.min(10, value));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-[#9fb0b2]">
        <span>{label}</span>
        <span>{clamped}/10</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={clamped}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${clamped * 10}%` }} />
      </div>
    </div>
  );
}

export function PatientPanel({
  patientName,
  chiefComplaint,
  voiceState,
  anxietyLevel,
  healthLiteracy,
}: {
  patientName: string;
  chiefComplaint: string;
  voiceState: PatientVoiceState;
  anxietyLevel: number;
  healthLiteracy: number;
}) {
  const isSpeaking = voiceState === "speaking";

  return (
    <section className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111a1e]/90 px-5 py-6">
      <div className="mb-5 flex w-full items-center justify-between">
        <h2 className="text-xs font-semibold text-[#dce7e7]">Paciente virtual</h2>
        <span className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.8px] text-[#829397]">
          CASO 014
        </span>
      </div>

      <div className="relative grid h-[118px] w-[118px] place-items-center rounded-full border border-[#5ce1c0]/20 bg-[radial-gradient(circle_at_50%_35%,rgba(92,225,192,0.13),rgba(19,35,38,0.95)_68%)]">
        <div className="grid h-[88px] w-[88px] place-items-center rounded-full border border-white/[0.06] bg-[#1c2b2e]">
          <svg aria-label="Avatar ilustrado del paciente" role="img" viewBox="0 0 80 80" className="h-[66px] w-[66px]">
            <circle cx="40" cy="29" r="14" fill="#9BAEAA" />
            <path d="M15 70c1-15 11-24 25-24s24 9 25 24" fill="#647C79" />
            <path d="M26 26c1-11 7-17 15-17 9 0 15 7 15 17-4-4-8-6-15-6s-11 2-15 6Z" fill="#314541" />
          </svg>
        </div>
        {isSpeaking && (
          <span className="absolute inset-[-5px] rounded-full border border-sky-300/40 animate-ping" />
        )}
      </div>

      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-[#e3eceb]">{patientName}</p>
        <p className="mt-1 text-[11px] text-[#839497]">Motivo de consulta: {chiefComplaint}</p>
        <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${stateStyles[voiceState]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {stateLabels[voiceState]}
        </span>
      </div>

      <div className="mt-4 w-full space-y-2.5">
        <StateBar label="Ansiedad" value={anxietyLevel} tone={anxietyLevel > 7 ? "bg-rose-400" : anxietyLevel >= 5 ? "bg-amber-300" : "bg-[#5ce1c0]"} />
        <StateBar label="Comprensión médica" value={healthLiteracy} tone="bg-sky-400" />
      </div>

      <div className="mt-5 flex h-7 items-center gap-[3px]" aria-label="Visualización de audio simulada">
        {waveformBars.map((height, index) => (
          <span
            key={index}
            className={`w-[3px] rounded-full bg-[#5ce1c0] transition-all ${isSpeaking ? "animate-bounce opacity-80" : "opacity-25"}`}
            style={{ height: `${height}px`, animationDelay: `${index * 55}ms` }}
          />
        ))}
      </div>
      <p className="mt-1 text-[9px] uppercase tracking-[1px] text-[#65777a]">Voz del navegador</p>
    </section>
  );
}
