import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TextSegment } from "../lib/textSegmenter";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface SpeechResult {
  audio_b64: string;
  sample_rate: number;
  duration: number;
  word_timings: WordTiming[];
  segment_index: number;
}

export type PlayerState = "idle" | "loading" | "playing" | "paused";

export interface PlayerStatus {
  state: PlayerState;
  currentSegment: number;
  currentWord: number;
  totalSegments: number;
  speed: number;
  voice: string;
  error: string | null;
}

const LOOKAHEAD = 2;

export function usePlayer(segments: TextSegment[]) {
  const [status, setStatus] = useState<PlayerStatus>({
    state: "idle",
    currentSegment: -1,
    currentWord: -1,
    totalSegments: 0,
    speed: 1.0,
    voice: "af_heart",
    error: null,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const cacheRef = useRef<Map<number, SpeechResult>>(new Map());
  const loadingRef = useRef<Set<number>>(new Set());
  const wordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter: every new "play session" gets a unique ID.
  // Stale async callbacks check this and abort if their gen is outdated.
  const genRef = useRef(0);
  const currentSegmentRef = useRef(-1);
  const speedRef = useRef(1.0);
  const voiceRef = useRef("af_heart");
  const segmentsRef = useRef<TextSegment[]>([]);

  useEffect(() => {
    segmentsRef.current = segments;
    setStatus((s) => ({ ...s, totalSegments: segments.length }));
    cacheRef.current.clear();
    loadingRef.current.clear();
  }, [segments]);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const prefetchSegment = useCallback(async (index: number) => {
    const segs = segmentsRef.current;
    if (
      index < 0 ||
      index >= segs.length ||
      cacheRef.current.has(index) ||
      loadingRef.current.has(index)
    )
      return;

    const seg = segs[index];
    if (seg.type === "code") return;

    loadingRef.current.add(index);
    try {
      const result = await invoke<SpeechResult>("generate_speech", {
        text: seg.text,
        voice: voiceRef.current,
        speed: speedRef.current,
        segmentIndex: index,
      });
      cacheRef.current.set(index, result);
    } catch (e) {
      console.error(`TTS error for segment ${index}:`, e);
    } finally {
      loadingRef.current.delete(index);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null; // prevent stale resolution
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {}
      currentSourceRef.current = null;
    }
    if (wordTimerRef.current) {
      clearTimeout(wordTimerRef.current);
      wordTimerRef.current = null;
    }
  }, []);

  const scheduleWordHighlights = useCallback(
    (wordTimings: WordTiming[], startedAt: number, segIndex: number, gen: number) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const scheduleNext = (wordIdx: number) => {
        if (genRef.current !== gen) return;
        if (wordIdx >= wordTimings.length) return;

        const timing = wordTimings[wordIdx];
        const elapsed = ctx.currentTime - startedAt;
        const delay = (timing.start - elapsed) * 1000;

        wordTimerRef.current = setTimeout(() => {
          if (genRef.current !== gen) return;
          if (currentSegmentRef.current !== segIndex) return;
          setStatus((s) => ({ ...s, currentWord: wordIdx }));
          scheduleNext(wordIdx + 1);
        }, Math.max(0, delay));
      };

      scheduleNext(0);
    },
    []
  );

  const playSegment = useCallback(
    async (index: number, gen: number): Promise<void> => {
      // Stale session guard — checked at every suspension point
      if (genRef.current !== gen) return;

      const segs = segmentsRef.current;
      if (index >= segs.length) {
        if (genRef.current !== gen) return;
        setStatus((s) => ({
          ...s,
          state: "idle",
          currentSegment: -1,
          currentWord: -1,
        }));
        return;
      }

      currentSegmentRef.current = index;
      setStatus((s) => ({
        ...s,
        currentSegment: index,
        currentWord: -1,
        state: "playing",
      }));

      for (let i = 1; i <= LOOKAHEAD; i++) prefetchSegment(index + i);

      const seg = segs[index];

      if (seg.type === "code") {
        if (genRef.current === gen) await playSegment(index + 1, gen);
        return;
      }

      let result = cacheRef.current.get(index);
      if (!result) {
        setStatus((s) => ({ ...s, state: "loading" }));
        await prefetchSegment(index);
        if (genRef.current !== gen) return;
        result = cacheRef.current.get(index);
      }

      if (!result || genRef.current !== gen) return;
      setStatus((s) => ({ ...s, state: "playing" }));

      try {
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
          if (genRef.current !== gen) return;
        }

        const binaryStr = atob(result.audio_b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

        if (genRef.current !== gen) return;

        stopAudio();

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        currentSourceRef.current = source;

        const startedAt = ctx.currentTime;
        source.start();

        scheduleWordHighlights(result.word_timings, startedAt, index, gen);

        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
        });

        if (genRef.current !== gen) return;
        currentSourceRef.current = null;
        await playSegment(index + 1, gen);
      } catch (e) {
        console.error("Audio playback error:", e);
        if (genRef.current === gen) await playSegment(index + 1, gen);
      }
    },
    [getAudioContext, prefetchSegment, scheduleWordHighlights, stopAudio]
  );

  /** Start a new play session, killing any previous one. */
  const startSession = useCallback(
    (fromSegment: number) => {
      // Increment gen first — this invalidates all in-flight async work from prior sessions
      const gen = ++genRef.current;
      stopAudio();

      for (let i = 0; i <= LOOKAHEAD; i++) prefetchSegment(fromSegment + i);
      playSegment(fromSegment, gen);
    },
    [playSegment, prefetchSegment, stopAudio]
  );

  const play = useCallback(
    (fromSegment?: number) => {
      const startAt = fromSegment ?? Math.max(0, currentSegmentRef.current);
      startSession(startAt);
      setStatus((s) => ({ ...s, state: "playing" }));
    },
    [startSession]
  );

  const pause = useCallback(() => {
    genRef.current++; // invalidate ongoing session
    stopAudio();
    audioCtxRef.current?.suspend();
    setStatus((s) => ({ ...s, state: "paused" }));
  }, [stopAudio]);

  const resume = useCallback(() => {
    const seg = currentSegmentRef.current >= 0 ? currentSegmentRef.current : 0;
    audioCtxRef.current?.resume();
    startSession(seg);
  }, [startSession]);

  const stop = useCallback(() => {
    genRef.current++; // invalidate ongoing session
    stopAudio();
    currentSegmentRef.current = -1;
    setStatus((s) => ({
      ...s,
      state: "idle",
      currentSegment: -1,
      currentWord: -1,
    }));
  }, [stopAudio]);

  const skipBack = useCallback(() => {
    const prev = Math.max(0, currentSegmentRef.current - 1);
    currentSegmentRef.current = prev;
    setStatus((s) => ({ ...s, currentSegment: prev, currentWord: -1 }));
    startSession(prev);
  }, [startSession]);

  const skipForward = useCallback(() => {
    const next = Math.min(
      segmentsRef.current.length - 1,
      currentSegmentRef.current + 1
    );
    currentSegmentRef.current = next;
    setStatus((s) => ({ ...s, currentSegment: next, currentWord: -1 }));
    startSession(next);
  }, [startSession]);

  const jumpTo = useCallback(
    (segmentIndex: number) => {
      currentSegmentRef.current = segmentIndex;
      setStatus((s) => ({
        ...s,
        currentSegment: segmentIndex,
        currentWord: -1,
      }));
      startSession(segmentIndex);
    },
    [startSession]
  );

  const setSpeed = useCallback(
    (speed: number) => {
      speedRef.current = speed;
      cacheRef.current.clear();
      loadingRef.current.clear();
      setStatus((s) => ({ ...s, speed }));
      const cur = currentSegmentRef.current;
      if (cur >= 0) startSession(cur);
    },
    [startSession]
  );

  const setVoice = useCallback((voice: string) => {
    voiceRef.current = voice;
    cacheRef.current.clear();
    loadingRef.current.clear();
    setStatus((s) => ({ ...s, voice }));
  }, []);

  return {
    status,
    play,
    pause,
    resume,
    stop,
    skipBack,
    skipForward,
    jumpTo,
    setSpeed,
    setVoice,
  };
}
