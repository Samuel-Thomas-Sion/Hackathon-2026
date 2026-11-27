// ClauseGuard API Worker for Cloudflare.
// Secrets (GEMINI_API_KEY) are read from Worker secrets / env bindings only.
// The static frontend is deployed separately to Cloudflare Pages and reaches
// this Worker through CLAUSEGUARD_CONFIG.API_BASE (see clauseguard-config.js).

const MODEL_DEFAULT = 'gemini-3.5-flash-lite';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return corsResponse(null, env, 204);
    }

    if (path === '/api/health' && request.method === 'GET') {
      return corsResponse({ status: 'ok', service: 'clauseguard-api' }, env);
    }

    if (path === '/api/audit' && request.method === 'POST') {
      return handleAudit(request, env);
    }

    if (path === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // Python-only features that Workers cannot run. Return an explicit 501 so
    // no deployed route fails silently. The frontend performs TXT/PDF
    // extraction client-side (clauseguard-api.js) and does not call these.
    if (path === '/api/extract') {
      return corsResponse(
        {
          detail:
            'Server-side extraction (PDF/OCR) is not available on Cloudflare Workers. ' +
            'TXT/MD/PDF extraction runs locally in the browser via clauseguard-api.js.',
        },
        env,
        501
      );
    }

    if (path.startsWith('/api/knowledge')) {
      return corsResponse(
        {
          detail:
            'The SQLite FTS5 knowledge base is not available on Cloudflare Workers. ' +
            'Use a Cloudflare D1 database or Vectorize binding for server-side retrieval, ' +
            'or rely on the static knowledge base bundled with the frontend.',
        },
        env,
        501
      );
    }

    return corsResponse({ detail: 'Not found' }, env, 404);
  },
};

async function handleAudit(request, env) {
  try {
    const body = await request.json();
    const text = String(body.text || '').trim();
    if (!text) return corsResponse({ detail: 'Input text cannot be empty.' }, env, 400);

    const module = String(body.module || 'general');
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

    const result = await callGemini(
      prompt,
      'You are ClauseGuard, a cautious Indian consumer-law contract auditor. Return valid JSON only.',
      env
    );
    const clauses = Array.isArray(result.clauses)
      ? result.clauses.filter((item) => {
          const quote = String(item.quote || '').toLowerCase();
          return quote.length >= 12 && text.toLowerCase().includes(quote);
        })
      : [];

    return corsResponse(
      {
        score: Math.max(0, Math.min(100, Number(result.score) || 0)),
        risk_label: String(result.risk_label || 'AUDITED'),
        title: String(result.title || 'Audit Complete'),
        summary: String(result.summary || 'The document was reviewed.'),
        clauses,
        counter_reply: String(result.counter_reply || ''),
      },
      env
    );
  } catch (error) {
    return corsResponse({ detail: error.message || 'Audit failed' }, env, 502);
  }
}

async function handleChat(request, env) {
  try {
    const body = await request.json();
    const message = String(body.message || '').trim();
    if (!message) return corsResponse({ detail: 'Message cannot be empty.' }, env, 400);

    const documentText = String(body.documentText || body.context_text || body.context || '').trim();
    const auditContext = body.auditSummary || body.audit_context || null;
    const prompt = `Document:\n${documentText.slice(0, 10000)}\n\nActive audit:\n${
      auditContext ? JSON.stringify(auditContext).slice(0, 5000) : 'None'
    }\n\nQuestion:\n${message.slice(0, 4000)}`;

    const result = await callGemini(
      prompt,
      'You are LegalAID. Return valid JSON with one field named reply. Be concise and state that this is informational, not formal legal advice.',
      env
    );
    return corsResponse({ reply: String(result.reply || 'No reply was returned.') }, env);
  } catch (error) {
    return corsResponse({ detail: error.message || 'Chat failed' }, env, 502);
  }
}

async function callGemini(prompt, systemPrompt, env) {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the Worker');
  }
  const model = (env.GEMINI_MODEL || MODEL_DEFAULT).trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${responseText.slice(0, 300)}`);
  }

  const gemini = JSON.parse(responseText);
  let text =
    gemini.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(text);
}

function corsResponse(body, env, status = 200) {
  const allowed = (env.ALLOWED_ORIGIN || '*').trim();
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  if (body === null) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), { status, headers });
}
