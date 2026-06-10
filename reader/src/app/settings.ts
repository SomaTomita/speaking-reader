/**
 * Settings — types, constants, persistence.
 */

import { DEFAULT_VOICE_KEY, isVoiceKey } from "../shared/voices";

export type PartTab = "part1" | "part2";

export interface Settings {
  rate: number;
  pauseMs: number;
  activeTab: PartTab;
  voiceKey: string;
}

export interface PreparedSegment {
  segment: import("../shared/types").Segment;
  paragraphs: string[][];
  sentences: import("../shared/sentence-splitter").SentenceRef[];
  cues: (import("../shared/word-cues").WordCue[] | null)[];
}

export interface LessonLocation {
  groupIndex: number;
  lessonIndex: number;
}

export interface PlayCursor {
  lessonKey: string;
  segmentIndex: number;
  sentenceIndex: number;
  queueRest: boolean;
}

export const STORAGE_KEY = "ielts-reader-settings";
export const RATE_MIN = 0.5;
export const RATE_MAX = 1.5;
export const RATE_STEP = 0.05;
export const PAUSE_MIN = 0;
export const PAUSE_MAX = 800;
export const PAUSE_STEP = 50;
export const PAUSE_DEFAULT = 250;
export const PARAGRAPH_PAUSE_EXTRA = 300;
export const VOICE_LANG = "en-GB";

export function normalizeVoiceKey(value: unknown): string {
  return typeof value === "string" && isVoiceKey(value) ? value : DEFAULT_VOICE_KEY;
}

export function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < RATE_MIN) return RATE_MIN;
  if (value > RATE_MAX) return RATE_MAX;
  const steps = Math.round((value - RATE_MIN) / RATE_STEP);
  const snapped = RATE_MIN + steps * RATE_STEP;
  return Math.round(snapped * 100) / 100;
}

export function clampPause(value: number): number {
  if (!Number.isFinite(value)) return PAUSE_DEFAULT;
  if (value < PAUSE_MIN) return PAUSE_MIN;
  if (value > PAUSE_MAX) return PAUSE_MAX;
  return Math.round(value / PAUSE_STEP) * PAUSE_STEP;
}

export function loadSettings(): Settings {
  const fallback: Settings = {
    rate: 1,
    pauseMs: PAUSE_DEFAULT,
    activeTab: "part1",
    voiceKey: DEFAULT_VOICE_KEY,
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const rate = clampRate(typeof parsed.rate === "number" ? parsed.rate : fallback.rate);
    const pauseMs = clampPause(
      typeof parsed.pauseMs === "number" ? parsed.pauseMs : fallback.pauseMs,
    );
    const activeTab: PartTab = parsed.activeTab === "part2" ? "part2" : "part1";
    const voiceKey = normalizeVoiceKey((parsed as { voiceKey?: unknown }).voiceKey);
    return { rate, pauseMs, activeTab, voiceKey };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function lessonKey(loc: LessonLocation): string {
  return `${loc.groupIndex}:${loc.lessonIndex}`;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function tabForGroup(label: string): PartTab {
  return label.toLowerCase().startsWith("part 2") ? "part2" : "part1";
}
