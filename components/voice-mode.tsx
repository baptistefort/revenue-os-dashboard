"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { OpsIcon } from "@/components/ops-icons";

export type VoiceModeState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "unsupported";

export type VoiceModeHandle = {
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
};

export type VoiceModeProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string, fromVoice: boolean) => void | Promise<void>;
  responseToSpeak?: string | null;
  responseKey?: string | number;
  busy?: boolean;
  autoStart?: boolean;
  autoListenAfterResponse?: boolean;
  assistantName?: string;
  onStateChange?: (state: VoiceModeState) => void;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type VoiceWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

const statusCopy: Record<VoiceModeState, { eyebrow: string; title: string; detail: string }> = {
  idle: {
    eyebrow: "OPS · PRÊT",
    title: "Je vous écoute.",
    detail: "Parlez naturellement ou écrivez votre demande.",
  },
  listening: {
    eyebrow: "ÉCOUTE EN COURS",
    title: "Je vous écoute…",
    detail: "Vous pouvez parler comme à un membre de votre direction.",
  },
  thinking: {
    eyebrow: "ANALYSE EN COURS",
    title: "OPS rapproche vos données.",
    detail: "Mémoire, documents et signaux utiles sont en cours d’analyse.",
  },
  speaking: {
    eyebrow: "RÉPONSE VOCALE",
    title: "OPS vous répond.",
    detail: "Vous pouvez interrompre la réponse à tout moment.",
  },
  unsupported: {
    eyebrow: "MODE TEXTE",
    title: "Le micro n’est pas disponible.",
    detail: "Vous pouvez continuer la conversation avec le champ ci-dessous.",
  },
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const voiceWindow = window as VoiceWindow;
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null;
}

function cleanForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[*_#>`~]/g, "")
    .replace(/\b(?:CRM|FIN|STRAT|ALERT)-[A-Z0-9-]+\b/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickFrenchVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => voice.lang.toLowerCase() === "fr-fr") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("fr")) ??
    null
  );
}

export const VoiceMode = forwardRef<VoiceModeHandle, VoiceModeProps>(function VoiceMode(
  {
    open,
    onClose,
    onSubmit,
    responseToSpeak,
    responseKey,
    busy = false,
    autoStart = true,
    autoListenAfterResponse = false,
    assistantName = "OPS",
    onStateChange,
  },
  ref,
) {
  const [voiceState, setVoiceState] = useState<VoiceModeState>("idle");
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stateRef = useRef<VoiceModeState>("idle");
  const openRef = useRef(open);
  const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpokenSignatureRef = useRef<string | number | null>(null);

  const updateState = useCallback(
    (nextState: VoiceModeState) => {
      stateRef.current = nextState;
      setVoiceState(nextState);
      onStateChange?.(nextState);
    },
    [onStateChange],
  );

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    }
    if (stateRef.current === "listening") updateState("idle");
  }, [updateState]);

  const submitText = useCallback(
    async (rawText: string, fromVoice: boolean) => {
      const text = rawText.trim();
      if (!text) return;

      setDraft("");
      setTranscript(text);
      setErrorDetail("");
      updateState("thinking");

      try {
        await onSubmit(text, fromVoice);
      } catch {
        setErrorDetail("La demande n’a pas pu être transmise. Réessayez dans un instant.");
        updateState("idle");
      }
    },
    [onSubmit, updateState],
  );

  const startListening = useCallback(() => {
    if (!openRef.current || stateRef.current === "thinking") return;

    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    stopListening();

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setErrorDetail("La reconnaissance vocale n’est pas prise en charge par ce navigateur.");
      updateState("unsupported");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setTranscript("");
      setErrorDetail("");
      updateState("listening");
    };
    recognition.onresult = (event) => {
      let liveTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative) continue;
        liveTranscript += alternative.transcript;
        if (result.isFinal) finalTranscript += alternative.transcript;
      }

      const visibleTranscript = (finalTranscript || liveTranscript).trim();
      if (visibleTranscript) setTranscript(visibleTranscript);

      if (finalTranscript.trim()) {
        recognition.onend = null;
        recognition.stop();
        recognitionRef.current = null;
        void submitText(finalTranscript, true);
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (event.error === "aborted") return;

      const blocked = event.error === "not-allowed" || event.error === "service-not-allowed";
      setErrorDetail(
        blocked
          ? "Autorisez l’accès au micro dans votre navigateur pour parler à OPS."
          : "Je n’ai pas bien entendu. Vous pouvez réessayer ou écrire votre demande.",
      );
      updateState(blocked ? "unsupported" : "idle");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (stateRef.current === "listening") updateState("idle");
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setErrorDetail("Le micro est déjà sollicité. Réessayez dans un instant.");
      updateState("idle");
    }
  }, [stopListening, submitText, updateState]);

  const speak = useCallback(
    (rawText: string) => {
      if (typeof window === "undefined" || !rawText.trim()) return;
      const speech = window.speechSynthesis;
      if (!speech) {
        updateState("unsupported");
        return;
      }

      stopListening();
      speech.cancel();

      const utterance = new SpeechSynthesisUtterance(cleanForSpeech(rawText));
      const voice = pickFrenchVoice(speech.getVoices());
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "fr-FR";
      utterance.rate = 0.98;
      utterance.pitch = 0.96;
      utterance.volume = 1;
      utterance.onstart = () => updateState("speaking");
      utterance.onerror = () => {
        setErrorDetail("La réponse est prête, mais la lecture vocale n’a pas pu démarrer.");
        updateState("idle");
      };
      utterance.onend = () => {
        updateState("idle");
        if (autoListenAfterResponse && openRef.current) {
          autoRestartTimerRef.current = setTimeout(startListening, 420);
        }
      };

      speech.speak(utterance);
    },
    [autoListenAfterResponse, startListening, stopListening, updateState],
  );

  useImperativeHandle(
    ref,
    () => ({
      startListening,
      stopListening,
      speak,
    }),
    [speak, startListening, stopListening],
  );

  useEffect(() => {
    openRef.current = open;
    if (!open) {
      stopListening();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
      updateState("idle");
      setDraft("");
      setTranscript("");
      return;
    }

    setErrorDetail("");
    updateState("idle");
    if (autoStart) {
      const timer = setTimeout(startListening, 180);
      return () => clearTimeout(timer);
    }
  }, [autoStart, open, startListening, stopListening, updateState]);

  useEffect(() => {
    if (busy && open) updateState("thinking");
  }, [busy, open, updateState]);

  useEffect(() => {
    if (!open || !responseToSpeak?.trim()) return;
    const signature = responseKey ?? responseToSpeak;
    if (lastSpokenSignatureRef.current === signature) return;
    lastSpokenSignatureRef.current = signature;
    speak(responseToSpeak);
  }, [open, responseKey, responseToSpeak, speak]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      if (autoRestartTimerRef.current) clearTimeout(autoRestartTimerRef.current);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const close = useCallback(() => {
    stopListening();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    onClose();
  }, [onClose, stopListening]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitText(draft, false);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey && draft.trim()) {
      event.preventDefault();
      void submitText(draft, false);
    }
  };

  if (!open) return null;

  const copy = statusCopy[voiceState];
  const isListening = voiceState === "listening";
  const isSpeaking = voiceState === "speaking";

  return (
    <section
      aria-label="Conversation vocale avec OPS"
      aria-modal="true"
      className={`voice-mode voice-mode--${voiceState}`}
      role="dialog"
    >
      <header className="voice-mode__header">
        <div className="voice-mode__brand">
          <span className="voice-mode__brand-mark" aria-hidden="true" />
          <span>{assistantName}</span>
        </div>
        <button className="voice-mode__quiet-close" onClick={close} type="button">
          Fermer
          <OpsIcon name="close" size={16} />
        </button>
      </header>

      <div className="voice-mode__stage">
        <div aria-hidden="true" className="voice-mode__orb-shell">
          <div className="voice-mode__orb" />
          <div className="voice-mode__orb-glow" />
          <div className="voice-mode__wave">
            {Array.from({ length: 7 }, (_, index) => (
              <i key={index} style={{ animationDelay: `${index * 70}ms` }} />
            ))}
          </div>
        </div>

        <div aria-live="polite" className="voice-mode__copy">
          <p>{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <span>{errorDetail || copy.detail}</span>
          {transcript ? (
            <blockquote>
              <small>{voiceState === "thinking" ? "Votre demande" : "Transcription"}</small>
              {transcript}
            </blockquote>
          ) : null}
        </div>
      </div>

      <form className="voice-mode__dock" onSubmit={handleSubmit}>
        <button aria-label="Ajouter un élément" className="voice-mode__dock-button" type="button">
          <OpsIcon name="plus" size={22} />
        </button>
        <input
          aria-label="Demande à OPS"
          autoComplete="off"
          disabled={voiceState === "thinking" || voiceState === "speaking"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={isListening ? "Je vous écoute…" : "Parlez ou écrivez à OPS"}
          value={draft}
        />
        {draft.trim() ? (
          <button aria-label="Envoyer" className="voice-mode__dock-button voice-mode__dock-button--send" type="submit">
            <OpsIcon name="send" size={20} />
          </button>
        ) : (
          <button
            aria-label={isListening ? "Arrêter l’écoute" : isSpeaking ? "Interrompre la réponse" : "Activer le micro"}
            className={`voice-mode__dock-button voice-mode__dock-button--microphone${isListening ? " is-active" : ""}`}
            onClick={() => {
              if (isListening) stopListening();
              else if (isSpeaking) {
                window.speechSynthesis?.cancel();
                updateState("idle");
              } else startListening();
            }}
            type="button"
          >
            <OpsIcon name={isListening ? "waveform" : isSpeaking ? "pause" : "microphone"} size={21} />
          </button>
        )}
        <button aria-label="Fermer le mode vocal" className="voice-mode__dock-button voice-mode__dock-button--close" onClick={close} type="button">
          <OpsIcon name="close" size={22} />
        </button>
      </form>

      <style jsx>{`
        .voice-mode {
          --voice-ink: #111317;
          --voice-muted: #868a92;
          --voice-line: rgba(17, 19, 23, 0.1);
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          grid-template-rows: auto 1fr auto;
          min-height: 100dvh;
          overflow: hidden;
          color: var(--voice-ink);
          background:
            radial-gradient(circle at 50% 46%, rgba(230, 235, 255, 0.34), transparent 32%),
            #fff;
          font-family: inherit;
        }

        .voice-mode__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 28px clamp(24px, 4vw, 64px);
        }

        .voice-mode__brand,
        .voice-mode__quiet-close {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 650;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .voice-mode__brand-mark {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #15171b;
          box-shadow: 0 0 0 5px rgba(17, 19, 23, 0.06);
        }

        .voice-mode__quiet-close {
          appearance: none;
          padding: 10px 12px;
          color: #676b72;
          background: transparent;
          border: 0;
          border-radius: 999px;
          cursor: pointer;
        }

        .voice-mode__quiet-close:hover {
          color: #111317;
          background: #f5f5f4;
        }

        .voice-mode__stage {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 0;
          padding: 0 24px 56px;
          text-align: center;
        }

        .voice-mode__orb-shell {
          position: relative;
          display: grid;
          place-items: center;
          width: clamp(190px, 20vw, 286px);
          aspect-ratio: 1;
          margin-bottom: clamp(34px, 5vh, 64px);
        }

        .voice-mode__orb,
        .voice-mode__orb-glow {
          position: absolute;
          inset: 0;
          border-radius: 50%;
        }

        .voice-mode__orb {
          overflow: hidden;
          background:
            radial-gradient(circle at 34% 69%, rgba(255, 255, 255, 0.98) 0 12%, rgba(236, 241, 255, 0.82) 30%, transparent 52%),
            radial-gradient(circle at 73% 26%, rgba(109, 111, 255, 0.96), rgba(143, 162, 255, 0.84) 38%, rgba(222, 228, 255, 0.88) 74%),
            #dfe5ff;
          box-shadow:
            inset 20px -24px 48px rgba(255, 255, 255, 0.52),
            inset -18px 18px 44px rgba(90, 96, 224, 0.16),
            0 32px 90px rgba(83, 92, 190, 0.14);
          animation: voice-breathe 3.8s ease-in-out infinite;
          filter: saturate(0.92);
        }

        .voice-mode__orb-glow {
          inset: 14%;
          z-index: -1;
          background: rgba(121, 130, 255, 0.32);
          filter: blur(48px);
          opacity: 0.38;
          animation: voice-glow 3.8s ease-in-out infinite;
        }

        .voice-mode--thinking .voice-mode__orb {
          animation-duration: 2.2s;
          filter: saturate(0.72) hue-rotate(8deg);
        }

        .voice-mode--speaking .voice-mode__orb,
        .voice-mode--listening .voice-mode__orb {
          animation-duration: 1.85s;
          filter: saturate(1.06);
        }

        .voice-mode__wave {
          position: absolute;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          opacity: 0;
          transition: opacity 180ms ease;
        }

        .voice-mode--listening .voice-mode__wave,
        .voice-mode--speaking .voice-mode__wave {
          opacity: 0.82;
        }

        .voice-mode__wave i {
          display: block;
          width: 3px;
          height: 22px;
          border-radius: 999px;
          background: rgba(39, 43, 102, 0.62);
          animation: voice-wave 900ms ease-in-out infinite alternate;
        }

        .voice-mode__copy {
          width: min(680px, 90vw);
        }

        .voice-mode__copy > p {
          margin: 0 0 12px;
          color: #777b83;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
        }

        .voice-mode__copy h2 {
          margin: 0;
          font-size: clamp(28px, 3vw, 44px);
          font-weight: 500;
          letter-spacing: -0.045em;
        }

        .voice-mode__copy > span {
          display: block;
          margin-top: 13px;
          color: var(--voice-muted);
          font-size: 14px;
          line-height: 1.5;
        }

        .voice-mode__copy blockquote {
          width: fit-content;
          max-width: min(620px, 84vw);
          margin: 28px auto 0;
          padding: 13px 18px;
          color: #33363c;
          background: rgba(248, 248, 247, 0.84);
          border: 1px solid var(--voice-line);
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          backdrop-filter: blur(16px);
        }

        .voice-mode__copy blockquote small {
          display: block;
          margin-bottom: 4px;
          color: #989ba2;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .voice-mode__dock {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 8px;
          width: min(850px, calc(100vw - 32px));
          margin: 0 auto clamp(20px, 4vh, 46px);
          padding: 8px;
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(17, 19, 23, 0.1);
          border-radius: 31px;
          box-shadow:
            0 20px 70px rgba(20, 25, 44, 0.09),
            0 2px 7px rgba(20, 25, 44, 0.04);
          backdrop-filter: blur(24px);
        }

        .voice-mode__dock input {
          min-width: 0;
          height: 46px;
          padding: 0 10px;
          color: #181a1e;
          background: transparent;
          border: 0;
          outline: 0;
          font: inherit;
          font-size: 15px;
        }

        .voice-mode__dock input::placeholder {
          color: #999ca3;
        }

        .voice-mode__dock-button {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 46px;
          height: 46px;
          padding: 0;
          color: #17191d;
          background: transparent;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          transition:
            background 160ms ease,
            color 160ms ease,
            transform 160ms ease;
        }

        .voice-mode__dock-button:hover {
          background: #f3f3f2;
        }

        .voice-mode__dock-button:active {
          transform: scale(0.95);
        }

        .voice-mode__dock-button--microphone,
        .voice-mode__dock-button--send {
          background: #f2f2f1;
        }

        .voice-mode__dock-button--microphone.is-active {
          color: #fff;
          background: #6c72f2;
          box-shadow: 0 8px 24px rgba(96, 102, 230, 0.22);
        }

        .voice-mode__dock-button--send,
        .voice-mode__dock-button--close {
          color: #fff;
          background: #111317;
        }

        .voice-mode__dock-button--send:hover,
        .voice-mode__dock-button--close:hover {
          background: #292c31;
        }

        @keyframes voice-breathe {
          0%,
          100% {
            transform: scale(0.97) rotate(-2deg);
          }
          50% {
            transform: scale(1.025) rotate(2deg);
          }
        }

        @keyframes voice-glow {
          0%,
          100% {
            opacity: 0.26;
            transform: scale(0.88);
          }
          50% {
            opacity: 0.48;
            transform: scale(1.08);
          }
        }

        @keyframes voice-wave {
          from {
            transform: scaleY(0.28);
          }
          to {
            transform: scaleY(1);
          }
        }

        @media (max-width: 640px) {
          .voice-mode__header {
            padding: 20px;
          }

          .voice-mode__quiet-close {
            width: 42px;
            height: 42px;
            justify-content: center;
            font-size: 0;
            border: 1px solid var(--voice-line);
          }

          .voice-mode__stage {
            padding-bottom: 30px;
          }

          .voice-mode__orb-shell {
            width: 184px;
            margin-bottom: 36px;
          }

          .voice-mode__dock {
            border-radius: 27px;
          }

          .voice-mode__dock-button {
            width: 42px;
            height: 42px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .voice-mode__orb,
          .voice-mode__orb-glow,
          .voice-mode__wave i {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
});

