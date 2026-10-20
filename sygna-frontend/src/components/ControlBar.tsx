"use client";

export function ControlBar({
  connected,
  evaluating,
  micMuted,
  audioStatus,
  onToggleMic,
  onToggleSession,
}: {
  connected: boolean;
  evaluating: boolean;
  micMuted: boolean;
  audioStatus: "disconnected" | "connecting" | "connected" | "error";
  onToggleMic: () => void;
  onToggleSession: () => void;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#111a1e]/90 px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-8 w-8 place-items-center rounded-full border ${
          connected
            ? "border-[#5ce1c0]/15 bg-[#5ce1c0]/[0.07] text-[#5ce1c0]"
            : "border-white/[0.08] bg-white/[0.03] text-[#829397]"
        }`} aria-hidden="true">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path d="M10 2.5v7m-4-3v3a4 4 0 0 0 8 0v-3M4 9.5a6 6 0 0 0 12 0M10 15.5v2M7 17.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <p className="text-[11px] font-medium text-[#dce7e7]">
            {connected ? "Sesión activa" : "Sesión finalizada"}
          </p>
          <p className="mt-0.5 text-[9px] text-[#829397]">
            {audioStatus === "connected"
              ? "Canal de voz conectado"
              : audioStatus === "connecting"
                ? "Conectando canal de voz…"
                : audioStatus === "error"
                  ? "Error en canal de voz"
                  : "Canal de voz inactivo"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!connected}
          aria-pressed={!micMuted && connected}
          className={`flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            micMuted || !connected
              ? "border-white/[0.1] bg-[#182226] text-[#c1cccd] hover:bg-[#202e32]"
              : "border-[#5ce1c0]/30 bg-[#5ce1c0]/[0.09] text-[#8cebd3] hover:bg-[#5ce1c0]/[0.14]"
          }`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <rect x="7" y="2.5" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.4" />
            <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            {micMuted && <path d="m4 4 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
          </svg>
          {micMuted ? "Activar micrófono" : "Silenciar"}
        </button>

        <button
          type="button"
          onClick={onToggleSession}
          disabled={evaluating}
          className={`flex h-10 items-center gap-2 rounded-xl px-3.5 text-[11px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
            connected
              ? "border border-rose-400/20 bg-rose-400/[0.08] text-rose-300 hover:bg-rose-400/[0.14]"
              : "border border-[#5ce1c0]/20 bg-[#5ce1c0]/[0.08] text-[#8cebd3] hover:bg-[#5ce1c0]/[0.14]"
          }`}
        >
          {evaluating ? (
            "Evaluando..."
          ) : connected ? (
            <>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                <rect x="5" y="5" width="10" height="10" rx="1.5" />
              </svg>
              Finalizar sesión
            </>
          ) : (
            <>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M6 3.5v13l10-6.5-10-6.5Z" />
              </svg>
              Reiniciar simulación
            </>
          )}
        </button>
      </div>
    </footer>
  );
}
