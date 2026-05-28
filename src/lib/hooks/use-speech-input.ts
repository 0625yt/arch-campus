"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API 한국어 받아쓰기 훅.
 *
 * 왜 직접 구현했나:
 *   - npm 패키지(react-speech-recognition 등)는 react 19와 호환성 불안정.
 *   - 우리 케이스는 "한국어, 자료 입력 textarea에 한 줄 추가"라 작은 hook으로 충분.
 *   - SSR 안전 — window·navigator 접근은 effect/handler 안에서만.
 *
 * 브라우저 지원:
 *   - Chrome/Edge/Safari(iOS 14+): SpeechRecognition 또는 webkitSpeechRecognition.
 *   - Firefox: 미지원 — supported=false 반환.
 *   - Brave: webkit prefix 있지만 권한 정책 막아서 result 0건이면 자동 stop으로 처리.
 *
 * 권한:
 *   - 첫 호출 시 마이크 권한 prompt가 뜸. 거절하면 onError 호출 + listening=false.
 *   - HTTPS 또는 localhost에서만 동작. Vercel preview/prod는 모두 https.
 *
 * 정확도 향상:
 *   - lang="ko-KR" 명시 — 영문 섞임 줄임.
 *   - continuous=true · interimResults=true — 한 문장이 끝나도 멈추지 않고 누적.
 *     "다음 주 화요일 영어 과제"처럼 긴 문장도 한 번에 받아씀.
 *   - finalText는 stop()까지 누적. interim은 화면 표시용으로만 (덮어쓰기 X).
 *
 * 호출 패턴:
 *   const { supported, listening, interim, start, stop, error } = useSpeechInput("ko-KR");
 *   - start() — 녹음 시작 (idempotent)
 *   - stop() — 녹음 중지 + onFinal(finalText) 콜백
 */

// Web Speech API 타입은 lib.dom.d.ts에 있긴 하지만 webkit prefix 변형은 명시 X.
// 우리가 쓰는 메서드만 좁게 선언해서 any를 안 쓴다.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechInputResult {
  /** 브라우저가 Web Speech API를 지원하는지. SSR 첫 렌더는 false → mount 후 true. */
  supported: boolean;
  /** 녹음 중인지. */
  listening: boolean;
  /** 임시 transcript — UI에서 회색으로 미리보기. final 아님. */
  interim: string;
  /**
   * 녹음 시작. 이미 listening이면 무시.
   * onFinal: stop() 또는 자동 종료 시 final transcript 한 번에 전달.
   * onError: 마이크 권한 거절·인식 실패 등.
   */
  start(opts: { onFinal: (text: string) => void; onError?: (reason: string) => void }): void;
  /** 녹음 중지 (onend 자동 발화). */
  stop(): void;
  /** 마지막 에러 메시지 (있다면). UI 토스트용. */
  error: string | null;
}

export function useSpeechInput(lang = "ko-KR"): UseSpeechInputResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 인스턴스는 ref에 — 상태 변경 시 재생성되지 않음. stop()이 같은 인스턴스를 가리키게.
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef<string>("");
  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const onErrorRef = useRef<((reason: string) => void) | null>(null);

  useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  // unmount 시 진행 중 인식 정리.
  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        // 이미 stop된 경우 throw — 무시
      }
    };
  }, []);

  const start = useCallback(
    ({
      onFinal,
      onError,
    }: {
      onFinal: (text: string) => void;
      onError?: (reason: string) => void;
    }) => {
      if (listening) return;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        const reason = "이 브라우저는 음성 입력을 지원하지 않아요";
        setError(reason);
        onError?.(reason);
        return;
      }

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      finalRef.current = "";
      onFinalRef.current = onFinal;
      onErrorRef.current = onError ?? null;

      rec.onresult = (e: SpeechRecognitionEventLike) => {
        // resultIndex부터 새로 들어온 segments. 누적은 final만, interim은 매번 새로 그림.
        let interimChunk = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const transcript = r[0]?.transcript ?? "";
          if (r.isFinal) {
            finalRef.current = `${finalRef.current} ${transcript}`.trim();
          } else {
            interimChunk += transcript;
          }
        }
        setInterim(interimChunk);
      };

      rec.onerror = (e: SpeechRecognitionErrorEventLike) => {
        // "no-speech"는 잠시 조용했을 때 흔히 발생 — 사용자에게 알릴 가치 X.
        // "not-allowed"는 마이크 권한 거절 — 큰 알림.
        const reason =
          e.error === "not-allowed"
            ? "마이크 권한이 없어요. 브라우저 설정에서 허용해주세요."
            : e.error === "audio-capture"
              ? "마이크 입력을 못 받았어요. 마이크가 연결돼 있나요?"
              : e.error === "no-speech"
                ? ""
                : `음성 인식 오류: ${e.error}`;
        if (reason) {
          setError(reason);
          onErrorRef.current?.(reason);
        }
      };

      rec.onend = () => {
        setListening(false);
        setInterim("");
        const finalText = finalRef.current.trim();
        if (finalText && onFinalRef.current) {
          onFinalRef.current(finalText);
        }
        recRef.current = null;
      };

      try {
        rec.start();
        recRef.current = rec;
        setListening(true);
        setError(null);
      } catch (e) {
        // "InvalidStateError" — 이미 start됨. 사용자 더블클릭 등.
        const reason = e instanceof Error ? e.message : "음성 인식을 시작하지 못했어요";
        setError(reason);
        onError?.(reason);
      }
    },
    [lang, listening],
  );

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // 이미 멈춘 경우 throw — 무시
    }
  }, []);

  return { supported, listening, interim, start, stop, error };
}
