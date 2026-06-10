/** Relative audio path helpers, shared by the build and the browser app. */

export function audioBase(
  voiceKey: string,
  g: number,
  l: number,
  s: number,
  sent: number,
): string {
  return `audio/${voiceKey}/${g}_${l}_${s}_${sent}`;
}

export function mp3Url(voiceKey: string, g: number, l: number, s: number, sent: number): string {
  return `${audioBase(voiceKey, g, l, s, sent)}.mp3`;
}

export function cueUrl(voiceKey: string, g: number, l: number, s: number, sent: number): string {
  return `${audioBase(voiceKey, g, l, s, sent)}.mp3.json`;
}
