import { NextRequest, NextResponse } from "next/server";

const INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice";
const INWORLD_MODEL = "inworld-tts-1.5-max";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const { text, voiceId, inworldKey } = data;

  if (!voiceId || !inworldKey) {
    return NextResponse.json({ error: "voiceId and inworldKey are required" }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  try {
    const resp = await fetch(INWORLD_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${inworldKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId,
        modelId: INWORLD_MODEL,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return NextResponse.json({ error: `TTS failed: ${errorText}` }, { status: resp.status });
    }

    const result = await resp.json();
    return NextResponse.json({ audioContent: result.audioContent || "" });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
