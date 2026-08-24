// StoryFlow AI — Netlify Function: poll a minimax/h3 image-to-video queue job.
// Returns the current status; when COMPLETED, fetches the result and returns the
// generated video URL (fal media CDN). The frontend downloads + stores it.
// FAL_KEY stays server-side.

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
    const request_id = body?.request_id;
    if (!request_id) return json({ error: "request_id is required" }, 400);

    const falKey = process.env.FAL_KEY;
    if (!falKey) return json({ error: "FAL_KEY is not set in Netlify environment" }, 500);

    const base = `https://queue.fal.run/${MODEL}/requests/${request_id}`;

    const statusResp = await fetch(`${base}/status?logs=1`, {
      headers: { Authorization: `Key ${falKey}` }
    });
    if (!statusResp.ok) {
      return json({ error: `status request failed (${statusResp.status})` }, 502);
    }
    const statusData = await statusResp.json();
    const st = statusData?.status;

    if (st === "COMPLETED") {
      const resResp = await fetch(base, { headers: { Authorization: `Key ${falKey}` } });
      if (!resResp.ok) return json({ error: `result request failed (${resResp.status})` }, 502);
      const res = await resResp.json();
      const video_url =
        res?.video?.url || res?.data?.video?.url || res?.response?.video?.url || res?.output?.video?.url;
      if (!video_url) return json({ error: "completed but no video url returned" }, 502);
      return json({ status: "COMPLETED", video_url, content_type: res?.video?.content_type || "video/mp4" });
    }

    if (st === "FAILED" || st === "ERROR") {
      return json({ status: "FAILED", error: statusData?.error || "Video generation failed" });
    }

    const logs = Array.isArray(statusData?.logs)
      ? statusData.logs.slice(-3).map((l) => l?.message).filter(Boolean)
      : [];
    return json({
      status: st || "IN_PROGRESS",
      queue_position: statusData?.queue_position ?? null,
      logs
    });
  } catch (error) {
    return json({ error: error?.message || "Video status failed" }, 500);
  }
};
