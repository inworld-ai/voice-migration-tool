"use client";

import { useState } from "react";
import type { ApiConfig } from "@/lib/types";

interface Props {
  onConnect: (config: ApiConfig) => void;
  isLoading: boolean;
  error: string | null;
}

export default function ApiKeyForm({ onConnect, isLoading, error }: Props) {
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [inworldKey, setInworldKey] = useState("");
  const [inworldWorkspace, setInworldWorkspace] = useState("");
  const canSubmit = elevenLabsKey.trim() && inworldKey.trim() && inworldWorkspace.trim() && !isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConnect({
      elevenLabsKey: elevenLabsKey.trim(),
      inworldKey: inworldKey.trim(),
      inworldWorkspace: inworldWorkspace.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-[13px] text-text-muted mb-1.5">ElevenLabs API Key</label>
        <input
          type="password"
          value={elevenLabsKey}
          onChange={(e) => setElevenLabsKey(e.target.value)}
          placeholder="xi-..."
          className="w-full bg-input-bg border border-border rounded-lg text-text py-2.5 px-3.5 text-sm outline-none focus:border-accent transition-colors"
        />
      </div>

      <div>
        <label className="block text-[13px] text-text-muted mb-1.5">Inworld API Key</label>
        <input
          type="password"
          value={inworldKey}
          onChange={(e) => setInworldKey(e.target.value)}
          placeholder="Base64-encoded API key"
          className="w-full bg-input-bg border border-border rounded-lg text-text py-2.5 px-3.5 text-sm outline-none focus:border-accent transition-colors"
        />
      </div>

      <div>
        <label className="block text-[13px] text-text-muted mb-1.5">Inworld Workspace</label>
        <input
          type="text"
          value={inworldWorkspace}
          onChange={(e) => setInworldWorkspace(e.target.value)}
          placeholder="my_workspace_name"
          className="w-full bg-input-bg border border-border rounded-lg text-text py-2.5 px-3.5 text-sm outline-none focus:border-accent transition-colors"
        />
      </div>

      {error && (
        <div className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3.5 py-2.5">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-accent text-[#1a1714] py-2.5 px-6 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-[#1a1714]/30 border-t-[#1a1714] rounded-full animate-spin-slow" />
            Connecting...
          </>
        ) : (
          "Connect & Load Voices"
        )}
      </button>
    </form>
  );
}
