/** Single source of truth for the pre-generated voices (build + app). */
export interface VoiceDef {
  /** URL-safe folder key, e.g. "sonia". */
  key: string;
  /** edge-tts / Azure voice id, e.g. "en-GB-SoniaNeural". */
  id: string;
  /** Human label for the picker. */
  label: string;
}

export const VOICES: VoiceDef[] = [
  { key: "sonia", id: "en-GB-SoniaNeural", label: "Sonia (UK, female)" },
  { key: "ryan", id: "en-GB-RyanNeural", label: "Ryan (UK, male)" },
  { key: "libby", id: "en-GB-LibbyNeural", label: "Libby (UK, female)" },
];

export const DEFAULT_VOICE_KEY = "sonia";

export function isVoiceKey(key: string): boolean {
  return VOICES.some((v) => v.key === key);
}
