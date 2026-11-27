// Calls Google Gemini from the server side. The key comes ONLY from the
// GEMINI_API_KEY secret set in the Cloudflare dashboard - never from code,
// never from the browser.
import { ApiError } from './util.js';

const MODEL_DEFAULT = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 45000;

export function aiConfigured(env) {
  return Boolean(env.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim());
}

export async function callGeminiJson(prompt, systemPrompt, env, { maxOutputTokens = 4096 } = {}) {
  if (!aiConfigured(env)) {
    throw new ApiError(503, 'The AI is not set up yet (missing GEMINI_API_KEY secret).');
  }
  const model = String(env.GEMINI_MODEL || MODEL_DEFAULT).trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // Sent as a header (not in the URL) so it never appears in logs.
        'x-goog-api-key': String(env.GEMINI_API_KEY).trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens,
        },
      }),
    });
  } catch (error) {
    throw new ApiError(504, error.name === 'AbortError' ? 'The AI took too long. Please try again.' : 'Could not reach the AI service.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new ApiError(429, 'The free AI is busy right now. Please try again in a little while.');
  }
  if (!response.ok) {
    // Do not pass Google's raw error text to visitors.
    throw new ApiError(502, `The AI service returned an error (HTTP ${response.status}).`);
  }

  const data = await response.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return parseJsonLoose(text);
}

export function parseJsonLoose(text) {
  let value = String(text || '').trim();
  if (value.startsWith('```')) {
    value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(value || '{}');
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ApiError(502, 'The AI reply could not be read. Please try again.');
  }
}
