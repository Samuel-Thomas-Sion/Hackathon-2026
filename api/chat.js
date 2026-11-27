export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(null, 204);
  if (request.method !== 'POST') return corsResponse({ detail: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const message = String(body.message || '').trim();
    if (!message) return corsResponse({ detail: 'Message cannot be empty.' }, 400);

    const documentText = String(body.documentText || body.context_text || body.context || '').trim();
    const auditContext = body.auditSummary || body.audit_context || null;
    const prompt = `Document:\n${documentText.slice(0, 10000)}\n\nActive audit:\n${auditContext ? JSON.stringify(auditContext).slice(0, 5000) : 'None'}\n\nQuestion:\n${message.slice(0, 4000)}`;

    const result = await callGemini(prompt, 'You are LegalAID. Return valid JSON with one field named reply. Be concise and state that this is informational, not formal legal advice.', process.env);
    return corsResponse({ reply: String(result.reply || 'No reply was returned.') });
  } catch (error) {
    return corsResponse({ detail: error.message || 'Chat failed' }, 502);
  }
}

async function callGemini(prompt, systemPrompt, env) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured in Vercel');
  const model = (env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status} ${responseText.slice(0, 300)}`);
  const gemini = JSON.parse(responseText);
  let text = gemini.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  text = text.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

function corsResponse(body, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  return body === null
    ? new Response(null, { status, headers })
    : new Response(JSON.stringify(body), { status, headers });
}
