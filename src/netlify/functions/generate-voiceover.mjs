// StoryFlow AI — Netlify Function: Hindi voiceover via fal.ai ElevenLabs multilingual-v2.
// FAL_KEY from Netlify env, NEVER returned to client. The fal audio URL is
// downloaded server-side; only base64 is returned. No Base44 integration credits.
// Accepts a single narration text (called once per scene from the frontend).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function chunkText(text, max = 1800) {
  if (!text) return [];
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?।]+[.!?।]+?\s*/g) || [text];
  const chunks = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max) {
      if (cur) chunks.push(cur.trim());
      cur = s.length > max ? s.slice(0, max) : s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function concatBytes(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const body = await request.json();
    const text = body?.text;
    if (!text) return json({ error: "text is required" }, 400);

    const falKey = process.env.FAL_KEY;
    if (!falKey) return json({ error: "FAL_KEY is not set in Netlify environment" }, 500);

    const voice = body?.voice_id || "JBFqnCBsd6RMkjVDRZzb";
    const language = body?.language || "hi";
    const chunks = chunkText(text, 1800);
    if (chunks.length === 0) return json({ audioBase64: "", mimeType: "audio/mpeg" });

    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const prev = i > 0 ? chunks[i - 1] : undefined;
      const next = i < chunks.length - 1 ? chunks[i + 1] : undefined;
      let ok = false;
      let lastErr = "";
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          const reqBody = {
            text: c,
            voice,
            stability: 0.35,
            similarity_boost: 0.75,
            style: 0.6,
            speed: 1,
            language_code: language,
            apply_text_normalization: "auto"
          };
          if (prev) reqBody.previous_text = prev;
          if (next) reqBody.next_text = next;
          const resp = await fetch("https://fal.run/fal-ai/elevenlabs/tts/multilingual-v2", {
            method: "POST",
            headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
          });
          if (resp.ok) {
            const data = await resp.json();
            const audioUrl = data?.audio?.url;
            if (audioUrl) {
              const aResp = await fetch(audioUrl);
              if (aResp.ok) { parts.push(new Uint8Array(await aResp.arrayBuffer())); ok = true; }
              else lastErr = `audio download ${aResp.status}`;
            } else lastErr = "no audio url";
          } else {
            lastErr = `fal tts ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
          }
        } catch (e) {
          lastErr = e.message;
        }
        if (!ok) await new Promise((r) => setTimeout(r, 1500));
      }
      if (!ok) throw new Error(lastErr || "fal tts failed");
    }

    const combined = concatBytes(parts);
    const audioBase64 = bufToBase64(combined.buffer);
    return json({ audioBase64, mimeType: "audio/mpeg" });
  } catch (error) {
    return json({ error: error?.message || "Voiceover generation failed" }, 500);
  }
};
