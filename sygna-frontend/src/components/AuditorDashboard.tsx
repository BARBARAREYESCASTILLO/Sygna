"use client";

import type { EvaluationReport } from "@/lib/types";

function scoreTone(score: number) {
  if (score >= 75) return { text: "text-[#5ce1c0]", bar: "bg-[#5ce1c0]", label: "Desempeño sólido" };
  if (score >= 50) return { text: "text-amber-300", bar: "bg-amber-300", label: "Desempeño en desarrollo" };
  return { text: "text-rose-300", bar: "bg-rose-400", label: "Requiere refuerzo" };
}

function ReportList({
  title,
  items,
  marker,
  accent,
}: {
  title: string;
  items: string[];
  marker: string;
  accent: string;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111a1e]/90 p-5">
      <h3 className={`text-xs font-semibold ${accent}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-[12px] text-[#829397]">Sin elementos reportados.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2.5 text-[12px] leading-relaxed text-[#c9d6d6]">
              <span aria-hidden="true" className={`mt-0.5 ${accent}`}>{marker}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AuditorDashboard({
  report,
  onNewSimulation,
}: {
  report: EvaluationReport;
  onNewSimulation: () => void;
}) {
  const tone = scoreTone(report.score);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-white/[0.08] bg-[#111a1e]/90 p-6">
        <p className="text-[10px] font-medium uppercase tracking-[1px] text-[#829397]">
          Informe del agente auditor
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <p className={`text-6xl font-semibold leading-none ${tone.text}`} aria-label={`Puntaje ${report.score} de 100`}>
            {report.score}
            <span className="ml-1 text-lg font-medium text-[#829397]">/100</span>
          </p>
          <p className={`pb-1 text-sm font-medium ${tone.text}`}>{tone.label}</p>
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.07]"
          role="meter"
          aria-label="Puntaje global"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={report.score}
        >
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${report.score}%` }} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ReportList title="Fortalezas" items={report.strengths} marker="✓" accent="text-[#5ce1c0]" />
        <ReportList title="Debilidades" items={report.weaknesses} marker="!" accent="text-amber-300" />
      </div>

      <section className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-5">
        <h3 className="text-xs font-semibold text-violet-300">Sesgo cognitivo detectado</h3>
        <p className="mt-2 text-[12px] leading-relaxed text-[#d6d9ee]">{report.cognitive_bias}</p>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNewSimulation}
          className="flex h-10 items-center gap-2 rounded-xl border border-[#5ce1c0]/30 bg-[#5ce1c0]/[0.09] px-4 text-[11px] font-semibold text-[#8cebd3] transition-colors hover:bg-[#5ce1c0]/[0.14]"
        >
          Nueva Simulación
        </button>
      </div>
    </div>
  );
}
