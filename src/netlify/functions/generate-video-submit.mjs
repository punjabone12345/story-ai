// StoryFlow AI — Netlify Function: submit a minimax/h3 image-to-video job to the
// fal.ai async queue. Video generation takes 30-90s, which exceeds a Netlify
// function's runtime, so this function only SUBMITS and returns the request_id.
// The frontend polls generate-video-status for completion (FAL_KEY stays here).
// Model: minimax/h3/image-to-video — supports first_frame + last_frame keyframe
// mode (first-to-last), used to chain scenes: clip i ends at scene i+1's image.
// Resolution 768P as requested.

const MODEL = "minimax/h3/image-to-video";
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

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    const body = await request.json();
    const first_frame_url = body?.first_frame_url;
    if (!first_frame_url) return json({ error: "first_frame_url is required" }, 400);

    const falKey = process.env.FAL_KEY;
    if (!falKey) return json({ error: "FAL_KEY is not set in Netlify environment" }, 500);

    const last_frame_url = body?.last_frame_url || null;
    const prompt = body?.prompt || "Smooth cinematic camera motion, subtle and natural, film still brought to life.";

    // fal queue submit: raw input JSON as the body.
    const input = {
      prompt,
      first_frame_image: first_frame_url,
      resolution: "768P",
      duration: 5
    };
    if (last_frame_url) input.last_frame_image = last_frame_url;

    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch(`https://queue.fal.run/${MODEL}`, {
          method: "POST",
          headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(input)
        });
        const data = await resp.json();
        if (resp.ok && data?.request_id) {
          return json({
            request_id: data.request_id,
            status_url: data.status_url || `https://queue.fal.run/${MODEL}/requests/${data.request_id}/status`,
            queue_position: data.queue_position ?? null
          });
        }
        lastErr = `fal submit ${resp.status}: ${JSON.stringify(data).slice(0, 300)}`;
      } catch (e) {
        lastErr = e.message;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return json({ error: `Video submit failed: ${lastErr}` }, 502);
  } catch (error) {
    return json({ error: error?.message || "Video submit failed" }, 500);
  }
};
