"use client";

import { useRef, useState } from "react";
import type { ElevenLabsVoice } from "@/lib/types";

interface Props {
  voice: ElevenLabsVoice;
  selected: boolean;
  onToggle: () => void;
}

export default function VoiceCard({ voice, selected, onToggle }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !voice.preview_url) return;

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const sampleCount = voice.samples?.length || 0;
  const labels = Object.entries(voice.labels || {}).filter(([, v]) => v);

  const categoryColors: Record<string, string> = {
    cloned: "bg-accent/20 text-accent",
    professional: "bg-success/20 text-success",
    generated: "bg-warning/20 text-warning",
    premade: "bg-border text-text-muted",
  };
  const categoryClass = categoryColors[voice.category] || categoryColors.premade;

  return (
    <div
      onClick={onToggle}
      className={`bg-input-bg border rounded-[10px] p-4 cursor-pointer transition-colors hover:border-accent/50 ${
        selected ? "border-accent" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          <div
            className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? "bg-accent border-accent"
                : "border-border hover:border-text-muted"
            }`}
          >
            {selected && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="#1a1714" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>

        {/* Voice info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{voice.name}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${categoryClass}`}>
              {voice.category}
            </span>
          </div>

          {voice.description && (
            <p className="text-[12px] text-text-muted mb-1.5 line-clamp-1">{voice.description}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {labels.map(([key, value]) => (
              <span key={key} className="text-[11px] text-text-muted bg-card px-1.5 py-0.5 rounded">
                {key}: {value}
              </span>
            ))}
            <span className="text-[11px] text-text-muted">
              {sampleCount} sample{sampleCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Preview play button */}
        {voice.preview_url && (
          <button
            onClick={togglePlay}
            className="shrink-0 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center hover:border-accent transition-colors"
            title="Preview voice"
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-accent">
                <rect x="1" y="1" width="3" height="8" rx="0.5" />
                <rect x="6" y="1" width="3" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" className="text-accent ml-0.5">
                <path d="M0 0L10 6L0 12Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {voice.preview_url && (
        <audio
          ref={audioRef}
          src={voice.preview_url}
          onEnded={() => setIsPlaying(false)}
          preload="none"
        />
      )}
    </div>
  );
}
