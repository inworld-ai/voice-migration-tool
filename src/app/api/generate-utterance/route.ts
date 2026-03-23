import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const inworldKey: string = data.inworldKey || "";
  const voiceName: string = data.voiceName || "";
  const voiceDescription: string = data.description || "";
  const voiceLabels: Record<string, string> = data.labels || {};

  if (!inworldKey) {
    return NextResponse.json({ error: "Inworld API key is required" }, { status: 400 });
  }

  if (!voiceName) {
    return NextResponse.json({ error: "voiceName is required" }, { status: 400 });
  }

  try {
    const metadataLines: string[] = [`Voice name: ${voiceName}`];
    if (voiceDescription) metadataLines.push(`Description: ${voiceDescription}`);
    const labelStr = Object.entries(voiceLabels)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    if (labelStr) metadataLines.push(`Labels: ${labelStr}`);

    const systemMsg =
      "You are a voice preview scriptwriter for a TTS voice cloning platform. " +
      "Given metadata about a voice, write a preview utterance (2 sentences, 12-16 words total) that:\n" +
      "- Sounds natural and vivid, fitting the voice's persona and style\n" +
      "- Matches the register, formality, and energy implied by the voice name and labels\n" +
      "- Sounds specific and alive — not generic or cliché\n" +
      "- Does NOT reference voice cloning, AI, or the platform\n\n" +
      "Respond with ONLY the utterance text. No quotes, no explanation.";

    const resp = await fetch("https://api.inworld.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${inworldKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "auto",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `${systemMsg}\n\n${metadataLines.join("\n")}\n\nWrite a natural preview utterance.`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const errMsg = err?.error?.message || err?.detail || `Router API error (${resp.status})`;
      return NextResponse.json({ error: String(errMsg) }, { status: resp.status });
    }

    const result = await resp.json();
    const utterance = (result.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");

    if (!utterance) {
      return NextResponse.json({ error: "No utterance generated" }, { status: 500 });
    }

    return NextResponse.json({ utterance });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
