# SygnIA — Frontend

Frontend Next.js de la sala de simulación. El roadmap y la arquitectura del proyecto están en el [README principal](../README.md).

## Requisitos

- Node.js y npm.
- Backend ejecutándose en `http://localhost:8000`.
- Chrome o Edge reciente para Web Speech API, con permiso de micrófono.
- Una `GROQ_API_KEY` configurada en el backend para respuestas generadas por IA.

## Desarrollo local

Instala dependencias e inicia Next.js desde esta carpeta:

```powershell
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). En una terminal separada, inicia FastAPI:

```powershell
cd ..\sygna-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edita .env y define GROQ_API_KEY
uvicorn main:app --reload --port 8000
```

## Flujo de voz MVP

- `useVitalsStream` recibe signos vitales desde `ws://localhost:8000/ws/vitals`.
- La sala llama a `POST /session/start` al abrir y a `POST /session/end` al finalizar; el timer se pausa fuera de una sesión.
- Al activar el micrófono, `useRealtimeAudio` usa Web Speech API para reconocer voz y envía la transcripción a `ws://localhost:8000/ws/audio`.
- FastAPI solicita una respuesta al modelo Groq configurado en backend; `window.speechSynthesis` la reproduce en el navegador.
- La velocidad (`rate`) y el tono (`pitch`) se ajustan con SpO₂ y FC. La transcripción final y parcial aparece en pantalla.

El MVP funciona por turnos, no es full-duplex ni usa OpenAI/WebRTC. El reconocimiento Web Speech API depende del navegador y puede requerir conexión a Internet. La clave de Groq no debe ir en el frontend. El uso de Groq está sujeto a los límites vigentes de su cuota gratuita. No introduzcas datos identificables: el texto reconocido se envía al backend y a Groq.
