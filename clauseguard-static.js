// Browser-only static-mode integration for GitHub Pages.
// Gemini key is never stored in source: enter it when prompted; it is kept in sessionStorage only.

(function () {
  const configured = window.CLAUSEGUARD_CONFIG || {};
  const MODEL = configured.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  let knowledge = [];

  function getApiKey() {
    const key = configured.GEMINI_API_KEY || sessionStorage.getItem('CLAUSEGUARD_GEMINI_KEY') || '';
    if (key) return key.trim();
    const entered = window.prompt('Enter a Gemini API key for this browser session:');
    if (!entered) throw new Error('A Gemini API key is required');
    sessionStorage.setItem('CLAUSEGUARD_GEMINI_KEY', entered.trim());
    return entered.trim();
  }

  async function loadKnowledge() {
    if (knowledge.length) return knowledge;
    const response = await fetch('./backend/knowledge_contract_law.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the local knowledge base');
    knowledge = await response.json();
    return knowledge;
  }

  function searchKnowledge(query, module, limit = 5) {
    const terms = String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!terms.length) return [];
    return knowledge
      .filter((item) => !module || module === 'general' || module === 'home' || item.module === 'general' || item.module === module)
      .map((item) => {
        const haystack = `${item.title} ${item.content}`.toLowerCase();
        return { item, score: terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.item);
  }

  function cleanJson(text) {
    let value = String(text || '').trim();
    if (value.startsWith('```')) {
      value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    return JSON.parse(value);
  }

  async function callGemini(prompt, systemPrompt) {
    const key = getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      })
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error?.message || ''; } catch (_) {}
      throw new Error(detail || `Gemini returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
    return cleanJson(text);
  }

  async function audit({ text, module = 'general', thinking_level = 'low' }) {
    await loadKnowledge();
    const knowledgeContext = searchKnowledge(text, module, 5).map((item) => `${item.title}: ${item.content}`).join('\n\n');
    const prompt = `Analyze this ${module} text for unfair or risky terms.

Return valid JSON with exactly these fields:
score, risk_label, title, summary, clauses, counter_reply

Rules:
- score is 0-100 safety/trust; lower is riskier.
- clauses is an array of objects with title, severity, quote, explanation, citation.
- Every quote must appear verbatim in the supplied text.
- Use the knowledge context only as general supporting reference.
- This is informational, not formal legal advice.

Knowledge context:
${knowledgeContext}

Text:
${text}`;

    const data = await callGemini(prompt, 'You are ClauseGuard, a cautious Indian consumer-law contract auditor. Return valid JSON only.');
    const source = text.toLowerCase();
    const clauses = Array.isArray(data.clauses)
      ? data.clauses.filter((item) => String(item.quote || '').length >= 12 && source.includes(String(item.quote).toLowerCase()))
      : [];

    return {
      score: Math.max(0, Math.min(100, Number(data.score) || 0)),
      risk_label: String(data.risk_label || 'AUDITED'),
      title: String(data.title || 'Audit Complete'),
      summary: String(data.summary || 'The document was reviewed.'),
      clauses,
      counter_reply: String(data.counter_reply || '')
    };
  }

  async function chat({ message, module = 'home', context_text = '', documentText = '', auditSummary = null }) {
    await loadKnowledge();
    const knowledgeContext = searchKnowledge(message, module, 5).map((item) => `${item.title}: ${item.content}`).join('\n\n');
    const prompt = `Answer as LegalAID, a cautious contract and legal-information assistant.

Document:
${documentText || context_text}

Active audit:
${auditSummary ? JSON.stringify(auditSummary) : 'None'}

Knowledge:
${knowledgeContext || 'No matching local knowledge found'}

Question:
${message}`;

    const data = await callGemini(prompt, 'Return valid JSON with one field named reply. Keep the answer concise and state that it is informational, not formal legal advice.');
    return { reply: String(data.reply || 'No reply was returned.') };
  }

  async function extract(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds the 10 MB limit');
    const name = file.name.toLowerCase();

    if (name.endsWith('.txt') || name.endsWith('.md')) {
      return { filename: file.name, text: await file.text(), chars: file.size };
    }

    if (name.endsWith('.pdf')) {
      if (!window.pdfjsLib) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs', true);
        window.pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(`[Page ${pageNumber}]\n${content.items.map((item) => item.str).join(' ')}`);
      }
      const text = pages.join('\n\n').trim();
      if (!text) throw new Error('No readable text was found in the PDF');
      return { filename: file.name, text: text.slice(0, 50000), chars: text.length };
    }

    throw new Error('Supported formats: TXT, MD, PDF');
  }

  function loadScript(url, module) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      if (module) script.type = 'module';
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  window.ClausesGuardStatic = {
    audit,
    chat,
    extract,
    clearApiKey: () => sessionStorage.removeItem('CLAUSEGUARD_GEMINI_KEY')
  };
})();
