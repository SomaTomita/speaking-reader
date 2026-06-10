/**
 * ReaderApp — main application orchestrator + bootstrap.
 */

import type { Group, Lesson, Segment } from "../shared/types";
import {
  splitSentences,
  splitIntoParagraphs,
  flattenParagraphs,
} from "../shared/sentence-splitter";
import { buildWordUnits, type WordCue } from "../shared/word-cues";
import {
  type Settings,
  type PartTab,
  type PreparedSegment,
  type LessonLocation,
  RATE_STEP,
  clampRate,
  clampPause,
  loadSettings,
  saveSettings,
  lessonKey,
  prefersReducedMotion,
  tabForGroup,
} from "./settings";
import { requireEl, Announcer, ToastHost } from "./ui";
import { type AudioManifest, VoiceRegistry, SpeechEngine } from "./speech-engine";
import { VOICES } from "../shared/voices";
import { cueUrl } from "../shared/audio-paths";

// ── Helpers ──────────────────────────────────────────────────────────

function prepareSegment(segment: Segment): PreparedSegment {
  const paragraphs = splitIntoParagraphs(segment.text).map(splitSentences);
  const sentences = flattenParagraphs(paragraphs);
  return { segment, paragraphs, sentences, cues: sentences.map(() => null) };
}

// ── ReaderApp ────────────────────────────────────────────────────────

class ReaderApp {
  private readonly settings: Settings;
  private readonly voices: VoiceRegistry;
  private readonly announcer: Announcer;
  private readonly toast: ToastHost;
  private readonly speech: SpeechEngine;

  private readonly groups: Group[];
  private readonly prepared: Map<string, PreparedSegment[]> = new Map();
  private currentLesson: LessonLocation | null = null;

  private sentenceEls: HTMLElement[][] = [];
  // wordEls[segmentIndex][flatSentenceIndex][wordIndex]
  private wordEls: HTMLElement[][][] = [];
  private activeWordSentence: HTMLElement[] | null = null;
  private segmentEls: HTMLElement[] = [];
  private segmentPlayButtons: HTMLButtonElement[] = [];
  private activeSentenceEl: HTMLElement | null = null;

  // Header / controls
  private readonly voicePicker: HTMLSelectElement;
  private readonly rateSlider: HTMLInputElement;
  private readonly rateReadout: HTMLOutputElement;
  private readonly pauseSlider: HTMLInputElement;
  private readonly pauseReadout: HTMLOutputElement;
  private readonly sidebarTabs: NodeListOf<HTMLButtonElement>;
  private readonly sidebarNav: HTMLElement;
  private readonly sidebarEl: HTMLElement;
  private readonly sidebarToggle: HTMLButtonElement;
  private readonly emptyState: HTMLElement;
  private readonly lessonEl: HTMLElement;
  private readonly lessonTitleEl: HTMLElement;
  private readonly lessonFileEl: HTMLElement;
  private readonly playLessonBtn: HTMLButtonElement;
  private readonly segmentsEl: HTMLElement;
  private readonly player: HTMLElement;
  private readonly playerLabel: HTMLElement;
  private readonly playerProgress: HTMLElement;
  private readonly playerPlayPause: HTMLButtonElement;
  private readonly playerPlayPauseIcon: HTMLElement;
  private readonly playerPrev: HTMLButtonElement;
  private readonly playerNext: HTMLButtonElement;
  private readonly playerStop: HTMLButtonElement;

  private sidebarBackdrop: HTMLElement | null = null;

  constructor() {
    this.groups = Array.isArray(window.LESSONS) ? window.LESSONS : [];
    this.settings = loadSettings();
    this.voices = new VoiceRegistry();
    this.announcer = new Announcer(requireEl<HTMLElement>("live-region"));
    this.toast = new ToastHost(requireEl<HTMLElement>("toast-stack"));

    this.voicePicker = requireEl<HTMLSelectElement>("voice-picker");
    this.rateSlider = requireEl<HTMLInputElement>("rate-slider");
    this.rateReadout = requireEl<HTMLOutputElement>("rate-readout");
    this.pauseSlider = requireEl<HTMLInputElement>("pause-slider");
    this.pauseReadout = requireEl<HTMLOutputElement>("pause-readout");
    this.sidebarTabs = document.querySelectorAll<HTMLButtonElement>("#sidebar-tabs .sidebar__tab");
    this.sidebarNav = requireEl<HTMLElement>("sidebar-nav");
    this.sidebarEl = requireEl<HTMLElement>("sidebar");
    this.sidebarToggle = requireEl<HTMLButtonElement>("sidebar-toggle");
    this.emptyState = requireEl<HTMLElement>("empty-state");
    this.lessonEl = requireEl<HTMLElement>("lesson");
    this.lessonTitleEl = requireEl<HTMLElement>("lesson-title");
    this.lessonFileEl = requireEl<HTMLElement>("lesson-file");
    this.playLessonBtn = requireEl<HTMLButtonElement>("play-lesson");
    this.segmentsEl = requireEl<HTMLElement>("segments");
    this.player = requireEl<HTMLElement>("player");
    this.playerLabel = requireEl<HTMLElement>("player-label");
    this.playerProgress = requireEl<HTMLElement>("player-progress");
    this.playerPlayPause = requireEl<HTMLButtonElement>("player-playpause");
    this.playerPlayPauseIcon = requireEl<HTMLElement>("player-playpause-icon");
    this.playerPrev = requireEl<HTMLButtonElement>("player-prev");
    this.playerNext = requireEl<HTMLButtonElement>("player-next");
    this.playerStop = requireEl<HTMLButtonElement>("player-stop");

    this.speech = new SpeechEngine({
      onSentenceStart: () => this.highlightSentence(),
      onWord: (wordIndex) => this.highlightWord(wordIndex),
      onSegmentStart: (idx) => this.markSegmentPlaying(idx, true),
      onSegmentEnd: (idx) => this.markSegmentPlaying(idx, false),
      onStop: () => this.handleStopUi(),
      onError: (msg) => {
        this.toast.show(msg, "error");
        this.announcer.announce("Playback error.");
      },
    });
  }

  init(): void {
    this.applyInitialSettings();
    this.renderSidebarTabs();
    this.renderSidebar();
    this.renderVoicePicker();
    this.refreshFallbackVoice();
    this.voices.onChange(() => this.refreshFallbackVoice());
    this.attachControlHandlers();
    this.attachKeyboardShortcuts();
    this.attachResponsiveSidebar();
    this.loadAudioManifest();
    if (this.groups.length === 0) {
      this.toast.show("No lessons were loaded. Make sure public/data.js is present.", "error");
    }
  }

  private loadAudioManifest(): void {
    fetch("audio-manifest.json")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((manifest: AudioManifest | null) => {
        if (manifest && manifest.segments && Object.keys(manifest.segments).length > 0) {
          this.speech.setAudioManifest(manifest);
          this.toast.show("High-quality audio loaded.");
        }
      })
      .catch(() => {
        // No manifest — Web Speech API fallback.
      });
  }

  // ── Sidebar tabs ─────────────────────────────────────────────────

  private renderSidebarTabs(): void {
    this.sidebarTabs.forEach((tab) => {
      const tabKey = tab.dataset.tab as PartTab;
      tab.setAttribute("aria-selected", tabKey === this.settings.activeTab ? "true" : "false");
      tab.addEventListener("click", () => {
        if (tabKey === this.settings.activeTab) return;
        this.settings.activeTab = tabKey;
        saveSettings(this.settings);
        this.sidebarTabs.forEach((t) =>
          t.setAttribute("aria-selected", t.dataset.tab === tabKey ? "true" : "false"),
        );
        this.renderSidebar();
        this.announcer.announce(tabKey === "part1" ? "Part 1 selected." : "Part 2 selected.");
      });
    });
  }

  // ── Sidebar ──────────────────────────────────────────────────────

  private renderSidebar(): void {
    this.sidebarNav.innerHTML = "";
    const activeTab = this.settings.activeTab;

    this.groups.forEach((group, gIdx) => {
      if (tabForGroup(group.label) !== activeTab) return;

      const section = document.createElement("section");
      section.className = "sidebar__group";

      const part1Groups = this.groups.filter((g) => tabForGroup(g.label) === "part1");
      if (activeTab === "part1" && part1Groups.length > 1) {
        const heading = document.createElement("h2");
        heading.className = "sidebar__group-label";
        heading.textContent = group.label.includes("special") ? "Special Topics" : "General";
        section.append(heading);
      }

      const list = document.createElement("div");
      list.className = "sidebar__lessons";

      group.lessons.forEach((lesson, lIdx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar__lesson";
        btn.textContent = lesson.title;
        btn.dataset.key = lessonKey({ groupIndex: gIdx, lessonIndex: lIdx });
        btn.setAttribute("aria-current", "false");
        btn.addEventListener("click", () => {
          this.openLesson({ groupIndex: gIdx, lessonIndex: lIdx });
          this.closeMobileSidebar();
        });
        list.append(btn);
      });

      section.append(list);
      this.sidebarNav.append(section);
    });

    this.markSidebarCurrent(this.currentLesson);
  }

  private markSidebarCurrent(location: LessonLocation | null): void {
    const key = location ? lessonKey(location) : null;
    this.sidebarNav.querySelectorAll<HTMLButtonElement>(".sidebar__lesson").forEach((btn) => {
      btn.setAttribute("aria-current", btn.dataset.key === key ? "true" : "false");
    });
  }

  // ── Settings ─────────────────────────────────────────────────────

  private applyInitialSettings(): void {
    this.rateSlider.value = String(this.settings.rate);
    this.rateReadout.value = this.formatRate(this.settings.rate);
    this.speech.setRate(this.settings.rate);
    this.pauseSlider.value = String(this.settings.pauseMs);
    this.pauseReadout.value = this.formatPause(this.settings.pauseMs);
    this.speech.setPauseMs(this.settings.pauseMs);
  }

  private renderVoicePicker(): void {
    const select = this.voicePicker;
    select.innerHTML = "";
    select.disabled = false;
    VOICES.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.key;
      opt.textContent = v.label;
      select.append(opt);
    });
    select.value = this.settings.voiceKey;
    this.speech.setVoiceKey(this.settings.voiceKey);
  }

  private refreshFallbackVoice(): void {
    this.speech.setVoice(this.voices.pick());
  }

  // ── Control handlers ─────────────────────────────────────────────

  private attachControlHandlers(): void {
    this.voicePicker.addEventListener("change", () => {
      const key = this.voicePicker.value;
      this.settings.voiceKey = key;
      saveSettings(this.settings);
      this.speech.setVoiceKey(key);
      this.announcer.announce(`Voice: ${this.voicePicker.selectedOptions[0]?.textContent ?? key}.`);
      // Load the new voice's cues first, then restart the current sentence so
      // audio and word-highlight switch together in sync (no dark highlight).
      void this.applyVoiceToCurrentLesson();
    });

    this.rateSlider.addEventListener("input", () => {
      const rate = clampRate(Number(this.rateSlider.value));
      this.settings.rate = rate;
      this.rateReadout.value = this.formatRate(rate);
      saveSettings(this.settings);
      this.speech.setRate(rate);
    });

    this.pauseSlider.addEventListener("input", () => {
      const ms = clampPause(Number(this.pauseSlider.value));
      this.settings.pauseMs = ms;
      this.pauseReadout.value = this.formatPause(ms);
      saveSettings(this.settings);
      this.speech.setPauseMs(ms);
    });

    this.playLessonBtn.addEventListener("click", () => {
      if (!this.currentLesson) return;
      this.speech.play({
        lessonKey: lessonKey(this.currentLesson),
        segmentIndex: 0,
        queueRest: true,
      });
      this.announcer.announce("Playing lesson.");
    });

    this.playerPlayPause.addEventListener("click", () => this.togglePlayPause());
    this.playerStop.addEventListener("click", () => this.stopPlayback());
    this.playerPrev.addEventListener("click", () => this.speech.advanceSegment(-1));
    this.playerNext.addEventListener("click", () => this.speech.advanceSegment(1));
  }

  private attachKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target && this.isTextInput(target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Space") {
        if (!this.speech.isSpeaking && !this.currentLesson) return;
        event.preventDefault();
        this.togglePlayPause();
      } else if (event.key === "s" || event.key === "S") {
        if (!this.speech.isSpeaking) return;
        event.preventDefault();
        this.stopPlayback();
      } else if (event.key === "[") {
        event.preventDefault();
        this.nudgeRate(-RATE_STEP);
      } else if (event.key === "]") {
        event.preventDefault();
        this.nudgeRate(RATE_STEP);
      }
    });
  }

  private isTextInput(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag === "INPUT") {
      const type = (el as HTMLInputElement).type.toLowerCase();
      return type !== "range" && type !== "checkbox" && type !== "radio";
    }
    return tag === "TEXTAREA" || el.isContentEditable;
  }

  private nudgeRate(delta: number): void {
    const next = clampRate(this.settings.rate + delta);
    this.settings.rate = next;
    this.rateSlider.value = String(next);
    this.rateReadout.value = this.formatRate(next);
    saveSettings(this.settings);
    this.speech.setRate(next);
    this.announcer.announce(`Speed ${this.formatRate(next)}.`);
  }

  private formatRate(rate: number): string {
    return `${rate.toFixed(2)}×`;
  }

  private formatPause(ms: number): string {
    return ms === 0 ? "Off" : `${ms}ms`;
  }

  // ── Lesson rendering ─────────────────────────────────────────────

  private openLesson(location: LessonLocation): void {
    const group = this.groups[location.groupIndex];
    if (!group) return;
    const lesson = group.lessons[location.lessonIndex];
    if (!lesson) return;

    this.speech.stop();
    this.currentLesson = location;
    this.speech.setLessonLocation(location);
    this.markSidebarCurrent(location);

    this.emptyState.hidden = true;
    this.lessonEl.hidden = false;
    this.lessonFileEl.textContent = `${group.label} · ${lesson.file}`;
    this.lessonTitleEl.textContent = lesson.title;

    const prepared = this.getPreparedSegments(location, lesson);
    void this.loadCuesForLesson(location, prepared);
    this.speech.setSegments(prepared);
    this.renderSegments(prepared);
    this.announcer.announce(`Opened ${lesson.title}.`);
    this.lessonEl.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  private getPreparedSegments(location: LessonLocation, lesson: Lesson): PreparedSegment[] {
    const key = lessonKey(location);
    const cached = this.prepared.get(key);
    if (cached) return cached;
    const prepared = lesson.segments.map(prepareSegment);
    this.prepared.set(key, prepared);
    return prepared;
  }

  /**
   * Switch the open lesson to the active voice: clear cues, refetch them for the
   * new voiceKey, then restart the current sentence so the new audio + word
   * timings take effect together. No-op when no lesson is open.
   */
  private async applyVoiceToCurrentLesson(): Promise<void> {
    const location = this.currentLesson;
    if (!location) return;
    const prepared = this.prepared.get(lessonKey(location));
    if (!prepared) return;
    prepared.forEach((p) => p.cues.fill(null));
    await this.loadCuesForLesson(location, prepared);
    // Only restart if the user hasn't navigated to another lesson meanwhile.
    if (this.currentLesson === location) this.speech.restartCurrentSentence();
  }

  private async loadCuesForLesson(
    location: LessonLocation,
    prepared: PreparedSegment[],
  ): Promise<void> {
    // Already loaded for this cached lesson? Skip.
    const anyLoaded = prepared.some((p) => p.cues.some((c) => c !== null));
    if (anyLoaded) return;

    // Tag this fetch batch with the voice it is for, so a rapid voice switch
    // that lands mid-flight does not write a stale voice's timings.
    const forVoice = this.settings.voiceKey;
    const jobs: Promise<void>[] = [];
    prepared.forEach((prep, segIdx) => {
      prep.sentences.forEach((_sentence, sentIdx) => {
        const url = cueUrl(forVoice, location.groupIndex, location.lessonIndex, segIdx, sentIdx);
        jobs.push(
          fetch(url)
            .then((res) => (res.ok ? (res.json() as Promise<WordCue[]>) : null))
            .then((cues) => {
              if (this.settings.voiceKey === forVoice && Array.isArray(cues)) {
                prep.cues[sentIdx] = cues;
              }
            })
            .catch(() => {
              /* leave null → sentence-level fallback */
            }),
        );
      });
    });

    await Promise.all(jobs);
    // Re-render only if this lesson is still open and the voice still matches.
    if (
      this.settings.voiceKey === forVoice &&
      this.currentLesson &&
      lessonKey(this.currentLesson) === lessonKey(location)
    ) {
      this.renderSegments(prepared);
    }
  }

  private renderSegments(segments: PreparedSegment[]): void {
    this.segmentsEl.innerHTML = "";
    this.sentenceEls = [];
    this.segmentEls = [];
    this.segmentPlayButtons = [];
    this.wordEls = [];

    segments.forEach((prep, segIdx) => {
      const card = document.createElement("section");
      card.className = "segment";
      card.dataset.index = String(segIdx);
      card.dataset.playing = "false";

      const head = document.createElement("header");
      head.className = "segment__head";
      const label = document.createElement("h3");
      label.className = "segment__label";
      label.textContent = prep.segment.label;
      head.append(label);

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "icon-button icon-button--primary segment__play";
      playBtn.setAttribute("aria-label", `Play ${prep.segment.label}`);
      playBtn.innerHTML = `<span aria-hidden="true">▶</span>`;
      playBtn.addEventListener("click", () => this.toggleSegmentPlayback(segIdx));
      head.append(playBtn);
      card.append(head);

      const body = document.createElement("div");
      body.className = "segment__text";
      const sentenceElsForSegment: HTMLElement[] = [];
      const wordElsForSegment: HTMLElement[][] = [];
      let sentenceRunningIndex = 0;

      prep.paragraphs.forEach((paraSentences, paraIdx) => {
        const para = document.createElement("p");
        para.className = "segment__paragraph";
        // paragraphs are split lists; flat sentence index advances across paragraphs
        paraSentences.forEach((text) => {
          const flatIdx = sentenceRunningIndex;
          const span = document.createElement("span");
          span.className = "segment__sentence";
          span.dataset.idx = String(flatIdx);

          const cues = prep.cues[flatIdx];
          const wordsForSentence: HTMLElement[] = [];
          if (cues && cues.length > 0) {
            span.classList.add("segment__sentence--words");
            buildWordUnits(cues).forEach((unit) => {
              const w = document.createElement("span");
              w.className = "word";
              w.textContent = unit.word;
              span.append(w);
              wordsForSentence.push(w);
              if (unit.trailing) span.append(document.createTextNode(unit.trailing));
            });
          } else {
            span.textContent = text;
          }

          para.append(span);
          para.append(document.createTextNode(" "));
          sentenceElsForSegment.push(span);
          wordElsForSegment.push(wordsForSentence);
          sentenceRunningIndex += 1;
        });
        body.append(para);
        void paraIdx;
      });

      card.append(body);

      // Japanese translation: display-only, never spoken or highlighted.
      const translation = prep.segment.translation;
      if (translation) {
        const trans = document.createElement("div");
        trans.className = "segment__translation";
        trans.lang = "ja";
        splitIntoParagraphs(translation).forEach((paragraph) => {
          const p = document.createElement("p");
          p.className = "segment__translation-paragraph";
          p.textContent = paragraph;
          trans.append(p);
        });
        card.append(trans);
      }

      this.segmentsEl.append(card);
      this.segmentEls.push(card);
      this.segmentPlayButtons.push(playBtn);
      this.sentenceEls.push(sentenceElsForSegment);
      this.wordEls.push(wordElsForSegment);
    });
  }

  // ── Playback UI ──────────────────────────────────────────────────

  private toggleSegmentPlayback(segmentIndex: number): void {
    if (!this.currentLesson) return;
    const cursor = this.speech.currentCursor;
    if (cursor && cursor.segmentIndex === segmentIndex) {
      this.togglePlayPause();
      return;
    }
    this.speech.play({ lessonKey: lessonKey(this.currentLesson), segmentIndex, queueRest: false });
  }

  private togglePlayPause(): void {
    if (!this.speech.isSpeaking) {
      if (!this.currentLesson) return;
      this.speech.play({
        lessonKey: lessonKey(this.currentLesson),
        segmentIndex: 0,
        queueRest: true,
      });
      return;
    }
    const result = this.speech.pauseResume();
    if (result === "paused") {
      this.playerPlayPauseIcon.textContent = "▶";
      this.playerPlayPause.setAttribute("aria-label", "Resume");
      this.announcer.announce("Paused.");
    } else if (result === "resumed") {
      this.playerPlayPauseIcon.textContent = "⏸";
      this.playerPlayPause.setAttribute("aria-label", "Pause");
      this.announcer.announce("Resumed.");
    }
  }

  private stopPlayback(): void {
    this.speech.stop();
    this.announcer.announce("Stopped.");
  }

  private markSegmentPlaying(segmentIndex: number, playing: boolean): void {
    const card = this.segmentEls[segmentIndex];
    const btn = this.segmentPlayButtons[segmentIndex];
    if (!card || !btn) return;
    card.dataset.playing = playing ? "true" : "false";
    btn.innerHTML = playing
      ? `<span aria-hidden="true">⏸</span>`
      : `<span aria-hidden="true">▶</span>`;
    btn.setAttribute(
      "aria-label",
      playing ? `Pause segment ${segmentIndex + 1}` : `Play segment ${segmentIndex + 1}`,
    );
    if (playing) this.showPlayer(segmentIndex);
  }

  private showPlayer(segmentIndex: number): void {
    this.player.hidden = false;
    const total = this.segmentEls.length;
    const card = this.segmentEls[segmentIndex];
    const label = card?.querySelector<HTMLElement>(".segment__label")?.textContent ?? "";
    this.playerLabel.textContent = label;
    this.playerProgress.textContent = `Segment ${segmentIndex + 1} of ${total}`;
    this.playerPlayPauseIcon.textContent = "⏸";
    this.playerPlayPause.setAttribute("aria-label", "Pause");
  }

  private highlightWord(wordIndex: number): void {
    const cursor = this.speech.currentCursor;
    if (!cursor) return;
    const words = this.wordEls[cursor.segmentIndex]?.[cursor.sentenceIndex];
    if (!words) return;
    for (let i = 0; i < words.length; i++) {
      words[i].classList.toggle("is-read", i < wordIndex);
      words[i].classList.toggle("is-active", i === wordIndex);
    }
  }

  private highlightSentence(): void {
    const cursor = this.speech.currentCursor;
    if (!cursor) return;
    const segmentSpans = this.sentenceEls[cursor.segmentIndex];
    if (!segmentSpans) return;
    const span = segmentSpans[cursor.sentenceIndex];
    if (!span) return;

    // Finalize the previous sentence's words (all read, none active).
    if (this.activeWordSentence) {
      for (const w of this.activeWordSentence) {
        w.classList.remove("is-active");
        w.classList.add("is-read");
      }
    }
    this.activeWordSentence = this.wordEls[cursor.segmentIndex]?.[cursor.sentenceIndex] ?? null;

    if (this.activeSentenceEl && this.activeSentenceEl !== span) {
      this.activeSentenceEl.classList.remove("speaking");
    }
    span.classList.add("speaking");
    this.activeSentenceEl = span;
    span.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  private handleStopUi(): void {
    if (this.activeSentenceEl) {
      this.activeSentenceEl.classList.remove("speaking");
      this.activeSentenceEl = null;
    }
    if (this.activeWordSentence) {
      for (const w of this.activeWordSentence) w.classList.remove("is-active", "is-read");
      this.activeWordSentence = null;
    }
    this.segmentEls.forEach((card, idx) => {
      if (card.dataset.playing === "true") this.markSegmentPlaying(idx, false);
    });
    this.player.hidden = true;
    this.playerPlayPauseIcon.textContent = "⏸";
    this.playerPlayPause.setAttribute("aria-label", "Pause");
  }

  // ── Responsive sidebar ───────────────────────────────────────────

  private attachResponsiveSidebar(): void {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = (): void => {
      if (mq.matches) {
        this.sidebarToggle.hidden = false;
        this.sidebarEl.dataset.open = "false";
        this.sidebarToggle.setAttribute("aria-expanded", "false");
      } else {
        this.sidebarToggle.hidden = true;
        this.sidebarEl.dataset.open = "false";
        this.sidebarToggle.setAttribute("aria-expanded", "false");
        this.removeBackdrop();
      }
    };
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(apply);
    }

    this.sidebarToggle.addEventListener("click", () => {
      if (this.sidebarEl.dataset.open === "true") {
        this.closeMobileSidebar();
      } else {
        this.openMobileSidebar();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.sidebarEl.dataset.open === "true") {
        this.closeMobileSidebar();
      }
    });
  }

  private openMobileSidebar(): void {
    this.sidebarEl.dataset.open = "true";
    this.sidebarToggle.setAttribute("aria-expanded", "true");
    this.ensureBackdrop();
  }

  private closeMobileSidebar(): void {
    this.sidebarEl.dataset.open = "false";
    this.sidebarToggle.setAttribute("aria-expanded", "false");
    this.removeBackdrop();
  }

  private ensureBackdrop(): void {
    if (this.sidebarBackdrop) return;
    const el = document.createElement("div");
    el.className = "sidebar-backdrop";
    el.dataset.open = "true";
    el.addEventListener("click", () => this.closeMobileSidebar());
    document.body.append(el);
    this.sidebarBackdrop = el;
  }

  private removeBackdrop(): void {
    if (!this.sidebarBackdrop) return;
    this.sidebarBackdrop.remove();
    this.sidebarBackdrop = null;
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────

function boot(): void {
  try {
    const app = new ReaderApp();
    app.init();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const body = document.body;
    if (body) {
      const banner = document.createElement("div");
      banner.style.padding = "1rem";
      banner.style.background = "#fff1ee";
      banner.style.color = "#a24b3a";
      banner.style.borderBottom = "1px solid #e9c8c0";
      banner.textContent = `Unable to start reader: ${msg}`;
      body.prepend(banner);
    }
    throw err;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
