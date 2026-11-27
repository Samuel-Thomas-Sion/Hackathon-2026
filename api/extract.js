export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(null, 204);
  if (request.method !== 'POST') return corsResponse({ detail: 'Method not allowed' }, 405);
  return corsResponse({ detail: 'TXT and PDF extraction are handled locally by the static client.' }, 501);
}

function corsResponse(body, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  return body === null
    ? new Response(null, { status, headers })
    : new Response(JSON.stringify(body), { status, headers });
}
