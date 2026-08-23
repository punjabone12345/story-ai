// StoryFlow AI — Netlify Function: cinematic image generation.
// Uses Google Gemini image model (Nano Banana when available). Key from Netlify env (GOOGLE_AI_API_KEY).

const MODEL_CANDIDATES = [
  "gemini-2.5-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-exp-image-generation"
];

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default async (request, context) => {
  try {
    const body = await request.json();
    const image_prompt = body?.image_prompt;
    if (!image_prompt) {
      return Response.json({ error: "image_prompt is required" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GOOGLE_AI_API_KEY is not set in Netlify environment" }, { status: 500 });
    }

    const previous_image_url = body?.previous_image_url;
    const visual_style = body?.visual_style;
    const character_bible = body?.character_bible;

    const parts = [];
    const continuity = [
      "Generate a single, highly detailed cinematic film still.",
      visual_style ? `Overall visual style: ${visual_style}.` : "",
      character_bible ? `Locked character continuity (keep these characters visually identical to previous scenes): ${character_bible}.` : "",
      previous_image_url ? "An attached reference image shows the PREVIOUS scene. Reuse its exact art style, color grading, lighting mood, and character appearances for visual continuity." : "",
      "Professional cinematography, sharp focus, coherent color grading, no text, no watermark, no logos.",
      "",
      `SCENE TO DEPICT: ${image_prompt}`
    ].filter(Boolean).join("\n");
    parts.push({ text: continuity });

    if (previous_image_url) {
      try {
        const imgResp = await fetch(previous_image_url);
        if (imgResp.ok) {
          const imgBuf = await imgResp.arrayBuffer();
          const b64 = bufToBase64(imgBuf);
          const mimeType = imgResp.headers.get("content-type") || "image/png";
          parts.push({ inlineData: { mimeType, data: b64 } });
        }
      } catch (e) {
        // reference image optional
      }
    }

    const payload = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"] }
    };

    let lastErr = "";
    for (const model of MODEL_CANDIDATES) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        lastErr = `${resp.status} ${await resp.text()}`;
        continue;
      }
      const data = await resp.json();
      const candidates = data.candidates || [];
      let imageBase64 = null;
      let mimeType = "image/png";
      for (const cand of candidates) {
        for (const part of (cand.content?.parts || [])) {
          if (part.inlineData?.data) {
            imageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || "image/png";
            break;
          }
        }
        if (imageBase64) break;
      }
      if (imageBase64) {
        return Response.json({ imageBase64, mimeType, model });
      }
      lastErr = "No image data in response";
    }

    return Response.json({ error: `Image generation failed: ${lastErr}` }, { status: 502 });
  } catch (error) {
    return Response.json({ error: error?.message || "Image generation failed" }, { status: 500 });
  }
};