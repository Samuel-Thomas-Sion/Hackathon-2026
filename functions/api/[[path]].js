// Cloudflare Pages Function: every request to /api/* comes here.
// The real logic lives in /server so it can also be tested with `npm test`.
import { handleApi } from '../../server/handlers.js';

export async function onRequest(context) {
  const { request, env } = context;
  // Lets the API read files the website ships, like data/popular-sites.json.
  const assets = (path) => env.ASSETS.fetch(new Request(new URL(path, request.url)));
  return handleApi(request, env, assets);
}
