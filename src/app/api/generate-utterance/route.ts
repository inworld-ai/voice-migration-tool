import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SONNET_MODEL = "claude-sonnet-4-5";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const anthropicKey: string = data.anthropicKey || "";
  const voiceName: string = data.voiceName || "";
  const voiceDescription: string = data.description || "";
  const voiceLabels: Record<string, string> = data.labels || {};

  if (!anthropicKey) {
    return NextResponse.json({ error: "no_api_key", message: "Anthropic API key not provided" }, { status: 400 });
  }

  if (!voiceName) {
    return NextResponse.json({ error: "voiceName is required" }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });

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

    const resp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `${systemMsg}\n\n${metadataLines.join("\n")}\n\nWrite a natural preview utterance.`,
      }],
    });

    const utterance = (resp.content[0] as { text: string }).text.trim().replace(/^["']|["']$/g, "");

    return NextResponse.json({ utterance });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
