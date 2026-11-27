// ClauseGuard Teen Check - page logic.
// Safety rule for this file: text from websites or the AI is ALWAYS put on the
// page with textContent (never innerHTML), so it can't inject code.
(function () {
  'use strict';

  const config = window.CLAUSEGUARD_CONFIG || {};
  const API_BASE = String(config.API_BASE || '').replace(/\/$/, '');
  const TURNSTILE_SITE_KEY = String(config.TURNSTILE_SITE_KEY || '').trim();

  const VERDICT_STYLE = {
    green: { label: '🟢 Looks OK for teens', cls: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' },
    amber: { label: '🟡 Use with care', cls: 'bg-amber-500/20 text-amber-200 border border-amber-400/40' },
    red: { label: '🔴 Not great for teens', cls: 'bg-rose-500/20 text-rose-200 border border-rose-400/40' },
  };
  const LEVEL_STYLE = {
    good: { icon: '✅', cls: 'border-emerald-400/30' },
    caution: { icon: '⚠️', cls: 'border-amber-400/30' },
    warning: { icon: '🚩', cls: 'border-rose-400/40' },
  };
  const CHAT_CHIPS = [
    'Can strangers message me?',
    'Can they use my photos or videos?',
    'Do they sell or share my data?',
    'How do I delete my account?',
    'Is it OK for my age?',
    'Kya ye app mera data bechti hai?',
  ];

  const $ = (id) => document.getElementById(id);
  const state = { documentText: '', busy: false };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setStatus(message, isError) {
    const s = $('status');
    s.textContent = '';
    if (message === 'loading') {
      s.appendChild(el('span', 'spinner'));
      s.appendChild(document.createTextNode('  Reading the terms and asking the AI… this can take up to 30 seconds.'));
    } else {
      s.textContent = message || '';
    }
    s.className = `min-h-[1.5rem] text-sm ${isError ? 'text-rose-300' : 'text-slate-300'}`;
  }

  // ------------------------------------------------ optional human check
  let turnstileWidget = null;
  let turnstileResolve = null;

  function loadTurnstile() {
    if (!TURNSTILE_SITE_KEY) return;
    window.onTurnstileLoad = function () {
      turnstileWidget = window.turnstile.render('#turnstile-box', {
        sitekey: TURNSTILE_SITE_KEY,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token) => {
          if (turnstileResolve) turnstileResolve(token);
          turnstileResolve = null;
        },
        'error-callback': () => {
          if (turnstileResolve) turnstileResolve('');
          turnstileResolve = null;
        },
      });
    };
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    script.async = true;
    document.head.appendChild(script);
  }

  function getTurnstileToken() {
    if (!TURNSTILE_SITE_KEY) return Promise.resolve('');
    if (!window.turnstile || turnstileWidget === null) return Promise.resolve('');
    return new Promise((resolve) => {
      turnstileResolve = resolve;
      window.turnstile.reset(turnstileWidget);
      window.turnstile.execute(turnstileWidget);
      setTimeout(() => {
        if (turnstileResolve === resolve) {
          turnstileResolve = null;
          resolve('');
        }
      }, 30000);
    });
  }

  // ------------------------------------------------ API
  async function post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function runCheck(payload) {
    if (state.busy) return;
    state.lastPayload = payload;
    state.busy = true;
    $('check-btn').disabled = true;
    $('paste-btn').disabled = true;
    setStatus('loading');
    try {
      const token = await getTurnstileToken();
      const { ok, status, data } = await post('/api/teen-check', { ...payload, lang: $('lang-select').value, turnstileToken: token });
      if (status === 422 && data.needs_paste) {
        setStatus(data.detail, true);
        $('paste-box').open = true;
        $('paste-input').focus();
        return;
      }
      if (!ok) {
        setStatus(data.detail || `Something went wrong (HTTP ${status}). Please try again.`, true);
        return;
      }
      setStatus(data.from_cache ? 'Showing a result checked recently.' : '');
      renderResult(data);
    } catch (error) {
      setStatus('Could not reach ClauseGuard. Check your internet connection and try again.', true);
    } finally {
      state.busy = false;
      $('check-btn').disabled = false;
      $('paste-btn').disabled = false;
    }
  }

  // ------------------------------------------------ rendering
  function safeLink(url, label) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return el('span', '', label);
      const a = el('a', 'text-emerald-300 hover:underline break-all', label);
      a.href = u.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    } catch {
      return el('span', '', label);
    }
  }

  function renderResult(data) {
    const r = data.result || {};
    const verdict = VERDICT_STYLE[r.verdict] || VERDICT_STYLE.amber;

    const badge = $('verdict-badge');
    badge.textContent = verdict.label;
    badge.className = `px-3 py-1 rounded-full text-sm font-extrabold ${verdict.cls}`;
    $('site-title').textContent = data.source?.name || data.site || 'Pasted terms';
    $('verdict-reason').textContent = r.verdict_reason || '';
    $('summary').textContent = r.summary || '';

    $('age-value').textContent = r.min_age ? `${r.min_age}+` : 'Not stated in the terms';
    const ageQuote = $('age-quote');
    ageQuote.textContent = r.min_age_quote ? `“${r.min_age_quote}”` : '';
    ageQuote.classList.toggle('hidden', !r.min_age_quote);
    $('india-note').textContent = data.india_note || '';

    const points = $('points');
    points.textContent = '';
    (r.points || []).forEach((p) => {
      const style = LEVEL_STYLE[p.level] || LEVEL_STYLE.caution;
      const card = el('article', `glass rounded-2xl p-4 space-y-2 border ${style.cls}`);
      const head = el('h4', 'font-bold', `${style.icon} ${p.title}`);
      const body = el('p', 'text-slate-200 text-sm', p.explanation);
      const quote = el('blockquote', 'quote pl-3 text-sm text-slate-400 italic', `“${p.quote}”`);
      card.append(head, body, quote);
      points.appendChild(card);
    });
    $('no-points').classList.toggle('hidden', (r.points || []).length > 0);

    const tips = $('tips');
    tips.textContent = '';
    (r.tips || []).forEach((t) => tips.appendChild(el('li', '', t)));

    const src = data.source || {};
    const line = $('source-line');
    if (src.type === 'pasted') line.textContent = 'Checked from the text you pasted.';
    else if (src.type === 'saved') line.textContent = `This site blocks automatic reading, so a saved copy was used${src.saved_at ? ` (saved ${new Date(src.saved_at).toLocaleDateString()})` : ''}. It may be out of date.`;
    else if (src.type === 'mixed') line.textContent = 'Read live from the site, with a saved copy filling in a page the site blocked:';
    else line.textContent = 'Read live from the site just now:';
    const links = $('source-links');
    links.textContent = '';
    (src.pages || []).forEach((p) => {
      const li = el('li');
      li.appendChild(document.createTextNode(`${p.kind === 'privacy' ? 'Privacy Policy' : 'Terms'}${p.saved ? ' (saved copy)' : ''}: `));
      li.appendChild(safeLink(p.url, p.url));
      links.appendChild(li);
    });

    state.documentText = data.document_text || '';
    $('chat-messages').textContent = '';
    $('result').classList.remove('hidden');
    $('chat').classList.toggle('hidden', !state.documentText);
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ------------------------------------------------ chat
  function addBubble(who, text, quotes) {
    const wrap = el('div', who === 'you' ? 'flex justify-end' : 'flex justify-start');
    const bubble = el(
      'div',
      who === 'you'
        ? 'max-w-[85%] rounded-2xl rounded-tr-sm bg-emerald-400 text-slate-950 font-medium px-4 py-2.5 whitespace-pre-line'
        : 'max-w-[90%] rounded-2xl rounded-tl-sm bg-white/10 border border-white/10 px-4 py-3 space-y-2'
    );
    const p = el('p', 'whitespace-pre-line', text);
    bubble.appendChild(p);
    (quotes || []).forEach((q) => bubble.appendChild(el('blockquote', 'quote pl-3 text-sm text-slate-400 italic', `“${q}”`)));
    wrap.appendChild(bubble);
    $('chat-messages').appendChild(wrap);
    $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
    return p;
  }

  async function ask(question) {
    const message = String(question || '').trim();
    if (!message || state.busy || !state.documentText) return;
    state.busy = true;
    $('chat-btn').disabled = true;
    $('chat-input').value = '';
    addBubble('you', message);
    const pending = addBubble('bot', 'Thinking…');
    try {
      const token = await getTurnstileToken();
      const { ok, status, data } = await post('/api/chat', {
        mode: 'teen',
        message,
        lang: 'auto',
        documentText: state.documentText,
        turnstileToken: token,
      });
      pending.parentElement.parentElement.remove();
      if (!ok) addBubble('bot', data.detail || `Sorry, something went wrong (HTTP ${status}).`);
      else addBubble('bot', data.reply, data.quotes);
    } catch {
      pending.textContent = 'Could not reach ClauseGuard. Please try again.';
    } finally {
      state.busy = false;
      $('chat-btn').disabled = false;
    }
  }

  // ------------------------------------------------ start
  async function loadPopular() {
    try {
      const res = await fetch('./data/popular-sites.json', { cache: 'no-cache' });
      const sites = await res.json();
      const box = $('popular-chips');
      Object.entries(sites).forEach(([domain, info]) => {
        const chip = el('button', 'chip px-3 py-1.5 rounded-full text-sm bg-white/5 hover:bg-white/10 border border-white/15', info.name || domain);
        chip.type = 'button';
        chip.addEventListener('click', () => {
          $('site-input').value = domain;
          runCheck({ site: domain });
        });
        box.appendChild(chip);
      });
    } catch {
      /* chips are optional */
    }
  }

  function start() {
    loadTurnstile();
    loadPopular();

    CHAT_CHIPS.forEach((q) => {
      const chip = el('button', 'chip px-3 py-1.5 rounded-full text-sm bg-white/5 hover:bg-white/10 border border-white/15', q);
      chip.type = 'button';
      chip.addEventListener('click', () => ask(q));
      $('chat-chips').appendChild(chip);
    });

    // Switching language after a result is shown re-checks in the new language.
    $('lang-select').addEventListener('change', () => {
      if (state.lastPayload && !$('result').classList.contains('hidden')) runCheck(state.lastPayload);
    });

    $('check-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const site = $('site-input').value.trim();
      if (!site) {
        setStatus('Type a website name or link first.', true);
        return;
      }
      runCheck({ site });
    });
    $('paste-btn').addEventListener('click', () => {
      const text = $('paste-input').value.trim();
      if (text.length < 300) {
        setStatus('Please paste more of the terms (at least a few paragraphs).', true);
        return;
      }
      runCheck({ text });
    });
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      ask($('chat-input').value);
    });

    // Shareable links: teen.html?site=instagram.com
    const fromUrl = new URLSearchParams(location.search).get('site');
    if (fromUrl) {
      $('site-input').value = fromUrl.slice(0, 300);
      runCheck({ site: fromUrl.slice(0, 300) });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
