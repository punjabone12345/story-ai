// StoryFlow AI — Netlify Function: cinematic image generation via fal.ai nano-banana-2.
// FAL_KEY is read from Netlify env and NEVER returned to the client.
// The fal image URL is downloaded server-side; only base64 is returned.
// No Base44 integration credits.

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

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const body = await request.json();
    const image_prompt = body?.image_prompt;
    if (!image_prompt) return json({ error: "image_prompt is required" }, 400);

    const falKey = process.env.FAL_KEY;
    if (!falKey) return json({ error: "FAL_KEY is not set in Netlify environment" }, 500);

    const visual_style = body?.visual_style;
    const character_bible = body?.character_bible;
    const aspect_ratio = body?.aspect_ratio || "9:16";

    const fullPrompt = [
      image_prompt,
      visual_style ? `Overall visual style: ${visual_style}.` : "",
      character_bible ? `Locked character continuity (keep these characters visually identical across scenes): ${character_bible}.` : "",
      "Ultra high quality, cinematic film still, highly detailed, sharp focus, dramatic lighting, professional color grading, no text, no watermark, no logos."
    ].filter(Boolean).join("\n");

    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch("https://fal.run/fal-ai/nano-banana-2", {
          method: "POST",
          headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: fullPrompt,
            num_images: 1,
            aspect_ratio,
            output_format: "png",
            resolution: "1K",
            safety_tolerance: "4"
          })
        });
        if (!resp.ok) {
          lastErr = `fal image error ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const data = await resp.json();
        const imgUrl = data?.images?.[0]?.url;
        if (!imgUrl) { lastErr = "fal image returned no image url"; continue; }
        const imgResp = await fetch(imgUrl);
        if (!imgResp.ok) { lastErr = `fal image download error ${imgResp.status}`; continue; }
        const ct = imgResp.headers.get("content-type") || "image/png";
        const imageBase64 = bufToBase64(await imgResp.arrayBuffer());
        return json({ imageBase64, mimeType: ct, source: "fal-nano-banana-2" });
      } catch (e) {
        lastErr = e.message;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return json({ error: `Image generation failed: ${lastErr}` }, 502);
  } catch (error) {
    return json({ error: error?.message || "Image generation failed" }, 500);
  }
};
