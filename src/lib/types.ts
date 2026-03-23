/* ── ElevenLabs API types ─────────────────────────────── */

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  description: string | null;
  preview_url: string | null;
  samples: ElevenLabsSample[] | null;
  fine_tuning: { is_allowed_to_fine_tune: boolean } | null;
  high_quality_base_model_ids: string[] | null;
}

export interface ElevenLabsSample {
  sample_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

/* ── Configuration ───────────────────────────────────── */

export interface ApiConfig {
  elevenLabsKey: string;
  inworldKey: string;
  inworldWorkspace: string;
  anthropicKey?: string;
}

/* ── Migration streaming events (server → client) ────── */

export type MigrationEvent =
  | { type: "progress"; voiceId: string; voiceName: string; step: string; message: string }
  | { type: "voice_done"; voiceId: string; voiceName: string; inworldVoiceId: string; warnings: string[] }
  | { type: "voice_error"; voiceId: string; voiceName: string; error: string }
  | { type: "complete"; total: number; succeeded: number; failed: number }
  | { type: "error"; error: string };

/* ── Client-side migration state ─────────────────────── */

export type StepState = "pending" | "active" | "done" | "error";

export interface VoiceMigrationState {
  voiceId: string;
  voiceName: string;
  state: StepState;
  message: string;
  inworldVoiceId?: string;
  warnings?: string[];
  error?: string;
}

/* ── Page phases ─────────────────────────────────────── */

export type Phase = "setup" | "listing" | "migrating" | "results";
