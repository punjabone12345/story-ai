// StoryFlow AI — Netlify Function: story analysis, character bible & dynamic scene planning.
// Uses fal.ai OpenRouter LLM (google/gemini-2.5-flash). FAL_KEY from Netlify env,
// NEVER returned to the client. No Base44 integration credits.

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

function buildPrompt(story) {
  return `You are an expert cinematic storyboard director and story analyst. Analyze the following story and produce a complete production breakdown that will be used to generate a cinematic storyboard (one image per scene) and a single Hindi voiceover.

STORY:
---
${story}
---

STEP 1 — STORY ANALYSIS
Determine: title, genre, tone, an overall visual/cinematic style, and the emotional progression of the story. Preserve the user's story meaning and chronology. Do NOT invent major plot events.

STEP 2 — CHARACTER BIBLE
For EVERY recurring character, define LOCKED visual attributes specific enough to keep the character visually consistent across every scene: name, age, gender (if relevant), face structure, skin tone, hairstyle/hair color, body type, clothing, clothing colors, accessories, distinctive features, personality/expression, other visual identifiers, and is_recurring (true for recurring characters). These details must be reused in every relevant scene.

STEP 3 — DYNAMIC SCENE BREAKDOWN
Divide the story into chronological scenes. Do NOT use a fixed number of scenes. Determine the count automatically from the story length, narration timing and visual events:
- Target roughly 5-8 seconds of spoken Hindi narration per scene.
- For a story that would take about 60 seconds to narrate, you MUST produce AT LEAST 8 scenes (target 8-12). Never produce fewer than 8 for a 60-second story.
- For longer stories, increase the number proportionally. For shorter stories, reduce it appropriately but never below 6.
- Create a new scene at every meaningful: action/change, location change, character interaction, emotional beat, visual event, or time/environment change.
- Do NOT split unnaturally just to reach a number, but DO ensure enough scenes to cover the full story visually.
- Every important part of the original story MUST be represented visually.

Each scene must include:
- scene_number (sequential from 1)
- title (short scene title)
- story_text (the original story section in the story's ORIGINAL language — preserve the user's wording)
- narration (Hindi narration for this scene in Devanagari script — natural, emotionally appropriate, covering this scene's events completely; ~5-8 seconds when spoken; this will be spoken aloud)
- characters (array of character names present)
- location, time, action, emotion, lighting, color_palette, camera_angle (composition), visual_style
- image_prompt (detailed ENGLISH prompt embedding the LOCKED character bible visual details for every character present, plus visual style, lighting, color palette, location, and camera angle — enough to produce a consistent cinematic still)
- continuity_notes (how this scene visually connects to the previous and next scene)

CRITICAL RULES:
- The narration across ALL scenes must cover the entire story completely in Hindi, in chronological order, with no repeated sentences and no missing events.
- Keep character visual descriptions identical across scenes unless the story explicitly changes clothing/location.
- narration in Hindi (Devanagari); story_text in original language; image_prompt in English.

Return ONLY a JSON object with this exact shape:
{
  "title": string,
  "genre": string,
  "tone": string,
  "visual_style": string,
  "overall_style": string,
  "emotional_progression": string,
  "characters": [ { "name": string, "age": string, "gender": string, "face_structure": string, "skin_tone": string, "hairstyle": string, "body_type": string, "clothing": string, "clothing_colors": string, "accessories": string, "distinctive_features": string, "personality": string, "visual_identifiers": string, "is_recurring": boolean } ],
  "scenes": [ { "scene_number": number, "title": string, "story_text": string, "narration": string, "characters": [string], "location": string, "time": string, "action": string, "emotion": string, "lighting": string, "color_palette": string, "camera_angle": string, "visual_style": string, "image_prompt": string, "continuity_notes": string } ]
}`;
}

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const body = await request.json();
    const story = body?.story;
    if (!story || typeof story !== "string" || story.trim().length < 10) {
      return json({ error: "A valid story is required" }, 400);
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) return json({ error: "FAL_KEY is not set in Netlify environment" }, 500);

    const prompt = buildPrompt(story);
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch("https://fal.run/openrouter/router/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 8192
          })
        });
        if (!resp.ok) {
          lastErr = `fal llm ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        const data = await resp.json();
        const text = data?.choices?.[0]?.message?.content || "";
        const analysis = safeJsonParse(text);
        if (analysis && Array.isArray(analysis.scenes) && analysis.scenes.length > 0) {
          return json({ analysis });
        }
        lastErr = "Could not parse story analysis";
      } catch (e) {
        lastErr = e.message;
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    return json({ error: `Analysis failed: ${lastErr}` }, 502);
  } catch (error) {
    return json({ error: error?.message || "Analysis failed" }, 500);
  }
};
