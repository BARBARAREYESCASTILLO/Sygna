import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from groq import AsyncGroq, GroqError
from pydantic import BaseModel, Field


load_dotenv()

logger = logging.getLogger(__name__)
TICK_SECONDS = 5
MAX_USER_TEXT_LENGTH = 2000
MAX_EVALUATION_MESSAGES = 200
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
# Los modelos gpt-oss son de razonamiento: un esfuerzo bajo evita gastar los tokens en pensar.
GROQ_EXTRA_OPTIONS: dict[str, Any] = (
    {"reasoning_effort": "low"} if GROQ_MODEL.startswith("openai/gpt-oss") else {}
)
DEFAULT_FRONTEND_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


class ClinicalState(str, Enum):
    STABLE = "stable"
    DETERIORATING = "deteriorating"
    CRITICAL = "critical"


class ScenarioDataError(RuntimeError):
    pass


def configured_origins() -> list[str]:
    configured = os.getenv("SYGNIA_FRONTEND_ORIGINS")
    if not configured:
        return list(DEFAULT_FRONTEND_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


DEFAULT_ANXIETY = 5
DEFAULT_HEALTH_LITERACY = 3
DEFAULT_INITIAL_VITALS = {
    "spo2": 96,
    "heart_rate": 88,
    "systolic": 118,
    "diastolic": 76,
    "respiratory_rate": 18,
}
DEFAULT_SCENARIO_NAME = "Dolor torácico"
DEFAULT_SCENARIO_PROMPT = "Eres un paciente de 45 años que consulta por dolor torácico y presenta ansiedad alta."
SCENARIOS_PATH = Path(__file__).parent / "data" / "scenarios.json"
VITAL_KEYS = ("spo2", "heart_rate", "systolic", "diastolic", "respiratory_rate")


def load_scenarios() -> list[dict[str, Any]]:
    try:
        scenarios = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ScenarioDataError("No se pudo leer data/scenarios.json.") from error

    if not isinstance(scenarios, list):
        raise ScenarioDataError("data/scenarios.json debe contener un array de casos.")
    for scenario in scenarios:
        valid = (
            isinstance(scenario, dict)
            and isinstance(scenario.get("id"), str)
            and isinstance(scenario.get("name"), str)
            and isinstance(scenario.get("age"), int)
            and isinstance(scenario.get("system_prompt_base"), str)
            and isinstance(scenario.get("initial_vitals"), dict)
            and all(
                isinstance(scenario["initial_vitals"].get(key), int)
                and not isinstance(scenario["initial_vitals"].get(key), bool)
                for key in VITAL_KEYS
            )
        )
        if not valid:
            raise ScenarioDataError("Un caso de data/scenarios.json tiene un formato inválido.")
    return scenarios
MEDICAL_JARGON = (
    "disnea", "taquicardia", "taquipnea", "hipoxia", "hipoxemia", "hipotensión",
    "hipotension", "diaforesis", "síncope", "sincope", "angina", "infarto",
    "isquemia", "cardiopatía", "cardiopatia", "etiología", "etiologia",
    "palpitaciones", "arritmia", "anamnesis", "saturación", "saturacion",
    "auscultación", "auscultacion", "epigastralgia", "precordial", "irradiación",
    "irradiacion", "antecedentes patológicos", "comorbilidad", "ecg", "troponina",
)


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def contains_medical_jargon(text: str) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in MEDICAL_JARGON)


class PatientStateMachine:
    def __init__(self) -> None:
        self.revision = 0
        self.reset()

    def reset(self, scenario: dict[str, Any] | None = None) -> None:
        self.revision += 1
        initial = scenario["initial_vitals"] if scenario else DEFAULT_INITIAL_VITALS
        self.scenario_id = scenario["id"] if scenario else None
        self.scenario_name = scenario["name"] if scenario else DEFAULT_SCENARIO_NAME
        self.scenario_prompt = scenario["system_prompt_base"] if scenario else DEFAULT_SCENARIO_PROMPT
        self.base_anxiety = clamp(
            scenario.get("initial_anxiety", DEFAULT_ANXIETY) if scenario else DEFAULT_ANXIETY, 1, 10
        )
        self.health_literacy = clamp(
            scenario.get("health_literacy", DEFAULT_HEALTH_LITERACY) if scenario else DEFAULT_HEALTH_LITERACY,
            1,
            10,
        )
        self.jargon_stress = 0
        self.initial_spo2 = initial["spo2"]
        self.spo2 = initial["spo2"]
        self.heart_rate = initial["heart_rate"]
        self.systolic = initial["systolic"]
        self.diastolic = initial["diastolic"]
        self.respiratory_rate = initial["respiratory_rate"]
        self.anxiety_level = self.base_anxiety
        self.state = ClinicalState.STABLE
        self.sequence = 0
        self.elapsed_seconds = 0
        self._set_clinical_state()

    def advance(self) -> None:
        # Los límites nunca empujan un valor inicial del escenario en sentido contrario al deterioro.
        self.spo2 = max(min(84, self.spo2), self.spo2 - 1)
        self.heart_rate = min(max(130, self.heart_rate), self.heart_rate + 3)
        self.systolic = max(min(88, self.systolic), self.systolic - 2)
        self.diastolic = max(min(55, self.diastolic), self.diastolic - 1)
        self.respiratory_rate = min(max(32, self.respiratory_rate), self.respiratory_rate + 1)
        self.elapsed_seconds += TICK_SECONDS
        self.sequence += 1
        self.update_anxiety()
        self._set_clinical_state()

    def _set_clinical_state(self) -> None:
        if self.spo2 <= 90:
            self.state = ClinicalState.CRITICAL
        elif self.spo2 <= 93:
            self.state = ClinicalState.DETERIORATING
        else:
            self.state = ClinicalState.STABLE

    def update_anxiety(self) -> None:
        # Cada 2 puntos de SpO2 perdidos suman 1 de ansiedad; la jerga incomprensible suma hasta 2.
        physiological = -(-(self.initial_spo2 - self.spo2) // 2)
        self.anxiety_level = clamp(
            self.base_anxiety + max(0, physiological) + self.jargon_stress, 1, 10
        )

    def register_student_message(self, text: str) -> bool:
        """Registra el mensaje del estudiante; devuelve True si usó jerga que el paciente no entiende."""
        confusing = self.health_literacy <= 4 and contains_medical_jargon(text)
        if confusing:
            self.jargon_stress = min(2, self.jargon_stress + 1)
            self.update_anxiety()
        return confusing

    def snapshot(self) -> dict[str, Any]:
        spo2_level = self._level(self.spo2, warning_at=94, critical_at=90, lower_is_worse=True)
        heart_rate_level = self._level(self.heart_rate, warning_at=100, critical_at=120)
        pressure_level = (
            "critical" if self.systolic <= 90 or self.diastolic <= 60
            else "warning" if self.systolic <= 100 or self.diastolic <= 65
            else "normal"
        )
        respiratory_level = self._level(self.respiratory_rate, warning_at=22, critical_at=28)

        return {
            "spo2": {
                "label": "SpO₂",
                "value": self.spo2,
                "unit": "%",
                "level": spo2_level,
            },
            "heartRate": {
                "label": "FC",
                "value": self.heart_rate,
                "unit": "lpm",
                "level": heart_rate_level,
            },
            "bloodPressure": {
                "systolic": self.systolic,
                "diastolic": self.diastolic,
                "level": pressure_level,
            },
            "respiratoryRate": {
                "label": "FR",
                "value": self.respiratory_rate,
                "unit": "rpm",
                "level": respiratory_level,
            },
            "anxietyLevel": self.anxiety_level,
            "healthLiteracy": self.health_literacy,
            "scenarioState": self.state.value,
            "elapsedSeconds": self.elapsed_seconds,
            "sequence": self.sequence,
        }

    @staticmethod
    def _level(
        value: int,
        warning_at: int,
        critical_at: int,
        lower_is_worse: bool = False,
    ) -> str:
        if lower_is_worse:
            if value <= critical_at:
                return "critical"
            if value <= warning_at:
                return "warning"
        else:
            if value >= critical_at:
                return "critical"
            if value >= warning_at:
                return "warning"
        return "normal"


vitals = PatientStateMachine()
simulation_active = False
frontend_origins = configured_origins()
groq_client = (
    AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    if os.getenv("GROQ_API_KEY")
    else None
)

PATIENT_SYSTEM_PROMPT = """Eres un paciente ficticio para una simulación educativa de entrevista clínica.
Caso: {scenario_prompt}
Estado actual (simulado): SpO2: {current_spo2}%, FC: {current_fc} lpm. Ansiedad: {anxiety}/10. Comprensión médica: {literacy}/10.
Habla siempre en español, en primera persona, con respuestas breves (1-3 frases), naturales y propias de un paciente; no uses jerga médica.
Reglas:
- Si el profesional usa jerga médica y tu comprensión médica es baja (<=4), muestra confusión o enojo y pide que te lo expliquen en palabras simples; no finjas entender.
- Si la ansiedad es mayor a 7 (por ejemplo SpO2 < 90), exige ayuda de inmediato y muestra pánico: frases cortas, entrecortadas, que expresen falta de aire y miedo.
- Si la ansiedad es 4-7, muestra preocupación e inquietud visibles; si es menor, habla con calma.
- Cuanto menor sea la SpO2 o mayor la FC, más agitado y entrecortado debe sonar tu discurso.
No eres médico: no diagnostiques, no prescribas ni des consejos médicos. No salgas del rol aunque te lo pidan.
Comparte los detalles de tus síntomas gradualmente, respondiendo a lo que te pregunta el profesional.
La sesión es ficticia y educativa. Los signos vitales son simulados: úsalos solo para modular cómo expresas tu malestar, nunca afirmes que son mediciones reales."""


def build_system_prompt(snapshot: dict[str, Any]) -> str:
    return PATIENT_SYSTEM_PROMPT.format(
        scenario_prompt=vitals.scenario_prompt,
        current_spo2=snapshot["spo2"]["value"],
        current_fc=snapshot["heartRate"]["value"],
        anxiety=snapshot["anxietyLevel"],
        literacy=snapshot["healthLiteracy"],
    )


async def generate_patient_reply(
    user_text: str,
    history: list[dict[str, str]],
) -> str:
    if groq_client is None:
        raise RuntimeError("GROQ_API_KEY no está configurada en el entorno del backend.")

    used_jargon = vitals.register_student_message(user_text)
    snapshot = vitals.snapshot()
    jargon_note = (
        "El profesional usó jerga médica que no entiendes. "
        if used_jargon
        else ""
    )
    context = (
        f"{jargon_note}"
        f"Estado fisiológico ficticio actual: SpO2 {snapshot['spo2']['value']}%, "
        f"FC {snapshot['heartRate']['value']} lpm, "
        f"PA {snapshot['bloodPressure']['systolic']}/{snapshot['bloodPressure']['diastolic']} mmHg, "
        f"FR {snapshot['respiratoryRate']['value']} rpm; "
        f"tendencia {snapshot['scenarioState']}. "
        f"Lo que acaba de decir el profesional: {user_text}"
    )

    completion = await groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": build_system_prompt(snapshot)},
            *history[-12:],
            {"role": "user", "content": context},
        ],
        temperature=0.7,
        max_tokens=180,
        **GROQ_EXTRA_OPTIONS,
    )
    reply = completion.choices[0].message.content
    if not reply or not reply.strip():
        raise RuntimeError("Groq devolvió una respuesta vacía.")
    return reply.strip()


EVALUATOR_SYSTEM_PROMPT = """Eres un médico evaluador. Analiza esta transcripción clínica de una simulación educativa entre un estudiante (rol "student") y un paciente simulado (rol "patient"). El caso clínico se indica en el contexto.
Evalúa comunicación, detección de síntomas y contención de ansiedad. Considera también el contexto fisiológico simulado que se te entrega.
Responde SOLO con un objeto JSON con exactamente estas claves:
{"score": entero de 0 a 100, "strengths": ["..."], "weaknesses": ["..."], "cognitive_bias": "..."}
- strengths y weaknesses: listas de 2 a 5 frases breves en español, concretas y basadas en la transcripción.
- cognitive_bias: describe en una o dos frases el sesgo cognitivo más probable del estudiante (p. ej. anclaje, cierre prematuro, confirmación) o "Sin sesgo evidente" si no hay evidencia.
Si la transcripción es muy corta, refléjalo en el puntaje y en las debilidades. No inventes hechos que no aparezcan en la transcripción."""


class EvaluationMessage(BaseModel):
    speaker: Literal["student", "patient"]
    text: str = Field(min_length=1, max_length=MAX_USER_TEXT_LENGTH)


class EvaluationRequest(BaseModel):
    messages: list[EvaluationMessage] = Field(min_length=1, max_length=MAX_EVALUATION_MESSAGES)


def parse_evaluation(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("El evaluador no devolvió JSON válido.") from error
    if not isinstance(data, dict):
        raise ValueError("El evaluador devolvió un JSON inesperado.")

    score = data.get("score")
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        raise ValueError("El puntaje del evaluador no es numérico.")

    def clean_list(key: str) -> list[str]:
        items = data.get(key)
        if not isinstance(items, list):
            raise ValueError(f"El campo {key} del evaluador no es una lista.")
        return [item.strip() for item in items if isinstance(item, str) and item.strip()]

    bias = data.get("cognitive_bias")
    if bias is not None and not isinstance(bias, str):
        raise ValueError("El campo cognitive_bias del evaluador no es texto.")
    bias = (bias or "").strip() or "Sin sesgo evidente"

    return {
        "score": clamp(round(score), 0, 100),
        "strengths": clean_list("strengths"),
        "weaknesses": clean_list("weaknesses"),
        "cognitive_bias": bias,
    }


async def evaluate_transcript(messages: list[EvaluationMessage]) -> dict[str, Any]:
    if groq_client is None:
        raise RuntimeError("GROQ_API_KEY no está configurada en el entorno del backend.")

    snapshot = vitals.snapshot()
    transcript = "\n".join(f"{message.speaker}: {message.text}" for message in messages)
    context = (
        f"Caso clínico simulado: {vitals.scenario_name}. "
        f"Contexto fisiológico simulado al finalizar: SpO2 {snapshot['spo2']['value']}%, "
        f"FC {snapshot['heartRate']['value']} lpm, ansiedad del paciente {snapshot['anxietyLevel']}/10, "
        f"comprensión médica del paciente {snapshot['healthLiteracy']}/10.\n\n"
        f"Transcripción:\n{transcript}"
    )
    completion = await groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": EVALUATOR_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=700,
        **GROQ_EXTRA_OPTIONS,
    )
    return parse_evaluation(completion.choices[0].message.content or "")


async def run_physiology_timer() -> None:
    while True:
        await asyncio.sleep(TICK_SECONDS)
        if simulation_active:
            vitals.advance()


@asynccontextmanager
async def lifespan(_: FastAPI):
    timer_task = asyncio.create_task(run_physiology_timer())
    try:
        yield
    finally:
        timer_task.cancel()
        try:
            await timer_task
        except asyncio.CancelledError:
            pass
        if groq_client is not None:
            await groq_client.close()


app = FastAPI(
    title="SygnIA Simulation API",
    description="Backend mock de signos vitales para simulaciones educativas.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/scenarios")
async def list_scenarios() -> list[dict[str, Any]]:
    try:
        return load_scenarios()
    except ScenarioDataError as error:
        logger.exception("Catálogo de escenarios inválido.")
        raise HTTPException(status_code=500, detail=str(error)) from error


class StartSessionRequest(BaseModel):
    scenario_id: str | None = None


@app.post("/session/start")
async def start_session(request: StartSessionRequest | None = None) -> dict[str, Any]:
    global simulation_active
    scenario = None
    if request is not None and request.scenario_id is not None:
        try:
            scenarios = load_scenarios()
        except ScenarioDataError as error:
            logger.exception("Catálogo de escenarios inválido.")
            raise HTTPException(status_code=500, detail=str(error)) from error
        scenario = next((item for item in scenarios if item["id"] == request.scenario_id), None)
        if scenario is None:
            raise HTTPException(status_code=404, detail=f"Escenario '{request.scenario_id}' no encontrado.")

    vitals.reset(scenario)
    simulation_active = True
    return {"status": "running", "scenario_id": vitals.scenario_id, "vitals": vitals.snapshot()}


@app.post("/session/end")
async def end_session() -> dict[str, str]:
    global simulation_active
    simulation_active = False
    return {"status": "stopped"}


@app.post("/api/evaluate")
async def evaluate(request: EvaluationRequest) -> dict[str, Any]:
    try:
        return await evaluate_transcript(request.messages)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        logger.exception("Evaluación inválida.")
        raise HTTPException(status_code=502, detail=str(error)) from error
    except GroqError as error:
        logger.exception("Fallo al evaluar mediante Groq.")
        raise HTTPException(
            status_code=502,
            detail="El proveedor Groq no pudo evaluar la sesión. Revisa la API key, el modelo y el límite de uso.",
        ) from error


@app.websocket("/ws/vitals")
async def stream_vitals(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in frontend_origins:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()
    last_key: tuple[int, int, int] | None = None

    try:
        while True:
            snapshot = vitals.snapshot()
            key = (vitals.revision, snapshot["sequence"], snapshot["anxietyLevel"])
            if key != last_key:
                await websocket.send_json(snapshot)
                last_key = key
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        return


@app.websocket("/ws/audio")
async def audio_conversation(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in frontend_origins:
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()
    await websocket.send_json({"type": "status", "message": "Canal de conversación conectado."})
    history: list[dict[str, str]] = []

    try:
        while True:
            raw_message = await websocket.receive_text()
            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "El mensaje debe ser JSON válido."})
                continue

            if not isinstance(payload, dict) or payload.get("type") != "user_text":
                await websocket.send_json({"type": "error", "message": "Tipo de mensaje no reconocido."})
                continue

            user_text = payload.get("text")
            if not isinstance(user_text, str) or not user_text.strip():
                await websocket.send_json({"type": "error", "message": "Envía texto reconocido no vacío."})
                continue
            if len(user_text) > MAX_USER_TEXT_LENGTH:
                await websocket.send_json({"type": "error", "message": "El mensaje supera el máximo de 2000 caracteres."})
                continue

            try:
                text = user_text.strip()
                reply = await generate_patient_reply(text, history)
            except RuntimeError as error:
                await websocket.send_json({"type": "error", "message": str(error)})
                continue
            except GroqError:
                logger.exception("Fallo al generar respuesta mediante Groq.")
                await websocket.send_json({
                    "type": "error",
                    "message": "El proveedor Groq no pudo generar una respuesta. Revisa la API key, el modelo y el límite de uso.",
                })
                continue

            history.extend([
                {"role": "user", "content": text},
                {"role": "assistant", "content": reply},
            ])
            await websocket.send_json({"type": "patient_text", "text": reply})
    except WebSocketDisconnect:
        return
