"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PatientVoiceState, TranscriptMessage, VitalsState } from "@/lib/types";

type AudioConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}

interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}

interface RecognitionErrorEvent extends Event {
  readonly error?: string;
}

interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type ConversationMessage =
  | { type: "status"; message: string }
  | { type: "patient_text"; text: string }
  | { type: "error"; message: string };

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognizer;
    webkitSpeechRecognition?: new () => SpeechRecognizer;
  }
}

function formatTimestamp(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}

function createMessage(speaker: TranscriptMessage["speaker"], text: string, startedAt: number): TranscriptMessage {
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    speaker,
    text,
    timestamp: formatTimestamp(startedAt),
  };
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  if (value.type === "status") return "message" in value && typeof value.message === "string";
  if (value.type === "patient_text") return "text" in value && typeof value.text === "string";
  if (value.type === "error") return "message" in value && typeof value.message === "string";
  return false;
}

export function useRealtimeAudio(vitals: VitalsState, sessionActive: boolean) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [micEnabled, setMicEnabled] = useState(false);
  const [status, setStatus] = useState<AudioConnectionStatus>("disconnected");
  const [voiceState, setVoiceState] = useState<PatientVoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const recognitionRunningRef = useRef(false);
  const micEnabledRef = useRef(false);
  const pausedForReplyRef = useRef(false);
  const vitalsRef = useRef(vitals);
  const sessionStartedAtRef = useRef(0);
  const previousSessionActiveRef = useRef(sessionActive);

  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);

  const stopListening = useCallback(() => {
    micEnabledRef.current = false;
    pausedForReplyRef.current = false;
    setMicEnabled(false);
    setDraft("");
    setVoiceState("idle");
    setStatus("disconnected");
    if (recognitionRunningRef.current) recognitionRef.current?.abort();
    recognitionRef.current = null;
    recognitionRunningRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
    window.speechSynthesis?.cancel();
  }, []);

  const pauseListening = useCallback(() => {
    micEnabledRef.current = false;
    setMicEnabled(false);
    setDraft("");
    setVoiceState(window.speechSynthesis?.speaking || window.speechSynthesis?.pending ? "speaking" : "idle");
    if (recognitionRunningRef.current) recognitionRef.current?.stop();
  }, []);

  const startRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !micEnabledRef.current || pausedForReplyRef.current || recognitionRunningRef.current) return;
    try {
      recognition.start();
      recognitionRunningRef.current = true;
      setVoiceState("listening");
    } catch (startError) {
      if (startError instanceof DOMException && startError.name === "InvalidStateError") return;
      console.error("No se pudo iniciar el reconocimiento de voz:", startError);
      setError("No se pudo activar el micrófono. Comprueba los permisos del navegador e inténtalo de nuevo.");
      setVoiceState("idle");
    }
  }, []);

  const speakPatientReply = useCallback((text: string) => {
    const synthesis = window.speechSynthesis;
    if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") {
      setError("Este navegador no ofrece síntesis de voz. La respuesta del paciente está en la transcripción.");
      setVoiceState("idle");
      pausedForReplyRef.current = false;
      window.setTimeout(startRecognition, 150);
      return;
    }

    const currentVitals = vitalsRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    utterance.rate = Math.min(1.4, Math.max(0.85, 1 + (96 - currentVitals.spo2.value) * 0.025));
    utterance.pitch = Math.min(1.25, Math.max(0.85, 1 + (currentVitals.heartRate.value - 88) * 0.005));
    const spanishVoice = synthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("es"));
    if (spanishVoice) utterance.voice = spanishVoice;

    utterance.onend = () => {
      setVoiceState(micEnabledRef.current ? "listening" : "idle");
      pausedForReplyRef.current = false;
      window.setTimeout(startRecognition, 150);
    };
    utterance.onerror = (event) => {
      console.error("Falló la síntesis de voz:", event.error);
      setError("No se pudo reproducir la respuesta de voz del paciente.");
      setVoiceState("idle");
      pausedForReplyRef.current = false;
      window.setTimeout(startRecognition, 150);
    };

    synthesis.cancel();
    synthesis.speak(utterance);
  }, [startRecognition]);

  const startListening = useCallback(() => {
    if (micEnabledRef.current) return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("error");
      setError("El reconocimiento de voz no está disponible en este navegador. Prueba con una versión reciente de Chrome o Edge.");
      return;
    }

    const existingSocket = socketRef.current;
    if (
      recognitionRef.current &&
      existingSocket &&
      existingSocket.readyState !== WebSocket.CLOSING &&
      existingSocket.readyState !== WebSocket.CLOSED
    ) {
      micEnabledRef.current = true;
      setMicEnabled(true);
      setError(null);
      if (existingSocket.readyState === WebSocket.OPEN) startRecognition();
      else setStatus("connecting");
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const wsProtocol = baseUrl.startsWith("https") ? "wss:" : "ws:";
    const host = baseUrl.replace(/^https?:\/\//, "");
    const socketUrl = `${wsProtocol}//${host}/ws/audio`;

    const socket = new WebSocket(socketUrl);
    const recognition = new Recognition();
    micEnabledRef.current = true;
    pausedForReplyRef.current = false;
    sessionStartedAtRef.current = Date.now();
    socketRef.current = socket;
    recognitionRef.current = recognition;
    recognitionRunningRef.current = false;
    setMicEnabled(true);
    setStatus("connecting");
    setError(null);
    setDraft("");

    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (!micEnabledRef.current) return;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0].transcript.trim();
        if (result.isFinal && transcript) {
          setMessages((current) => [...current, createMessage("student", transcript, sessionStartedAtRef.current)]);
          if (socket.readyState !== WebSocket.OPEN) {
            setError("El canal con el paciente no está conectado; vuelve a activar el micrófono.");
            continue;
          }
          pausedForReplyRef.current = true;
          setVoiceState("idle");
          recognition.stop();
          socket.send(JSON.stringify({ type: "user_text", text: transcript }));
        } else {
          interim += transcript;
        }
      }
      setDraft(interim);
    };
    recognition.onerror = (event) => {
      if (!micEnabledRef.current || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Permite el acceso al micrófono en el navegador para iniciar la conversación.");
      } else if (event.error === "network") {
        setError("El servicio de reconocimiento de voz no está disponible por red. Comprueba la conexión e inténtalo otra vez.");
      } else if (event.error === "audio-capture") {
        setError("No se encontró un micrófono disponible en el dispositivo.");
      } else if (event.error !== "no-speech") {
        setError(`Error de reconocimiento de voz: ${event.error ?? "desconocido"}.`);
      } else {
        setError("No se detectó voz. Habla cerca del micrófono e inténtalo otra vez.");
      }

      if (event.error !== "no-speech") {
        setStatus("error");
        setVoiceState("idle");
        setMicEnabled(false);
        micEnabledRef.current = false;
        recognitionRunningRef.current = false;
        socket.close();
      }
    };
    recognition.onend = () => {
      recognitionRunningRef.current = false;
      if (micEnabledRef.current && !pausedForReplyRef.current) {
        window.setTimeout(startRecognition, 150);
      }
    };

    socket.onopen = () => {
      setStatus("connected");
      setError(null);
      startRecognition();
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      let message: ConversationMessage;
      try {
        const payload: unknown = JSON.parse(event.data);
        if (!isConversationMessage(payload)) {
          throw new Error("Formato de mensaje inválido.");
        }
        message = payload;
      } catch (parseError) {
        console.error("No se pudo procesar la respuesta del backend:", parseError);
        setError("El backend devolvió un mensaje con formato inválido.");
        return;
      }

      if (message.type === "error") {
        setError(message.message ?? "El backend no pudo responder.");
        setVoiceState("idle");
        pausedForReplyRef.current = false;
        window.setTimeout(startRecognition, 150);
        return;
      }
      if (message.type === "patient_text" && message.text) {
        const text = message.text;
        setMessages((current) => [...current, createMessage("patient", text, sessionStartedAtRef.current)]);
        setVoiceState("speaking");
        speakPatientReply(text);
      }
    };
    socket.onerror = () => {
      setStatus("error");
      setError("No se pudo conectar con el backend de conversación.");
      setVoiceState("idle");
    };
    socket.onclose = () => {
      if (micEnabledRef.current) {
        setStatus("disconnected");
        setError("Se cerró el canal de conversación. Desactiva y vuelve a activar el micrófono para reconectar.");
      }
    };
  }, [speakPatientReply, startRecognition]);

  const toggleMic = useCallback(() => {
    if (micEnabledRef.current) pauseListening();
    else startListening();
  }, [pauseListening, startListening]);

  useEffect(() => {
    if (previousSessionActiveRef.current && !sessionActive) {
      stopListening();
    } else if (!previousSessionActiveRef.current && sessionActive) {
      setMessages([]);
      setDraft("");
      sessionStartedAtRef.current = Date.now();
    }
    previousSessionActiveRef.current = sessionActive;
  }, [sessionActive, stopListening]);

  return {
    messages,
    draft,
    micEnabled,
    status,
    voiceState,
    error,
    toggleMic,
    stopListening,
  };
}
