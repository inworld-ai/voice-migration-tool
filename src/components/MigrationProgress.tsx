"use client";

import type { VoiceMigrationState } from "@/lib/types";

interface Props {
  voices: VoiceMigrationState[];
  isRunning: boolean;
  completedCount: number;
  totalCount: number;
  error: string | null;
}

const STATE_ICONS: Record<string, React.ReactNode> = {
  pending: (
    <div className="w-5 h-5 rounded-full border-2 border-border" />
  ),
  active: (
    <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin-slow" />
  ),
  done: (
    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path d="M1 4L3.5 6.5L9 1" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ),
  error: (
    <div className="w-5 h-5 rounded-full bg-error/20 flex items-center justify-center">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1 1L7 7M7 1L1 7" stroke="var(--color-error)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  ),
};

export default function MigrationProgress({ voices, isRunning, completedCount, totalCount, error }: Props) {
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[13px] text-text-muted mb-2">
          <span>{isRunning ? "Migrating..." : "Migration complete"}</span>
          <span>{completedCount} / {totalCount}</span>
        </div>
        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3.5 py-2.5 mb-4">
          {error}
        </div>
      )}

      {/* Voice steps */}
      <div className="space-y-2">
        {voices.map((voice) => (
          <div
            key={voice.voiceId}
            className={`flex items-start gap-3 bg-input-bg border rounded-lg p-3 transition-colors ${
              voice.state === "active" ? "border-accent/40" : "border-border"
            }`}
          >
            <div className="pt-0.5">{STATE_ICONS[voice.state]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{voice.voiceName}</div>
              <div className={`text-[12px] mt-0.5 ${
                voice.state === "error" ? "text-error" :
                voice.state === "done" ? "text-success" :
                "text-text-muted"
              }`}>
                {voice.message}
              </div>
              {voice.inworldVoiceId && (
                <div className="text-[11px] text-text-muted mt-1 font-mono">
                  ID: {voice.inworldVoiceId}
                </div>
              )}
              {voice.warnings && voice.warnings.length > 0 && (
                <div className="text-[11px] text-warning mt-1">
                  {voice.warnings.join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
