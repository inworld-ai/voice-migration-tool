"use client";

import { useMemo } from "react";
import type { ElevenLabsVoice } from "@/lib/types";
import VoiceCard from "./VoiceCard";

interface Props {
  voices: ElevenLabsVoice[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onMigrate: () => void;
}

export default function VoiceList({
  voices,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  searchQuery,
  onSearchChange,
  onMigrate,
}: Props) {
  const filtered = useMemo(() => {
    return voices.filter((v) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = v.name.toLowerCase().includes(q);
        const descMatch = v.description?.toLowerCase().includes(q);
        const labelMatch = Object.values(v.labels || {}).some((l) => l.toLowerCase().includes(q));
        if (!nameMatch && !descMatch && !labelMatch) return false;
      }
      return true;
    });
  }, [voices, searchQuery]);

  const selectedCount = selectedIds.size;
  const filteredSelectedCount = filtered.filter((v) => selectedIds.has(v.voice_id)).length;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search voices..."
          className="flex-1 bg-input-bg border border-border rounded-lg text-text py-2 px-3 text-sm outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Selection controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] text-text-muted">
          {filtered.length} voice{filtered.length !== 1 ? "s" : ""}
          {searchQuery ? ` (${voices.length} total)` : ""}
          {selectedCount > 0 && (
            <span className="text-accent ml-2">{selectedCount} selected</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-[12px] text-accent hover:text-accent-hover transition-colors"
          >
            Select all ({filtered.length})
          </button>
          <span className="text-border">|</span>
          <button
            onClick={onDeselectAll}
            className="text-[12px] text-text-muted hover:text-text transition-colors"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Voice list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {filtered.map((voice) => (
          <VoiceCard
            key={voice.voice_id}
            voice={voice}
            selected={selectedIds.has(voice.voice_id)}
            onToggle={() => onToggle(voice.voice_id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-text-muted py-10 text-sm">
            No voices match your search.
          </div>
        )}
      </div>

      {/* Migrate button */}
      <div className="mt-5 pt-5 border-t border-border">
        <button
          onClick={onMigrate}
          disabled={selectedCount === 0}
          className="w-full bg-accent text-[#1a1714] py-3 px-6 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selectedCount === 0
            ? "Select voices to migrate"
            : `Migrate ${selectedCount} voice${selectedCount > 1 ? "s" : ""} to Inworld`}
        </button>
        {filteredSelectedCount !== selectedCount && selectedCount > 0 && (
          <p className="text-[11px] text-text-muted mt-1.5 text-center">
            {selectedCount - filteredSelectedCount} selected voice{selectedCount - filteredSelectedCount !== 1 ? "s" : ""} hidden by current filter
          </p>
        )}
      </div>
    </div>
  );
}
