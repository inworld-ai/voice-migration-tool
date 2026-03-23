import { NextRequest } from "next/server";

export const maxDuration = 300; // 5 minutes

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok && RETRYABLE_STATUSES.has(resp.status) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 1000, 10000)));
        continue;
      }
      return resp;
    } catch (e) {
      if (attempt < maxRetries && e instanceof TypeError) {
        await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 1000, 10000)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Request failed after retries");
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const {
    elevenLabsKey,
    inworldKey,
    inworldWorkspace,
    voiceIds,
  }: {
    elevenLabsKey: string;
    inworldKey: string;
    inworldWorkspace: string;
    voiceIds: string[];
  } = data;

  if (!elevenLabsKey || !inworldKey || !inworldWorkspace || !voiceIds?.length) {
    return new Response(JSON.stringify({ error: "Missing required parameters" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const emit = async (obj: Record<string, unknown>) => {
    await writer.write(encoder.encode(JSON.stringify(obj) + "\n"));
  };

  const cloneUrl = `https://api.inworld.ai/voices/v1/workspaces/${inworldWorkspace}/voices:clone`;

  // Run migration in background
  (async () => {
    let succeeded = 0;
    let failed = 0;

    for (const voiceId of voiceIds) {
      let voiceName = voiceId;

      try {
        // Step 1: Fetch voice details from ElevenLabs
        await emit({ type: "progress", voiceId, voiceName, step: "fetch", message: "Fetching voice details..." });

        const voiceResp = await fetchWithRetry(
          `https://api.elevenlabs.io/v1/voices/${voiceId}`,
          { headers: { "xi-api-key": elevenLabsKey } }
        );

        if (!voiceResp.ok) {
          const err = await voiceResp.json().catch(() => ({}));
          throw new Error(err?.detail?.message || `Failed to fetch voice (${voiceResp.status})`);
        }

        const voiceData = await voiceResp.json();
        voiceName = voiceData.name || voiceId;
        const samples = voiceData.samples || [];

        // Step 2: Download audio samples
        const voiceSamples: { audioData: string }[] = [];

        if (samples.length > 0) {
          await emit({
            type: "progress", voiceId, voiceName, step: "download",
            message: `Downloading ${samples.length} sample${samples.length > 1 ? "s" : ""}...`,
          });

          for (const sample of samples) {
            const audioResp = await fetchWithRetry(
              `https://api.elevenlabs.io/v1/voices/${voiceId}/samples/${sample.sample_id}/audio`,
              { headers: { "xi-api-key": elevenLabsKey } }
            );

            if (!audioResp.ok) {
              await emit({
                type: "progress", voiceId, voiceName, step: "download_warn",
                message: `Warning: Failed to download sample ${sample.file_name}, skipping...`,
              });
              continue;
            }

            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
            voiceSamples.push({ audioData: audioBuffer.toString("base64") });
          }
        }

        // Fallback: use preview_url if no samples available
        if (voiceSamples.length === 0 && voiceData.preview_url) {
          await emit({
            type: "progress", voiceId, voiceName, step: "download_preview",
            message: "No samples found, downloading preview audio...",
          });

          const previewResp = await fetch(voiceData.preview_url);
          if (previewResp.ok) {
            const previewBuffer = Buffer.from(await previewResp.arrayBuffer());
            voiceSamples.push({ audioData: previewBuffer.toString("base64") });
          }
        }

        if (voiceSamples.length === 0) {
          throw new Error("No audio samples or preview available for this voice");
        }

        // Step 3: Clone to Inworld
        await emit({
          type: "progress", voiceId, voiceName, step: "clone",
          message: `Cloning to Inworld (${voiceSamples.length} sample${voiceSamples.length > 1 ? "s" : ""})...`,
        });

        const cloneResp = await fetchWithRetry(cloneUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${inworldKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: voiceName,
            langCode: "EN_US",
            voiceSamples,
            audioProcessingConfig: { removeBackgroundNoise: false },
          }),
        });

        if (!cloneResp.ok) {
          const errData = await cloneResp.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Inworld clone failed (${cloneResp.status})`);
        }

        const cloneData = await cloneResp.json();
        const voiceInfo = cloneData.voice || {};
        const validation = cloneData.audioSamplesValidated || [{}];
        const errors = validation[0]?.errors || [];
        const warnings = (validation[0]?.warnings || []).map(
          (w: { text?: string }) => w.text || String(w)
        );

        if (errors.length > 0) {
          const errorTexts = errors.map((e: { text?: string }) => e.text || String(e));
          throw new Error(`Validation failed: ${errorTexts.join(", ")}`);
        }

        const inworldVoiceId = voiceInfo.voiceId || "";

        await emit({ type: "voice_done", voiceId, voiceName, inworldVoiceId, warnings });
        succeeded++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await emit({ type: "voice_error", voiceId, voiceName, error: errorMsg });
        failed++;
      }
    }

    await emit({ type: "complete", total: voiceIds.length, succeeded, failed });
    await writer.close();
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
