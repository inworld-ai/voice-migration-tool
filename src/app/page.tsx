"use client";

import { useState, useCallback } from "react";
import type { ApiConfig, ElevenLabsVoice, Phase } from "@/lib/types";
import { useMigrationStream } from "@/lib/hooks/useMigrationStream";
import ApiKeyForm from "@/components/ApiKeyForm";
import VoiceList from "@/components/VoiceList";
import MigrationProgress from "@/components/MigrationProgress";
import MigrationResult from "@/components/MigrationResult";

export default function Home() {
  // Phase management
  const [phase, setPhase] = useState<Phase>("setup");

  // Setup state
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Voice listing state
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Migration state
  const migration = useMigrationStream();

  /* ── Setup phase ─────────────────────────────────────── */

  const handleConnect = useCallback(async (config: ApiConfig) => {
    setConnectLoading(true);
    setConnectError(null);

    try {
      // Validate by fetching voices
      const resp = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elevenLabsKey: config.elevenLabsKey }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Connection failed" }));
        throw new Error(err.error || `Failed to connect (${resp.status})`);
      }

      const data = await resp.json();
      setVoices(data.voices || []);
      setApiConfig(config);
      setPhase("listing");
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectLoading(false);
    }
  }, []);

  /* ── Listing phase ───────────────────────────────────── */

  const toggleVoice = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const filtered = voices.filter((v) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q) ||
          Object.values(v.labels || {}).some((l) => l.toLowerCase().includes(q))
        );
      }
      return true;
    });
    setSelectedIds(new Set(filtered.map((v) => v.voice_id)));
  }, [voices, searchQuery]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /* ── Migration phase ─────────────────────────────────── */

  const handleMigrate = useCallback(async () => {
    if (!apiConfig || selectedIds.size === 0) return;

    const voiceIds = Array.from(selectedIds);
    migration.initVoices(voiceIds);
    setPhase("migrating");

    await migration.startMigration("/api/migrate", {
      elevenLabsKey: apiConfig.elevenLabsKey,
      inworldKey: apiConfig.inworldKey,
      inworldWorkspace: apiConfig.inworldWorkspace,
      voiceIds,
    });

    setPhase("results");
  }, [apiConfig, selectedIds, migration]);

  /* ── Results phase ───────────────────────────────────── */

  const handleStartOver = useCallback(() => {
    migration.reset();
    setSelectedIds(new Set());
    setPhase("listing");
  }, [migration]);

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="max-w-[700px] mx-auto p-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-light mb-2" style={{ fontFamily: "Georgia, serif" }}>
          {phase === "setup" && "Voice Clone Migration"}
          {phase === "listing" && "Select Voices"}
          {phase === "migrating" && "Migrating Voices"}
          {phase === "results" && "Voice Clone Migration"}
        </h1>
        <p className="text-text-muted text-sm">
          {phase === "setup" && "Connect your ElevenLabs and Inworld accounts to begin migrating voices."}
          {phase === "listing" && `${voices.length} voice clone${voices.length !== 1 ? "s" : ""} found in your ElevenLabs account. Select the voices you want to clone into Inworld.`}
          {phase === "migrating" && "Downloading samples from ElevenLabs and cloning them into Inworld..."}
          {phase === "results" && "Here are the results of your voice migration."}
        </p>
      </div>

      {/* Phase: Setup */}
      {phase === "setup" && (
        <div className="bg-card border border-border rounded-xl p-6">
          <ApiKeyForm
            onConnect={handleConnect}
            isLoading={connectLoading}
            error={connectError}
          />
        </div>
      )}

      {/* Phase: Listing */}
      {phase === "listing" && (
        <>
          <VoiceList
            voices={voices}
            selectedIds={selectedIds}
            onToggle={toggleVoice}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onMigrate={handleMigrate}
          />
          <button
            onClick={() => {
              setApiConfig(null);
              setPhase("setup");
            }}
            className="mt-4 text-[12px] text-text-muted hover:text-text transition-colors"
          >
            Change API keys
          </button>
        </>
      )}

      {/* Phase: Migrating */}
      {phase === "migrating" && (
        <div className="bg-card border border-border rounded-xl p-6">
          <MigrationProgress
            voices={migration.voices}
            isRunning={migration.isRunning}
            completedCount={migration.completedCount}
            totalCount={migration.totalCount}
            error={migration.error}
          />
        </div>
      )}

      {/* Phase: Results */}
      {phase === "results" && (
        <div className="bg-card border border-border rounded-xl p-6">
          <MigrationResult
            voices={migration.voices}
            onStartOver={handleStartOver}
            apiConfig={apiConfig!}
            elevenLabsVoices={voices}
          />
        </div>
      )}
    </div>
  );
}
