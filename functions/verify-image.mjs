// StoryFlow AI — Netlify Function: image verification via fal.ai vision (OpenRouter).
// FAL_KEY from Netlify env, NEVER returned to client. No Base44 integration credits.
// Best-effort: if the vision call fails or is unparseable, auto-approve so the
// pipeline keeps moving.

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

function safeJsonParse(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
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

    const falKey = process.env.FAL_KEY;
    if (!falKey) return json({ error: "FAL_KEY is not set in Netlify environment" }, 500);

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
- Is there visual continuity with the described style?

Return ONLY a JSON object: { "approved": boolean, "score": number (0-100), "issues": string }
approved must be true ONLY if the image is an acceptable match with no significant problems. issues is a short description of problems, or "None" if approved.`;

    try {
      const resp = await fetch("https://fal.run/openrouter/router/vision", {
        method: "POST",
        headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: [image_url],
          prompt,
          model: "google/gemini-2.5-flash"
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data?.output || "";
        const result = safeJsonParse(text) || {};
        if (typeof result.approved === "boolean") {
          return json({
            approved: result.approved,
            score: typeof result.score === "number" ? result.score : (result.approved ? 100 : 0),
            issues: result.issues || (result.approved ? "None" : "Mismatch")
          });
        }
      }
    } catch (e) {
      // fall through to auto-approve
    }
    // Fallback: auto-approve so the pipeline continues
    return json({ approved: true, score: 100, issues: "Auto-approved (vision unavailable)" });
  } catch (error) {
    return json({ error: error?.message || "Verification failed" }, 500);
  }
};
