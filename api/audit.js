export default async function handler(request) {
  if (request.method === 'OPTIONS') return corsResponse(null, 204);
  if (request.method !== 'POST') return corsResponse({ detail: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const text = String(body.text || '').trim();
    const module = String(body.module || 'general');
    if (!text) return corsResponse({ detail: 'Input text cannot be empty.' }, 400);

    const prompt = `Analyze this ${module} text for unfair or risky terms.

Return valid JSON with exactly these fields:
score, risk_label, title, summary, clauses, counter_reply

Rules:
- score is 0-100 safety/trust; lower is riskier.
- clauses is an array of objects with title, severity, quote, explanation, citation.
- Every quote must appear verbatim in the supplied text.
- This is informational, not formal legal advice.

Text:
${text.slice(0, 50000)}`;

    const result = await callGemini(prompt, 'You are ClauseGuard, a cautious Indian consumer-law contract auditor. Return valid JSON only.', process.env);
    const clauses = Array.isArray(result.clauses)
      ? result.clauses.filter((item) => {
          const quote = String(item.quote || '').toLowerCase();
          return quote.length >= 12 && text.toLowerCase().includes(quote);
        })
      : [];

    return corsResponse({
      score: Math.max(0, Math.min(100, Number(result.score) || 0)),
      risk_label: String(result.risk_label || 'AUDITED'),
      title: String(result.title || 'Audit Complete'),
      summary: String(result.summary || 'The document was reviewed.'),
      clauses,
      counter_reply: String(result.counter_reply || '')
    });
  } catch (error) {
    return corsResponse({ detail: error.message || 'Audit failed' }, 502);
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
