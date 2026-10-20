"use client";

import type { AlertLevel, VitalsState } from "@/lib/types";
import type { StreamStatus } from "@/lib/use-vitals-stream";

const levelStyles: Record<AlertLevel, string> = {
  normal: "text-emerald-300",
  warning: "text-amber-300",
  critical: "text-rose-300",
};

function VitalCard({
  label,
  value,
  unit,
  level,
  trace,
}: {
  label: string;
  value: string;
  unit: string;
  level: AlertLevel;
  trace: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#10191d] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[1px] text-[#91a2a5]">
          {label}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full bg-current ${levelStyles[level]}`} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[29px] font-medium leading-none tracking-tight text-[#e5eeee] tabular-nums">
          {value}
        </span>
        <span className="text-[11px] text-[#7f9295]">{unit}</span>
      </div>
      <svg
        aria-hidden="true"
        className={`mt-3 h-7 w-full ${levelStyles[level]}`}
        viewBox="0 0 240 28"
        preserveAspectRatio="none"
      >
        <path d={trace} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function VitalsMonitor({
  vitals,
  status,
  hasLiveData,
  errorMessage,
}: {
  vitals: VitalsState;
  status: StreamStatus;
  hasLiveData: boolean;
  errorMessage: string | null;
}) {
  const streamLabel =
    status === "connected" && hasLiveData
      ? "BACKEND EN VIVO"
      : status === "connecting"
        ? "CONECTANDO"
        : hasLiveData
          ? "ÚLTIMOS DATOS"
          : "DATOS INICIALES";

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111a1e]/90 p-4 sm:p-5" aria-label="Monitor de signos vitales simulados">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#5ce1c0]/15 bg-[#5ce1c0]/[0.07] text-[#5ce1c0]" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M2 10h4l2-5 3.5 10 2-5H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-xs font-semibold text-[#dce7e7]">Monitor de signos vitales</h2>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-[#75878a]" title={errorMessage ?? undefined}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            status === "connected" && hasLiveData
              ? "bg-[#5ce1c0]"
              : status === "connecting"
                ? "animate-pulse bg-amber-300"
                : "bg-rose-300"
          }`} />
          {streamLabel}
        </span>
      </div>
      {errorMessage && (
        <p className="mb-3 text-[10px] text-rose-200" role="status">
          {errorMessage}{" "}
          {hasLiveData
            ? "Se conservan los últimos valores recibidos."
            : "Se muestran los valores iniciales simulados mientras se restablece la conexión."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <VitalCard
          label="SpO₂"
          value={String(vitals.spo2.value)}
          unit={vitals.spo2.unit}
          level={vitals.spo2.level}
          trace="M0 16h22l5-2 4 3 5-12 5 17 5-8 4 2h26l4-2 4 1h18l4-4 4 7 5-2h22l4-2 4 1h20l4-3 4 7 5-4h29"
        />
        <VitalCard
          label="Frecuencia cardíaca"
          value={String(vitals.heartRate.value)}
          unit={vitals.heartRate.unit}
          level={vitals.heartRate.level}
          trace="M0 15h19l5-2 4 4 5-10 5 15 5-9 4 2h24l5-3 4 2h19l5-3 4 5 5-2h24l4-2 4 2h17l5-4 4 8 5-4h30"
        />
        <VitalCard
          label="Presión arterial"
          value={`${vitals.bloodPressure.systolic}/${vitals.bloodPressure.diastolic}`}
          unit="mmHg"
          level={vitals.bloodPressure.level}
          trace="M0 16h25l6-1 5 1h25l5-2 5 2h27l5-1 4 1h30l5-2 5 2h28l5-1 5 1h28l5-2 5 2h17"
        />
        <VitalCard
          label="Frecuencia respiratoria"
          value={String(vitals.respiratoryRate.value)}
          unit={vitals.respiratoryRate.unit}
          level={vitals.respiratoryRate.level}
          trace="M0 15c12 0 12-8 24-8s12 8 24 8 12-7 24-7 12 7 24 7 12-8 24-8 12 8 24 8 12-7 24-7 12 7 24 7 12-8 24-8 12 8 22 8"
        />
      </div>
    </section>
  );
}
