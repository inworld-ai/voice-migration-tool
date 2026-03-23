import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { writeFile, unlink, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export const maxDuration = 300; // 5 minutes

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_CLONE_ATTEMPTS = 3; // max rename attempts on 409

// Inworld voice clone requirements
const SUPPORTED_FORMAT = "wav"; // convert everything to wav for reliability
const MIN_DURATION_SECS = 5;
const MAX_DURATION_SECS = 15;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

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

// Run ffmpeg/ffprobe and return stdout
function runFfmpeg(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${cmd} failed: ${stderr || error.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

// Get audio duration in seconds using ffprobe
async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await runFfmpeg("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    filePath,
  ]);
  const info = JSON.parse(stdout);
  return parseFloat(info.format?.duration || "0");
}

// Process audio: convert to wav, pad if too short, trim if too long, enforce size limit
async function processAudio(audioBuffer: Buffer, sampleIndex: number): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `ivc-in-${id}`);
  const outputPath = join(tmpdir(), `ivc-out-${id}.${SUPPORTED_FORMAT}`);

  try {
    // Write raw audio to temp file
    await writeFile(inputPath, audioBuffer);

    // Get duration
    let duration: number;
    try {
      duration = await getAudioDuration(inputPath);
    } catch {
      // If ffprobe can't read it, try converting first then measuring
      duration = 0;
    }

    // Build ffmpeg args for conversion + padding/trimming
    const ffmpegArgs: string[] = ["-y", "-i", inputPath];

    if (duration > 0 && duration < MIN_DURATION_SECS) {
      // Pad short audio by looping it to reach minimum duration
      // Use apad filter to add silence, or loop the audio
      const loopCount = Math.ceil(MIN_DURATION_SECS / duration);
      // Re-read with stream_loop to repeat the audio
      ffmpegArgs.length = 0;
      ffmpegArgs.push(
        "-y",
        "-stream_loop", String(loopCount - 1),
        "-i", inputPath,
        "-t", String(MIN_DURATION_SECS),
      );
    } else if (duration > MAX_DURATION_SECS) {
      // Trim to max duration
      ffmpegArgs.push("-t", String(MAX_DURATION_SECS));
    }

    // Convert to mono wav, 22050Hz (standard for voice cloning), enforce quality
    ffmpegArgs.push(
      "-ac", "1",
      "-ar", "22050",
      "-sample_fmt", "s16",
      outputPath,
    );

    await runFfmpeg("ffmpeg", ffmpegArgs);

    // Check file size — if too large, reduce sample rate
    const fileStats = await stat(outputPath);
    if (fileStats.size > MAX_FILE_SIZE_BYTES) {
      const reducedPath = join(tmpdir(), `ivc-reduced-${id}.${SUPPORTED_FORMAT}`);
      await runFfmpeg("ffmpeg", [
        "-y", "-i", outputPath,
        "-ac", "1", "-ar", "16000", "-sample_fmt", "s16",
        reducedPath,
      ]);
      const result = await import("fs").then((fs) => fs.readFileSync(reducedPath));
      await unlink(reducedPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
      await unlink(inputPath).catch(() => {});
      return result;
    }

    const result = await import("fs").then((fs) => fs.readFileSync(outputPath));
    return result;
  } finally {
    // Cleanup temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

// Check if ffmpeg is available
async function checkFfmpeg(): Promise<boolean> {
  try {
    await runFfmpeg("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

// Parse Inworld error response into a readable message
function parseInworldError(status: number, body: string): string {
  let errMsg = `Inworld clone failed (${status})`;
  try {
    const errData = JSON.parse(body);
    errMsg = errData?.error?.message
      || errData?.message
      || errData?.detail
      || (typeof errData?.error === "string" ? errData.error : null)
      || errMsg;
  } catch {
    if (body && body.length < 300) errMsg = body;
  }
  return errMsg;
}

// Attempt to clone a voice to Inworld, with auto-rename on 409
async function cloneToInworld(
  cloneUrl: string,
  inworldKey: string,
  displayName: string,
  voiceSamples: { audioData: string }[],
): Promise<{ response: Response; displayName: string }> {
  let currentName = displayName;

  for (let attempt = 0; attempt < MAX_CLONE_ATTEMPTS; attempt++) {
    const resp = await fetchWithRetry(cloneUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${inworldKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: currentName,
        langCode: "EN_US",
        voiceSamples,
        audioProcessingConfig: { removeBackgroundNoise: false },
      }),
    });

    if (resp.status === 409 && attempt < MAX_CLONE_ATTEMPTS - 1) {
      // Name conflict — append a suffix and retry
      const suffix = String(attempt + 2).padStart(2, "0");
      currentName = `${displayName}_${suffix}`;
      continue;
    }

    return { response: resp, displayName: currentName };
  }

  throw new Error("Unreachable");
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

  // Check ffmpeg availability once upfront
  const hasFfmpeg = await checkFfmpeg();

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
          let errMsg = err?.detail?.message || err?.detail || `Failed to fetch voice from ElevenLabs (${voiceResp.status})`;
          if (voiceResp.status === 401) {
            errMsg += " — Your ElevenLabs API key may be invalid or expired.";
          } else if (voiceResp.status === 404) {
            errMsg += " — This voice may have been deleted from your ElevenLabs account.";
          }
          throw new Error(errMsg);
        }

        const voiceData = await voiceResp.json();
        voiceName = voiceData.name || voiceId;
        const samples = voiceData.samples || [];

        // Step 2: Download audio samples
        const rawSamples: Buffer[] = [];

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

            rawSamples.push(Buffer.from(await audioResp.arrayBuffer()));
          }
        }

        // Fallback: use preview_url if no samples available
        if (rawSamples.length === 0 && voiceData.preview_url) {
          await emit({
            type: "progress", voiceId, voiceName, step: "download_preview",
            message: "No samples found, downloading preview audio...",
          });

          const previewResp = await fetch(voiceData.preview_url);
          if (previewResp.ok) {
            rawSamples.push(Buffer.from(await previewResp.arrayBuffer()));
          }
        }

        if (rawSamples.length === 0) {
          throw new Error("No audio samples or preview available for this voice");
        }

        // Step 3: Process audio (convert format, pad/trim duration)
        let voiceSamples: { audioData: string }[];

        if (hasFfmpeg) {
          await emit({
            type: "progress", voiceId, voiceName, step: "process",
            message: `Processing ${rawSamples.length} audio sample${rawSamples.length > 1 ? "s" : ""} (format, duration)...`,
          });

          const processed: { audioData: string }[] = [];
          for (let i = 0; i < rawSamples.length; i++) {
            try {
              const processedBuffer = await processAudio(rawSamples[i], i);
              processed.push({ audioData: processedBuffer.toString("base64") });
            } catch (procErr) {
              await emit({
                type: "progress", voiceId, voiceName, step: "process_warn",
                message: `Warning: Could not process sample ${i + 1}, using original...`,
              });
              // Fall back to raw sample
              processed.push({ audioData: rawSamples[i].toString("base64") });
            }
          }
          voiceSamples = processed;
        } else {
          // No ffmpeg — send raw samples and hope for the best
          voiceSamples = rawSamples.map((buf) => ({ audioData: buf.toString("base64") }));
        }

        // Step 4: Clone to Inworld (with auto-rename on 409)
        await emit({
          type: "progress", voiceId, voiceName, step: "clone",
          message: `Cloning to Inworld (${voiceSamples.length} sample${voiceSamples.length > 1 ? "s" : ""})...`,
        });

        const { response: cloneResp, displayName: finalName } = await cloneToInworld(
          cloneUrl, inworldKey, voiceName, voiceSamples,
        );

        if (finalName !== voiceName) {
          await emit({
            type: "progress", voiceId, voiceName, step: "rename",
            message: `Name "${voiceName}" was taken, cloned as "${finalName}"`,
          });
          voiceName = finalName;
        }

        if (!cloneResp.ok) {
          const errText = await cloneResp.text().catch(() => "");
          let errMsg = parseInworldError(cloneResp.status, errText);

          if (cloneResp.status === 400) {
            errMsg += " — The audio sample may be in an unsupported format or corrupted.";
            if (!hasFfmpeg) {
              errMsg += " Install ffmpeg to enable automatic audio conversion: brew install ffmpeg";
            }
          } else if (cloneResp.status === 401 || cloneResp.status === 403) {
            errMsg += " — Check that your Inworld API key has write permissions and is correctly formatted.";
          } else if (cloneResp.status === 409) {
            errMsg += " — A voice with this name already exists and renaming failed after multiple attempts.";
          }

          throw new Error(errMsg);
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
