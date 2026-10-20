# Sygna — Simulador Clínico Multi-Agente en Tiempo Real

> Evolución de PRAXIA (Universidad de Chile). Master Plan y hoja de ruta estricta para los agentes de desarrollo.

## 1. Visión del Proyecto

**SygnIA** es un simulador clínico de pacientes virtuales. Su visión de largo plazo combina **voz bidireccional**, **fisiología dinámica** y **evaluación automatizada del razonamiento clínico**; el MVP actual implementa conversación por turnos, no audio full-duplex. El sistema busca complementar la práctica con paciente estandarizado mediante un agente conversacional que:

- En el MVP sostiene una entrevista oral por turnos, con transcripción del navegador y respuestas habladas del paciente.
- Modula su **timbre, ritmo y esfuerzo vocal** en función de sus signos vitales simulados (p. ej. una SpO2 en caída se traduce en habla entrecortada y taquipneica).
- Ajusta dinámicamente su **nivel de alfabetización en salud y ansiedad** durante la conversación, obligando al estudiante a adaptar su comunicación (lenguaje técnico vs. coloquial, contención emocional, etc.).
- Es auditado por un **segundo agente de IA (el "Auditor")** que analiza la transcripción completa post-simulación para detectar **sesgo de anclaje** (anchoring bias): cuando el estudiante fija un diagnóstico temprano y descarta o ignora evidencia posterior que lo contradice.

Sygna se compone de 4 pilares técnicos:

1. **Voz conversacional por turnos (MVP)** — Web Speech API reconoce la voz en el navegador; un WebSocket lleva el texto a Groq y `speechSynthesis` reproduce la respuesta. No es full-duplex ni usa WebRTC/OpenAI.
2. **Voz modulada por signos vitales** — El motor fisiológico server-side altera los signos vitales simulados; el MVP adapta la velocidad y el tono de la voz sintetizada por el navegador en función de SpO₂ y FC.
3. **Alfabetización sanitaria dinámica** — El prompt del sistema del paciente se reescribe en tiempo real según el estado clínico y emocional, cambiando el vocabulario, la comprensión y el nivel de colaboración del paciente simulado.
4. **Auditoría de sesgo de anclaje** — Un agente LLM independiente evalúa la transcripción + el registro de signos vitales para producir un dashboard con hallazgos, momentos críticos ignorados y una puntuación de sesgo de anclaje.

## 2. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Front-end | **Next.js 16 (App Router) + React + TypeScript** | App web con soporte para Web APIs de voz y componentes de UI en tiempo real. |
| Estilos | **Tailwind CSS 4** | Maquetado y theming de la UI clínica (monitores, tarjetas y dashboards). |
| Estado en tiempo real (cliente) | **Zustand** o **React Context** + WebSocket hooks | Manejo ligero del estado de signos vitales y transcripción sin overhead de Redux. |
| Motor clínico (backend) | **Python 3.11+ / FastAPI** | Async nativo, ideal para WebSockets, tareas periódicas (loop fisiológico) e integración con SDKs de IA. |
| Comunicación en tiempo real | **WebSockets (FastAPI)** para signos vitales y texto conversacional; Web Speech API y `speechSynthesis` en el navegador | Evita procesar audio en el backend en el MVP y separa texto, fisiología y presentación de voz. |
| Voz / LLM | **Groq API** mediante SDK Python; modelo configurable con `GROQ_MODEL` | Inferencia por turnos; requiere una API key de Groq y está sujeta a disponibilidad y límites de la cuota gratuita. |
| Persistencia | **SQLite** (desarrollo) → **PostgreSQL** (producción), vía **SQLAlchemy** | Migración simple; suficiente para sesiones, transcripciones y reportes de auditoría. |
| Testing | **Vitest/Playwright** (front), **pytest** (back) | Cobertura de componentes UI y lógica fisiológica/auditoría. |
| Infraestructura local | **Docker Compose** (opcional, fase posterior) | Orquestar frontend + backend + DB de forma reproducible. |

## 3. Hoja de Ruta de Desarrollo (ESTRICTAMENTE SECUENCIAL)

> ⚠️ **Regla de oro:** ninguna fase comienza hasta que la anterior esté completa y aprobada. No se debe adelantar trabajo de una fase posterior (p. ej. no conectar backend real durante la Fase 1).

### Fase 1 — Máscara de Interfaz (Front-End Estático) — COMPLETADA

**Objetivo:** construir la UI de sala de simulación y verificar sus controles con datos mock antes de conectar el backend.

Tareas:
1. Inicializar proyecto Next.js + TypeScript + Tailwind + `shadcn/ui`.
2. Construir el **layout de sala de simulación** con 3 zonas:
   - **Monitor de signos vitales** (estilo monitor hospitalario): tarjetas/paneles para **SpO2 (%)**, **Frecuencia Cardíaca (lpm)**, **Presión Arterial (sistólica/diastólica)**, con colores de alerta (verde/amarillo/rojo) y valores mock hardcodeados.
   - **Panel central del paciente**: avatar o visualizador de ondas de voz (waveform animado con CSS/SVG, sin audio real todavía), con estado textual (ej. "Hablando", "Escuchando", "En silencio").
   - **Panel de transcripción en vivo**: lista de burbujas de chat (estudiante / paciente) con scroll automático, usando datos mock.
3. Construir la **barra de controles**: botón de Micrófono (toggle mute/unmute visual), botón "End Sim" (finalizar simulación), indicador de estado de conexión (mock).
4. Aplicar diseño responsive y tema clínico (paleta clara, tipografía legible, alto contraste para alertas).
5. Componentizar todo (`VitalsMonitor`, `PatientPanel`, `TranscriptPanel`, `ControlBar`) para que en fases posteriores solo se reemplacen los datos mock por datos reales, sin rehacer la UI.
6. Entregable completado: sala responsive con monitor, paciente virtual, transcripción y controles visuales.

### Fase 2 — Motor Fisiológico (Backend Mockup) — COMPLETADA

**Objetivo:** crear el servidor que simula el paso del tiempo clínico y expone signos vitales dinámicos al frontend.

Tareas:
1. Inicializar el backend FastAPI en `sygna-backend/` con entorno virtual Python propio.
2. Crear una máquina de estados de **fisiología simulada** (SpO₂, FC, PA sistólica/diastólica y frecuencia respiratoria) que representa deterioro progresivo durante una sesión activa.
3. Implementar un loop asíncrono (`asyncio.create_task`) que actualiza los valores cada 5 segundos solo mientras la simulación esté activa.
4. Exponer:
   - Un endpoint WebSocket (`/ws/vitals`) que transmite cada actualización al frontend.
   - Endpoints `POST /session/start` (reinicia valores base e inicia el timer) y `POST /session/end` (pausa el timer).
   - Un endpoint `GET /health` para comprobar que el backend está disponible.
5. Conectar `VitalsMonitor` al WebSocket y controlar el ciclo de sesión desde Next.js.
6. Entregable implementado: signos vitales dinámicos en la UI, sin voz ni LLM. Los valores son didácticos y no tienen finalidad clínica.

### Fase 3 — Voz por turnos sin costo de OpenAI — IMPLEMENTADA

**Objetivo:** habilitar una entrevista oral por turnos mediante Web Speech API, Groq y voz sintetizada por el navegador, sin OpenAI ni WebRTC.

Tareas:
1. Reconocer voz en el navegador (Web Speech API), con mensajes de error para permisos, falta de voz y navegadores incompatibles.
2. Enviar texto al WebSocket backend `/ws/audio`; generar respuestas con el paciente ficticio de Box 1 (45 años, dolor torácico, ansiedad alta) y conservar el contexto de conversación durante la sesión.
3. Mantener la clave de Groq solo en backend mediante `GROQ_API_KEY`. El modelo se configura con `GROQ_MODEL`; el valor predeterminado es `openai/gpt-oss-20b`, porque `llama3-8b-8192` fue retirado y `llama-3.1-8b-instant` no estaba disponible en la cuenta de prueba. Consulta los modelos de tu cuenta con `Groq().models.list()`.
4. Reproducir respuestas con `window.speechSynthesis`; ajustar `rate` usando SpO₂ y `pitch` usando FC.
5. Mostrar transcripción final e intermedia en pantalla; pausar el reconocimiento mientras habla la síntesis para evitar eco.
6. Entregable implementado: interacción funcional por turnos, sujeta a disponibilidad de Web Speech API, una clave de Groq y límites del free tier. No es full-duplex ni se garantiza cuota gratuita permanente.

### Fase 4 — Inyección del Prompt Dinámico

**Objetivo:** conectar el motor fisiológico con el LLM para que el paciente "sienta" y "hable" según su estado clínico y emocional.

Tareas:
1. Diseñar un **prompt base del paciente** (persona, historia clínica, personalidad) parametrizable por variables de estado (ansiedad, dolor, nivel de alfabetización en salud, gravedad clínica).
2. Crear un módulo que traduzca el estado fisiológico (de la Fase 2) en:
   - **Instrucciones de estilo/prosodia** para el TTS (velocidad, tono, pausas, esfuerzo respiratorio) cuando los signos vitales se deterioran.
   - **Ajustes de vocabulario y comprensión** (alfabetización sanitaria dinámica): un paciente con baja alfabetización usa lenguaje coloquial y necesita explicaciones simples; a mayor ansiedad, respuestas más cortas, interrupciones o pedidos de repetición.
3. Actualizar el contexto del prompt en cada turno del WebSocket; con el MVP por turnos no se utiliza `session.update` ni audio streaming.
4. Sincronizar: cuando el motor fisiológico dispare un evento (ej. caída de SpO2), el LLM debe reflejarlo verbalmente en segundos (habla entrecortada, quejas, confusión).
5. Registrar en el backend la línea de tiempo completa (vitals + transcripción + eventos de prompt) para uso en la Fase 5.
6. Entregable: el paciente cambia su forma de hablar y de expresarse de forma creíble en función de su estado clínico en tiempo real.

### Fase 5 — Agente Auditor (Dashboard de Evaluación)

**Objetivo:** construir la pantalla post-simulación que analiza el desempeño del estudiante y detecta sesgo de anclaje.

Tareas:
1. Al finalizar la sesión ("End Sim"), congelar y persistir: transcripción completa, línea de tiempo de signos vitales y eventos clínicos disparados.
2. Implementar el **Agente Auditor** (llamada LLM separada, con su propio prompt de evaluación clínica) que reciba la transcripción + línea de tiempo y produzca un análisis estructurado (JSON) con:
   - Hipótesis diagnósticas mencionadas por el estudiante y el momento en que las planteó.
   - Evidencia clínica relevante que apareció después y si el estudiante la incorporó o la ignoró.
   - Puntuación de **sesgo de anclaje** (baja/media/alta) con justificación y citas textuales de la transcripción.
   - Recomendaciones de mejora.
3. Construir el **Dashboard de Evaluación** (nueva ruta en Next.js) con: resumen ejecutivo, línea de tiempo interactiva (vitals + eventos + hipótesis marcadas), sección de hallazgos de sesgo de anclaje y score final.
4. Persistir los reportes en base de datos para revisión histórica (por estudiante/sesión).
5. Entregable: al terminar una simulación, el estudiante/docente accede a un reporte completo y accionable sobre el razonamiento clínico exhibido.

## 4. Instrucciones de Inicio Rápido

> Ejecutar el frontend y el backend en terminales separadas.

### Frontend (Next.js)

```powershell
cd sygna-frontend
npm install
npm run dev
```

### Backend (FastAPI)

```powershell
cd sygna-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edita .env y define GROQ_API_KEY con tu clave de Groq
uvicorn main:app --reload --port 8000
```

El frontend se conecta por defecto a `ws://localhost:8000/ws/vitals` y `ws://localhost:8000/ws/audio`. Para cambiar esos destinos, define `NEXT_PUBLIC_VITALS_WS_URL` y `NEXT_PUBLIC_AUDIO_WS_URL`. La clave de Groq solo debe estar en `sygna-backend/.env`, nunca en variables `NEXT_PUBLIC_*`. Usa localhost o HTTPS para permitir el micrófono. El backend permite por defecto los orígenes `http://localhost:3000` y `http://127.0.0.1:3000`; se pueden reemplazar con `SYGNIA_FRONTEND_ORIGINS` como lista separada por comas.

### Variables futuras

Groq ofrece cuotas y límites que pueden cambiar; confirma la disponibilidad y límites de tu cuenta antes de desplegar. Esta versión no usa OpenAI. La configuración de persistencia se incorporará en una fase futura.

---

**Estado actual:** Fases 1, 2 y 3 implementadas. La conversación LLM requiere una `GROQ_API_KEY` válida en el backend; la fase no se ha probado contra una cuenta real de Groq.
