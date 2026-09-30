import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRevisionTranscript, saveRevisionTranscript } from '../lib/revisionTranscript';

type RecognitionResultLike = { isFinal: boolean; length: number; [index: number]: { transcript: string } };
type RecognitionEventLike = Event & { resultIndex: number; results: ArrayLike<RecognitionResultLike> };
type RecognitionErrorEventLike = Event & { error?: string };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function transcriptLine(simulationTime: number, text: string) {
  return `[H+${simulationTime.toFixed(1)}] ${text.trim()}`;
}

export function useRevisionSpeech(simulationId: string | undefined, getSimulationTime: () => number) {
  const [active, setActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('REVISION을 누르면 음성 인식과 편집 모드가 시작됩니다.');
  const [transcript, setTranscript] = useState(() => loadRevisionTranscript(simulationId));
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const acceptResultsRef = useRef(false);
  const interimRef = useRef('');
  const transcriptRef = useRef(transcript);
  const getSimulationTimeRef = useRef(getSimulationTime);
  const restartTimerRef = useRef<number | undefined>(undefined);
  getSimulationTimeRef.current = getSimulationTime;

  useEffect(() => {
    transcriptRef.current = transcript;
    saveRevisionTranscript(simulationId, transcript);
  }, [simulationId, transcript]);

  const append = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const line = transcriptLine(getSimulationTimeRef.current(), trimmed);
    setTranscript(current => {
      const next = current ? `${current}\n${line}` : line;
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const createAndStart = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      shouldListenRef.current = false;
      setListening(false);
      setStatus('이 브라우저는 음성 인식을 지원하지 않습니다. 편집 기능은 계속 사용할 수 있습니다.');
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';
    recognition.onresult = event => {
      if (!acceptResultsRef.current) return;
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) append(text);
        else interim += text;
      }
      interimRef.current = interim.trim();
      setStatus(interimRef.current || '음성 명령을 듣고 있습니다.');
    };
    recognition.onerror = event => {
      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error ?? '');
      if (fatal) shouldListenRef.current = false;
      setListening(false);
      setStatus(event.error === 'not-allowed'
        ? '마이크 권한이 거부되었습니다. 편집 기능은 계속 사용할 수 있습니다.'
        : `음성 인식 오류${event.error ? `: ${event.error}` : ''}`);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (shouldListenRef.current) {
        restartTimerRef.current = window.setTimeout(() => createAndStart(), 250);
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      acceptResultsRef.current = true;
      setListening(true);
      setStatus('음성 명령을 듣고 있습니다.');
    } catch {
      shouldListenRef.current = false;
      setListening(false);
      setStatus('음성 인식을 시작하지 못했습니다. 편집 기능은 계속 사용할 수 있습니다.');
    }
  }, [append]);

  const start = useCallback(() => {
    setActive(true);
    shouldListenRef.current = true;
    createAndStart();
  }, [createAndStart]);

  const stop = useCallback(() => {
    const interim = interimRef.current.trim();
    const combined = interim
      ? `${transcriptRef.current}${transcriptRef.current ? '\n' : ''}${transcriptLine(getSimulationTimeRef.current(), interim)}`
      : transcriptRef.current;
    interimRef.current = '';
    transcriptRef.current = combined;
    setTranscript(combined);
    saveRevisionTranscript(simulationId, combined);
    shouldListenRef.current = false;
    acceptResultsRef.current = false;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setActive(false);
    setStatus('REVISION이 종료되었습니다.');
    return combined;
  }, [simulationId]);

  const toggle = useCallback(() => active ? stop() : start(), [active, start, stop]);

  const stopForReplan = useCallback(() => {
    return stop();
  }, [stop]);

  useEffect(() => () => {
    shouldListenRef.current = false;
    acceptResultsRef.current = false;
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
  }, []);

  return { active, listening, status, transcript, toggle, stopForReplan };
}
