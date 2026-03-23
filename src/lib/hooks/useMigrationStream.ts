"use client";

import { useReducer, useCallback, useRef } from "react";
import type { MigrationEvent, VoiceMigrationState, StepState } from "@/lib/types";

interface MigrationStreamState {
  voices: VoiceMigrationState[];
  isRunning: boolean;
  error: string | null;
}

type Action =
  | { type: "INIT"; voiceIds: string[] }
  | { type: "SET_RUNNING"; running: boolean }
  | { type: "UPDATE_VOICE"; voiceId: string; updates: Partial<VoiceMigrationState> }
  | { type: "SET_ERROR"; error: string }
  | { type: "RESET" };

function reducer(state: MigrationStreamState, action: Action): MigrationStreamState {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        voices: action.voiceIds.map((id) => ({
          voiceId: id,
          voiceName: id,
          state: "pending" as StepState,
          message: "Waiting...",
        })),
        error: null,
      };
    case "SET_RUNNING":
      return { ...state, isRunning: action.running };
    case "UPDATE_VOICE":
      return {
        ...state,
        voices: state.voices.map((v) =>
          v.voiceId === action.voiceId ? { ...v, ...action.updates } : v
        ),
      };
    case "SET_ERROR":
      return { ...state, error: action.error, isRunning: false };
    case "RESET":
      return { voices: [], isRunning: false, error: null };
    default:
      return state;
  }
}

const initialState: MigrationStreamState = {
  voices: [],
  isRunning: false,
  error: null,
};

export function useMigrationStream() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const processEvent = useCallback((event: MigrationEvent) => {
    switch (event.type) {
      case "progress":
        dispatch({
          type: "UPDATE_VOICE",
          voiceId: event.voiceId,
          updates: { state: "active", message: event.message, voiceName: event.voiceName },
        });
        break;
      case "voice_done":
        dispatch({
          type: "UPDATE_VOICE",
          voiceId: event.voiceId,
          updates: {
            state: "done",
            message: "Migrated successfully",
            voiceName: event.voiceName,
            inworldVoiceId: event.inworldVoiceId,
            warnings: event.warnings,
          },
        });
        break;
      case "voice_error":
        dispatch({
          type: "UPDATE_VOICE",
          voiceId: event.voiceId,
          updates: {
            state: "error",
            message: event.error,
            voiceName: event.voiceName,
            error: event.error,
          },
        });
        break;
      case "error":
        dispatch({ type: "SET_ERROR", error: event.error });
        break;
    }
  }, []);

  const startMigration = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      dispatch({ type: "SET_RUNNING", running: true });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          throw new Error(err.error || `Request failed: HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as MigrationEvent;
              processEvent(event);
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          dispatch({ type: "SET_ERROR", error: err.message });
        }
      } finally {
        dispatch({ type: "SET_RUNNING", running: false });
        abortRef.current = null;
      }
    },
    [processEvent]
  );

  const initVoices = useCallback((voiceIds: string[]) => {
    dispatch({ type: "INIT", voiceIds });
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    dispatch({ type: "RESET" });
  }, []);

  const completedCount = state.voices.filter((v) => v.state === "done" || v.state === "error").length;
  const successCount = state.voices.filter((v) => v.state === "done").length;
  const errorCount = state.voices.filter((v) => v.state === "error").length;

  return {
    ...state,
    completedCount,
    successCount,
    errorCount,
    totalCount: state.voices.length,
    initVoices,
    startMigration,
    reset,
  };
}
