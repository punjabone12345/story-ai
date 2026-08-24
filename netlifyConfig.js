// Base URL of your deployed Netlify Functions (the secure API gateway).
// Either:
//   1. Replace the placeholder below with your Netlify site URL, e.g.
//      "https://your-site.netlify.app/.netlify/functions"
//   2. Or set VITE_NETLIFY_FUNCTIONS_URL in your build environment.
// API keys (GOOGLE_AI_API_KEY, ELEVENLABS_API_KEY) live ONLY in Netlify
// environment variables — never in this frontend.
export const NETLIFY_BASE =
  (import.meta.env && import.meta.env.VITE_NETLIFY_FUNCTIONS_URL) ||
  "https://storyaibysiddharth.netlify.app/.netlify/functions";
