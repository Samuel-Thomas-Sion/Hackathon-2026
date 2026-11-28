// Cloudflare Worker proxy integration. The Gemini API key stays in Worker secrets.
(function () {
  const config = window.CLAUSEGUARD_CONFIG || {};
  const API_BASE = String(config.API_BASE || '').replace(/\/$/, '');

  function apiUrl(path) {
    if (!API_BASE) return path;
    if (API_BASE.includes('YOUR-WORKER')) {
      throw new Error('Set CLAUSEGUARD_CONFIG.API_BASE to your deployed Vercel URL');
    }
    return `${API_BASE}${path}`;
  }

  async function request(path, options) {
    const response = await fetch(apiUrl(path), options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  async function audit(payload) {
    return request('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // The floating "Ask ClauseGuard AI" chat: answers only about the website and
  // project, 10 questions a day per person.
  async function chat(payload) {
    const data = await request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'site', ...payload })
    });
    if (typeof data.questions_left === 'number') {
      data.reply = `${data.reply || ''}\n\n💬 ${data.questions_left} of 10 questions left today`;
    }
    return data;
  }

  async function extract(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds the 10 MB limit');
    const name = file.name.toLowerCase();

    if (name.endsWith('.txt') || name.endsWith('.md')) {
      return { filename: file.name, text: await file.text(), chars: file.size };
    }

    if (name.endsWith('.pdf')) {
      const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
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

  window.ClausesGuardStatic = { audit, chat, extract };
})();
