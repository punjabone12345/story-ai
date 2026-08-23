// StoryFlow AI — Netlify Function: complete Hindi voiceover via ElevenLabs.
// Key from Netlify env (ELEVENLABS_API_KEY). Fixed voice ID 3AMU7jXQuQa3oRvRqUmb, model eleven_multilingual_v2.

const VOICE_ID = "3AMU7jXQuQa3oRvRqUmb";
const MODEL_ID = "eleven_multilingual_v2";
const LANGUAGE = "hi";

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function chunkText(text, max = 1900) {
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

async function synthChunk(apiKey, text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      language_code: LANGUAGE,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true }
    })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ElevenLabs error ${resp.status}: ${errText}`);
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

function concatBytes(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export default async (request, context) => {
  try {
    const body = await request.json();
    const narrations = Array.isArray(body?.narrations)
      ? body.narrations
      : body?.narration
      ? [body.narration]
      : [];

    if (narrations.length === 0) {
      return Response.json({ error: "narrations are required" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ELEVENLABS_API_KEY is not set in Netlify environment" }, { status: 500 });
    }

    const chunks = [];
    for (const narration of narrations) {
      const subChunks = chunkText(narration || "");
      if (subChunks.length === 0) {
        chunks.push({ base64: "", mimeType: "audio/mpeg", empty: true });
        continue;
      }
      const parts = [];
      for (const sub of subChunks) {
        const bytes = await synthChunk(apiKey, sub);
        parts.push(bytes);
      }
      const combined = concatBytes(parts);
      const b64 = bufToBase64(combined.buffer);
      chunks.push({ base64: b64, mimeType: "audio/mpeg", empty: false });
    }

    return Response.json({
      chunks,
      voice_id: VOICE_ID,
      model: MODEL_ID,
      language: LANGUAGE
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Voiceover generation failed" }, { status: 500 });
  }
};