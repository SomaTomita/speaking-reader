export interface Segment {
  /** e.g. "Q1. Do you work or are you a student?" or "English" */
  label: string;
  /** Clean plain-text English content, paragraphs separated by \n\n */
  text: string;
  /**
   * Clean plain-text Japanese translation (from the source `日本語` section),
   * paragraphs separated by \n\n. Display-only — never spoken or highlighted.
   * Absent when the source has no Japanese section.
   */
  translation?: string;
}

export interface Lesson {
  /** Title from the first `# ...` heading of the MD file */
  title: string;
  /** Basename of the MD file, e.g. "01-studies-work.md" */
  file: string;
  segments: Segment[];
}

export interface Group {
  /** e.g. "Part 1", "Part 1 · special topics", "Part 2" */
  label: string;
  lessons: Lesson[];
}

declare global {
  interface Window {
    LESSONS: Group[];
  }
}
