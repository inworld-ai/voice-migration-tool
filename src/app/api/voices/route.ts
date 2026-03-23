import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const elevenLabsKey: string = body.elevenLabsKey || "";

  if (!elevenLabsKey) {
    return NextResponse.json({ error: "ElevenLabs API key is required" }, { status: 400 });
  }

  try {
    const allVoices: unknown[] = [];
    let nextPageToken: string | undefined;
    let hasMore = true;

    // Paginate through all voices
    while (hasMore) {
      const params = new URLSearchParams({ show_legacy: "false" });
      if (body.search) params.set("search", body.search);
      // Only show user-cloned voices — not ElevenLabs stock library
      params.set("category", "cloned");
      params.set("page_size", "100");
      if (nextPageToken) params.set("next_page_token", nextPageToken);

      const resp = await fetch(`https://api.elevenlabs.io/v1/voices?${params}`, {
        headers: { "xi-api-key": elevenLabsKey },
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData?.detail?.message || errData?.detail || `ElevenLabs API error (${resp.status})`;
        return NextResponse.json({ error: String(errMsg) }, { status: resp.status });
      }

      const data = await resp.json();
      const voices = data.voices || [];
      allVoices.push(...voices);

      hasMore = data.has_more === true;
      nextPageToken = data.next_page_token;
    }

    // Safety filter: only return cloned voices even if API returns others
    const clonedVoices = allVoices.filter((v: any) => v.category === "cloned");
    return NextResponse.json({ voices: clonedVoices });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
