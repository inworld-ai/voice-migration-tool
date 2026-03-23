"use client";

import { useState, useRef, useCallback } from "react";
import type { VoiceMigrationState, ApiConfig, ElevenLabsVoice } from "@/lib/types";

interface Props {
  voices: VoiceMigrationState[];
  onStartOver: () => void;
  apiConfig: ApiConfig;
  elevenLabsVoices: ElevenLabsVoice[];
}

interface PreviewState {
  utterance: string;
  audioSrc: string | null;
  generating: boolean;
  synthesizing: boolean;
  error: string | null;
  manualMode: boolean;
  manualText: string;
}

export default function MigrationResult({ voices, onStartOver, apiConfig, elevenLabsVoices }: Props) {
  const [copied, setCopied] = useState(false);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const succeeded = voices.filter((v) => v.state === "done");
  const failed = voices.filter((v) => v.state === "error");

  const copyAllIds = async () => {
    const ids = succeeded.map((v) => `${v.voiceName}: ${v.inworldVoiceId}`).join("\n");
    await navigator.clipboard.writeText(ids);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getElVoice = (voiceId: string) =>
    elevenLabsVoices.find((v) => v.voice_id === voiceId);

  const updatePreview = (voiceId: string, updates: Partial<PreviewState>) => {
    setPreviews((prev) => ({
      ...prev,
      [voiceId]: { ...prev[voiceId], ...updates },
    }));
  };

  const synthesizeText = useCallback(async (voice: VoiceMigrationState, text: string) => {
    if (!voice.inworldVoiceId || !text.trim()) return;

    updatePreview(voice.voiceId, { synthesizing: true, error: null, audioSrc: null });

    try {
      const synthResp = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voiceId: voice.inworldVoiceId,
          inworldKey: apiConfig.inworldKey,
        }),
      });

      if (!synthResp.ok) {
        const err = await synthResp.json().catch(() => ({ error: "Synthesis failed" }));
        throw new Error(err.error);
      }

      const { audioContent } = await synthResp.json();
      if (!audioContent) throw new Error("No audio returned from TTS");

      const audioSrc = `data:audio/wav;base64,${audioContent}`;
      updatePreview(voice.voiceId, { audioSrc, synthesizing: false, utterance: text.trim() });

      setTimeout(() => {
        const audio = audioRefs.current[voice.voiceId];
        if (audio) audio.play();
      }, 100);
    } catch (e) {
      updatePreview(voice.voiceId, {
        synthesizing: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiConfig]);

  const generateAndPlay = useCallback(async (voice: VoiceMigrationState) => {
    if (!voice.inworldVoiceId) return;

    const elVoice = getElVoice(voice.voiceId);
    const existing = previews[voice.voiceId];

    // If we already have audio, just play it
    if (existing?.audioSrc) {
      const audio = audioRefs.current[voice.voiceId];
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
      return;
    }

    // No Anthropic key — switch to manual text input mode
    if (!apiConfig.anthropicKey) {
      updatePreview(voice.voiceId, {
        utterance: "",
        audioSrc: null,
        generating: false,
        synthesizing: false,
        error: null,
        manualMode: true,
        manualText: "",
      });
      return;
    }

    // Step 1: Generate utterance with Claude
    updatePreview(voice.voiceId, {
      utterance: "",
      audioSrc: null,
      generating: true,
      synthesizing: false,
      error: null,
      manualMode: false,
      manualText: "",
    });

    try {
      const uttResp = await fetch("/api/generate-utterance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropicKey: apiConfig.anthropicKey,
          voiceName: voice.voiceName,
          description: elVoice?.description || "",
          labels: elVoice?.labels || {},
        }),
      });

      if (!uttResp.ok) {
        const err = await uttResp.json().catch(() => ({ error: "Failed to generate utterance" }));
        throw new Error(err.error);
      }

      const { utterance } = await uttResp.json();
      updatePreview(voice.voiceId, { utterance, generating: false, synthesizing: true });

      // Step 2: Synthesize with Inworld TTS
      await synthesizeText(voice, utterance);
    } catch (e) {
      updatePreview(voice.voiceId, {
        generating: false,
        synthesizing: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiConfig, elevenLabsVoices, previews, synthesizeText]);

  return (
    <div>
      {/* Summary */}
      <div className="flex gap-4 mb-5">
        <div className="flex-1 bg-success/10 border border-success/20 rounded-lg p-4 text-center">
          <div className="text-2xl font-light text-success">{succeeded.length}</div>
          <div className="text-[12px] text-success/80">Succeeded</div>
        </div>
        {failed.length > 0 && (
          <div className="flex-1 bg-error/10 border border-error/20 rounded-lg p-4 text-center">
            <div className="text-2xl font-light text-error">{failed.length}</div>
            <div className="text-[12px] text-error/80">Failed</div>
          </div>
        )}
      </div>

      {/* Successful voices */}
      {succeeded.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-text-muted">Migrated Voices</h3>
            <button
              onClick={copyAllIds}
              className="text-[12px] text-accent hover:text-accent-hover transition-colors"
            >
              {copied ? "Copied!" : "Copy all IDs"}
            </button>
          </div>
          <div className="space-y-2">
            {succeeded.map((voice) => {
              const preview = previews[voice.voiceId];
              const isLoading = preview?.generating || preview?.synthesizing;

              return (
                <div
                  key={voice.voiceId}
                  className="bg-input-bg border border-border rounded-lg p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{voice.voiceName}</div>
                      <div className="text-[11px] text-text-muted font-mono truncate">
                        {voice.inworldVoiceId}
                      </div>
                    </div>

                    {/* Preview button */}
                    <button
                      onClick={() => generateAndPlay(voice)}
                      disabled={isLoading}
                      className="shrink-0 flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-[12px] text-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin-slow" />
                          {preview?.generating ? "Generating..." : "Synthesizing..."}
                        </>
                      ) : preview?.audioSrc ? (
                        <>
                          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                            <path d="M0 0L10 6L0 12Z" />
                          </svg>
                          Replay
                        </>
                      ) : (
                        <>
                          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                            <path d="M0 0L10 6L0 12Z" />
                          </svg>
                          Preview
                        </>
                      )}
                    </button>
                  </div>

                  {/* Manual text input mode (no Anthropic key) */}
                  {preview?.manualMode && !preview?.audioSrc && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={preview.manualText || ""}
                          onChange={(e) => updatePreview(voice.voiceId, { manualText: e.target.value })}
                          placeholder="Type a preview sentence..."
                          className="flex-1 bg-card border border-border rounded-lg text-text py-1.5 px-3 text-[12px] outline-none focus:border-accent transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && preview.manualText?.trim()) {
                              synthesizeText(voice, preview.manualText);
                            }
                          }}
                        />
                        <button
                          onClick={() => synthesizeText(voice, preview.manualText || "")}
                          disabled={!preview.manualText?.trim() || preview.synthesizing}
                          className="shrink-0 bg-accent text-[#1a1714] px-3 py-1.5 rounded-lg text-[12px] font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {preview.synthesizing ? "Synthesizing..." : "Synthesize"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Preview details */}
                  {preview?.utterance && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[12px] text-text-muted italic">&ldquo;{preview.utterance}&rdquo;</p>
                    </div>
                  )}

                  {preview?.error && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[12px] text-error">{preview.error}</p>
                    </div>
                  )}

                  {preview?.audioSrc && (
                    <audio
                      ref={(el) => { audioRefs.current[voice.voiceId] = el; }}
                      src={preview.audioSrc}
                      preload="auto"
                    />
                  )}

                  {voice.warnings && voice.warnings.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-[11px] text-warning">{voice.warnings.join(", ")}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed voices */}
      {failed.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm text-text-muted mb-2">Failed</h3>
          <div className="space-y-1.5">
            {failed.map((voice) => (
              <div
                key={voice.voiceId}
                className="flex items-start gap-3 bg-input-bg border border-error/20 rounded-lg p-3"
              >
                <div className="w-5 h-5 rounded-full bg-error/20 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 1L7 7M7 1L1 7" stroke="var(--color-error)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{voice.voiceName}</div>
                  <div className="text-[12px] text-error mt-0.5">{voice.error}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <button
        onClick={onStartOver}
        className="w-full bg-card border border-border text-text py-2.5 px-6 rounded-lg text-sm hover:border-accent transition-colors"
      >
        Start Over
      </button>
    </div>
  );
}
