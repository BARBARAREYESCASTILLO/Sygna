"use client";

import { useEffect, useRef } from "react";
import type { TranscriptMessage } from "@/lib/types";

export function TranscriptPanel({
  messages,
  draft,
}: {
  messages: TranscriptMessage[];
  draft: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, draft]);

  return (
    <section className="flex min-h-[300px] flex-col rounded-2xl border border-white/[0.08] bg-[#111a1e]/90 p-4 sm:p-5" aria-label="Transcripción de la sesión">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#70c8ef]/15 bg-[#70c8ef]/[0.07] text-[#70c8ef]" aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path d="M4 5.5h12M4 9.5h12M4 13.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M3 2.5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-xs font-semibold text-[#dce7e7]">Transcripción</h2>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-white/[0.07] px-2 py-1 text-[9px] text-[#91a2a5]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#70c8ef]" />
          CONVERSACIÓN
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && !draft && (
          <p className="py-10 text-center text-[11px] text-[#75878a]">
            Activa el micrófono y comienza la entrevista.
          </p>
        )}
        {messages.map((message) => {
          const isStudent = message.speaker === "student";
          return (
            <div
              key={message.id}
              className={`flex ${isStudent ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[88%] ${isStudent ? "items-end" : "items-start"} flex flex-col`}>
                <span className="mb-1 px-1 text-[9px] font-medium uppercase tracking-[0.7px] text-[#75878a]">
                  {isStudent ? "Tú · profesional" : "Paciente"}
                </span>
                <div className={`rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  isStudent
                    ? "rounded-br-[5px] border border-[#70c8ef]/10 bg-[#1d3943] text-[#dcecf0]"
                    : "rounded-bl-[5px] border border-white/[0.06] bg-[#1b262a] text-[#d1dcdd]"
                }`}>
                  <p>{message.text}</p>
                  <span className="mt-1.5 block text-right text-[9px] tabular-nums text-[#829397]">
                    {message.timestamp}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {draft && (
          <div className="flex justify-end" role="status" aria-live="polite">
            <div className="flex max-w-[88%] flex-col items-end">
              <span className="mb-1 px-1 text-[9px] font-medium uppercase tracking-[0.7px] text-[#75878a]">
                Tú · transcribiendo
              </span>
              <div className="rounded-2xl rounded-br-[5px] border border-[#70c8ef]/10 bg-[#1d3943]/60 px-3.5 py-2.5 text-[12px] italic leading-relaxed text-[#dcecf0]">
                {draft}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
