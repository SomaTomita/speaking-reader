/**
 * SpeechEngine — drives playback via pre-generated MP3 or Web Speech API fallback.
 * Also includes VoiceRegistry and text preprocessing.
 */

import type { SentenceRef } from "../shared/sentence-splitter";
import {
  type PlayCursor,
  type PreparedSegment,
  type LessonLocation,
  VOICE_LANG,
  PAUSE_DEFAULT,
  PARAGRAPH_PAUSE_EXTRA,
  clampRate,
  clampPause,
} from "./settings";
import { activeCueIndex, type WordCue } from "../shared/word-cues";
import { mp3Url } from "../shared/audio-paths";
import { DEFAULT_VOICE_KEY } from "../shared/voices";

// ── Audio manifest types ─────────────────────────────────────────────

export interface AudioManifestEntry {
  sentenceCount: number;
}

export interface AudioManifest {
  voices: { key: string; id: string; label: string }[];
  defaultVoice: string;
  segments: Record<string, AudioManifestEntry>;
}

// ── Text preprocessing ───────────────────────────────────────────────

function preprocessForSpeech(text: string): string {
  let out = text;
  out = out.replace(/\be\.g\.\s*/gi, "for example, ");
  out = out.replace(/\bi\.e\.\s*/gi, "that is, ");
  out = out.replace(/\betc\.\s*/gi, "et cetera. ");
  out = out.replace(/\bvs\.\s*/gi, "versus ");
  out = out.replace(/\s*[—–]\s*/g, ", ");
  out = out.replace(/[""]/g, '"');
  out = out.replace(/['']/g, "'");
  out = out.replace(/…/g, ".");
  out = out.replace(/\*([^*\n]+)\*/g, "$1");
  out = out.replace(/_([^_\n]+)_/g, "$1");
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}

// ── Voice registry ───────────────────────────────────────────────────

const PREFERRED_VOICE_HINTS = ["siri", "natural", "premium", "neural", "enhanced"];

function voiceQualityScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (name.includes("siri")) score += 7;
  if (name.includes("natural")) score += 6;
  if (name.includes("premium")) score += 5;
  if (name.includes("neural")) score += 4;
  if (name.includes("enhanced")) score += 3;
  if (name.includes("compact")) score -= 5;
  if (voice.localService) score += 1;
  return score;
}

function sortVoices(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return [...list].sort((a, b) => {
    const d = voiceQualityScore(b) - voiceQualityScore(a);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

export class VoiceRegistry {
  private voices: SpeechSynthesisVoice[] = [];
  private listeners = new Set<() => void>();

  constructor() {
    this.refresh();
    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.speechSynthesis.addEventListener === "function"
    ) {
      window.speechSynthesis.addEventListener("voiceschanged", () => this.refresh());
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = (): void => this.refresh();
    }
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  refresh(): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.voices = window.speechSynthesis.getVoices();
    this.listeners.forEach((l) => l());
  }

  getVoices(): SpeechSynthesisVoice[] {
    const targetLang = VOICE_LANG.toLowerCase();
    const short = targetLang.split("-")[0];
    const matches = this.voices.filter((v) => {
      const lang = (v.lang ?? "").toLowerCase();
      return lang === targetLang || lang.startsWith(`${targetLang}-`);
    });
    if (matches.length > 0) return sortVoices(matches);
    const loose = this.voices.filter((v) => (v.lang ?? "").toLowerCase().startsWith(`${short}-`));
    return sortVoices(loose);
  }

  pick(preferredName?: string): SpeechSynthesisVoice | null {
    const candidates = this.getVoices();
    if (candidates.length === 0) return null;
    if (preferredName) {
      const match = candidates.find((v) => v.name === preferredName);
      if (match) return match;
    }
    for (const hint of PREFERRED_VOICE_HINTS) {
      const match = candidates.find((v) => v.name.toLowerCase().includes(hint));
      if (match) return match;
    }
    return candidates[0];
  }
}

// ── Speech engine ────────────────────────────────────────────────────

export interface SpeechEngineCallbacks {
  onSentenceStart: (ref: SentenceRef) => void;
  onWord: (wordIndex: number) => void;
  onSegmentStart: (segmentIndex: number) => void;
  onSegmentEnd: (segmentIndex: number) => void;
  onStop: () => void;
  onError: (message: string) => void;
}

function isChromium(): boolean {
  return /Chrome\/\d/.test(navigator.userAgent);
}

export class SpeechEngine {
  private segments: PreparedSegment[] = [];
  private cursor: PlayCursor | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private rate = 1;
  private pauseMs = PAUSE_DEFAULT;
  private readonly lang = VOICE_LANG;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private stopping = false;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  private audioManifest: AudioManifest | null = null;
  private lessonLocation: LessonLocation | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioPaused = false;
  private wordRafId: number | null = null;
  private voiceKey = DEFAULT_VOICE_KEY;

  constructor(private readonly cb: SpeechEngineCallbacks) {}

  get isSpeaking(): boolean {
    return this.cursor !== null;
  }

  get currentCursor(): PlayCursor | null {
    return this.cursor;
  }

  setSegments(segments: PreparedSegment[]): void {
    this.segments = segments;
  }

  setVoice(voice: SpeechSynthesisVoice | null): void {
    this.voice = voice;
  }

  setVoiceKey(key: string): void {
    this.voiceKey = key;
  }

  /**
   * Restart the current sentence (e.g. after a voice change) so the new voice's
   * audio and cues take effect immediately. No-op when nothing is playing, and
   * covers both the MP3 and Web Speech paths via speakCurrent().
   */
  restartCurrentSentence(): void {
    if (this.cursor) this.restartCurrent();
  }

  setAudioManifest(manifest: AudioManifest | null): void {
    this.audioManifest = manifest;
  }

  setLessonLocation(loc: LessonLocation | null): void {
    this.lessonLocation = loc;
  }

  setPauseMs(ms: number): void {
    this.pauseMs = clampPause(ms);
  }

  setRate(rate: number): void {
    const next = clampRate(rate);
    const changed = next !== this.rate;
    this.rate = next;
    if (changed && this.cursor) {
      if (this.currentAudio) {
        this.currentAudio.playbackRate = next;
      } else if (this.currentUtterance) {
        this.restartCurrent();
      }
    }
  }

  play(options: {
    lessonKey: string;
    segmentIndex: number;
    queueRest: boolean;
    startSentence?: number;
  }): void {
    if (!this.audioManifest && !("speechSynthesis" in window)) {
      this.cb.onError("Speech synthesis is not supported in this browser.");
      return;
    }
    if (this.segments.length === 0) return;
    const segmentIndex = Math.max(0, Math.min(options.segmentIndex, this.segments.length - 1));
    const sentenceIndex = options.startSentence ?? 0;
    this.stopSpeaking();
    this.cursor = {
      lessonKey: options.lessonKey,
      segmentIndex,
      sentenceIndex,
      queueRest: options.queueRest,
    };
    this.cb.onSegmentStart(segmentIndex);
    this.speakCurrent();
  }

  stop(): void {
    this.stopSpeaking();
    this.cursor = null;
    this.cb.onStop();
  }

  pauseResume(): "paused" | "resumed" | "none" {
    if (!this.cursor) return "none";
    if (this.currentAudio) {
      if (this.audioPaused) {
        this.currentAudio.play();
        this.audioPaused = false;
        return "resumed";
      }
      this.currentAudio.pause();
      this.audioPaused = true;
      return "paused";
    }
    if (!("speechSynthesis" in window)) return "none";
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      return "resumed";
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      return "paused";
    }
    return "none";
  }

  advanceSegment(delta: 1 | -1): void {
    if (!this.cursor) return;
    const nextIndex = this.cursor.segmentIndex + delta;
    if (nextIndex < 0 || nextIndex >= this.segments.length) return;
    this.play({
      lessonKey: this.cursor.lessonKey,
      segmentIndex: nextIndex,
      queueRest: this.cursor.queueRest,
    });
  }

  private restartCurrent(): void {
    if (!this.cursor) return;
    this.stopSpeaking();
    this.speakCurrent();
  }

  private stopSpeaking(): void {
    this.stopWordSync();
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    this.stopKeepalive();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute("src");
      this.currentAudio = null;
      this.audioPaused = false;
    }
    if ("speechSynthesis" in window) {
      this.stopping = true;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
      this.currentUtterance = null;
      this.stopping = false;
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    if (!isChromium()) return;
    this.keepaliveTimer = setInterval(() => {
      if (
        "speechSynthesis" in window &&
        window.speechSynthesis.speaking &&
        !window.speechSynthesis.paused
      ) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10_000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private speakCurrent(): void {
    if (!this.cursor) return;
    const segment = this.segments[this.cursor.segmentIndex];
    if (!segment) {
      this.stop();
      return;
    }
    const sentence = segment.sentences[this.cursor.sentenceIndex];
    if (!sentence) {
      this.cb.onSegmentEnd(this.cursor.segmentIndex);
      if (this.cursor.queueRest && this.cursor.segmentIndex + 1 < this.segments.length) {
        this.cursor = {
          ...this.cursor,
          segmentIndex: this.cursor.segmentIndex + 1,
          sentenceIndex: 0,
        };
        this.cb.onSegmentStart(this.cursor.segmentIndex);
        this.speakCurrent();
        return;
      }
      this.cursor = null;
      this.cb.onStop();
      return;
    }
    if (this.hasAudioFor(this.cursor.segmentIndex, this.cursor.sentenceIndex)) {
      this.speakWithAudio(segment, sentence);
    } else {
      this.speakWithSynthesis(segment, sentence);
    }
  }

  private hasAudioFor(segmentIndex: number, sentenceIndex: number): boolean {
    if (!this.audioManifest || !this.lessonLocation) return false;
    const key = `${this.lessonLocation.groupIndex}_${this.lessonLocation.lessonIndex}_${segmentIndex}`;
    const entry = this.audioManifest.segments[key];
    return !!entry && sentenceIndex < entry.sentenceCount;
  }

  private audioFileUrl(segmentIndex: number, sentenceIndex: number): string {
    const loc = this.lessonLocation!;
    return mp3Url(this.voiceKey, loc.groupIndex, loc.lessonIndex, segmentIndex, sentenceIndex);
  }

  private speakWithAudio(segment: PreparedSegment, sentence: SentenceRef): void {
    if (!this.cursor) return;
    const url = this.audioFileUrl(this.cursor.segmentIndex, this.cursor.sentenceIndex);
    const audio = new Audio(url);
    audio.playbackRate = this.rate;
    audio.volume = 1;
    const capturedCursor = { ...this.cursor };

    audio.oncanplaythrough = (): void => {
      this.cb.onSentenceStart(sentence);
      const cues = segment.cues?.[capturedCursor.sentenceIndex] ?? null;
      if (cues && cues.length > 0) this.startWordSync(cues);
    };
    audio.onended = (): void => {
      if (!this.cursor) return;
      if (
        this.cursor.segmentIndex !== capturedCursor.segmentIndex ||
        this.cursor.sentenceIndex !== capturedCursor.sentenceIndex
      )
        return;
      this.stopWordSync();
      this.currentAudio = null;
      this.audioPaused = false;
      this.advanceToNextSentence(segment, sentence);
    };
    audio.onerror = (): void => {
      this.currentAudio = null;
      this.speakWithSynthesis(segment, sentence);
    };

    this.currentAudio = audio;
    this.audioPaused = false;
    audio.play().catch(() => {
      this.currentAudio = null;
      this.speakWithSynthesis(segment, sentence);
    });
  }

  private speakWithSynthesis(segment: PreparedSegment, sentence: SentenceRef): void {
    if (!this.cursor) return;
    if (!("speechSynthesis" in window)) {
      this.cb.onError("Speech synthesis is not supported in this browser.");
      this.stop();
      return;
    }
    const spokenText = preprocessForSpeech(sentence.text);
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = this.lang;
    if (this.voice) utterance.voice = this.voice;
    utterance.rate = this.rate;
    utterance.volume = 1;
    utterance.pitch = spokenText.trimEnd().endsWith("?") ? 1.05 : 1;

    utterance.onstart = (): void => {
      this.startKeepalive();
      this.cb.onSentenceStart(sentence);
    };
    utterance.onend = (): void => {
      if (this.stopping) return;
      if (this.currentUtterance !== utterance) return;
      if (!this.cursor) return;
      this.advanceToNextSentence(segment, sentence);
    };
    utterance.onerror = (event: SpeechSynthesisErrorEvent): void => {
      if (this.stopping) return;
      if (event.error === "interrupted" || event.error === "canceled") return;
      this.cb.onError(`Speech error: ${event.error}`);
      this.stop();
    };

    this.currentUtterance = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      this.cb.onError(err instanceof Error ? err.message : "Unable to start speech.");
      this.stop();
    }
  }

  private startWordSync(cues: WordCue[]): void {
    this.stopWordSync();
    let last = -1;
    const tick = (): void => {
      if (!this.currentAudio) {
        this.wordRafId = null;
        return;
      }
      const tMs = this.currentAudio.currentTime * 1000;
      const idx = activeCueIndex(cues, tMs);
      if (idx !== last) {
        last = idx;
        if (idx >= 0) this.cb.onWord(idx);
      }
      this.wordRafId = requestAnimationFrame(tick);
    };
    this.wordRafId = requestAnimationFrame(tick);
  }

  private stopWordSync(): void {
    if (this.wordRafId !== null) {
      cancelAnimationFrame(this.wordRafId);
      this.wordRafId = null;
    }
  }

  private advanceToNextSentence(segment: PreparedSegment, sentence: SentenceRef): void {
    if (!this.cursor) return;
    const prevParagraph = sentence.paragraph;
    const nextSentenceIndex = this.cursor.sentenceIndex + 1;
    const nextSentence = segment.sentences[nextSentenceIndex];
    this.cursor = { ...this.cursor, sentenceIndex: nextSentenceIndex };

    let delay = this.pauseMs;
    if (nextSentence && nextSentence.paragraph !== prevParagraph && delay > 0) {
      delay += PARAGRAPH_PAUSE_EXTRA;
    }
    if (delay > 0 && nextSentence) {
      this.stopKeepalive();
      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = null;
        this.speakCurrent();
      }, delay);
    } else {
      this.speakCurrent();
    }
  }
}
