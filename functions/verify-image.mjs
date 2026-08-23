// StoryFlow AI — Netlify Function: image verification via Gemini vision.
// Key from Netlify env (GOOGLE_AI_API_KEY).

const GEMINI_MODEL = "gemini-3.6-flash";

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

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }
  return null;
}

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const body = await request.json();
    const image_url = body?.image_url;
    const scene_description = body?.scene_description;
    const character_bible = body?.character_bible;
    const continuity_notes = body?.continuity_notes;

    if (!image_url || !scene_description) {
      return json({ error: "image_url and scene_description are required" }, 400);
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return json({ error: "GOOGLE_AI_API_KEY is not set in Netlify environment" }, 500);
    }

    const imgResp = await fetch(image_url);
    if (!imgResp.ok) {
      return json({ error: `Could not fetch image for verification (${imgResp.status})` }, 502);
    }
    const imgBuf = await imgResp.arrayBuffer();
    const b64 = bufToBase64(imgBuf);
    const mimeType = imgResp.headers.get("content-type") || "image/png";

    const prompt = `You are a strict storyboard continuity verifier. You are given ONE generated cinematic image and the scene it is supposed to depict. Decide whether the image is a GOOD match.

EXPECTED SCENE:
${scene_description}

LOCKED CHARACTER BIBLE:
${character_bible || "N/A"}

CONTINUITY NOTES:
${continuity_notes || "N/A"}

Evaluate the image for:
- Does it accurately represent the scene's action, location, time, and emotion?
- Do the characters match the locked character bible (identity, clothing, features)?
- Is the composition / camera angle reasonable?
- Are the major objects and environment consistent with the scene?
- Is there visual continuity with the described style and the previous scene?

Return ONLY a JSON object: { "approved": boolean, "score": number (0-100), "issues": string }
approved must be true ONLY if the image is an acceptable match with no significant problems. issues is a short description of problems, or "None" if approved.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: b64 } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        })
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `Gemini vision error ${resp.status}: ${errText}` }, 502);
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const result = safeJsonParse(text) || {};
    return json({
      approved: !!result.approved,
      score: typeof result.score === "number" ? result.score : (result.approved ? 100 : 0),
      issues: result.issues || (result.approved ? "None" : "Mismatch")
    });
  } catch (error) {
    return json({ error: error?.message || "Verification failed" }, 500);
  }
};
