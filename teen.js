// ClauseGuard Teen Check - page logic.
// Safety rule for this file: text from websites or the AI is ALWAYS put on the
// page with textContent (never innerHTML), so it can't inject code.
(function () {
  'use strict';

  const config = window.CLAUSEGUARD_CONFIG || {};
  const API_BASE = String(config.API_BASE || '').replace(/\/$/, '');
  const TURNSTILE_SITE_KEY = String(config.TURNSTILE_SITE_KEY || '').trim();

  const VERDICT_STYLE = {
    green: { emoji: '😎', label: 'Looks chill', sub: 'pretty safe for teens', cls: 'from-emerald-500/25 to-teal-500/5 border-emerald-400/40' },
    amber: { emoji: '🤔', label: 'Kinda sus', sub: 'OK, but read the heads-ups', cls: 'from-amber-500/25 to-orange-500/5 border-amber-400/40' },
    red: { emoji: '🚩', label: 'Big red flags', sub: 'think twice before signing up', cls: 'from-rose-500/25 to-pink-500/5 border-rose-400/40' },
  };
  const LEVEL_STYLE = {
    good: { chip: '✅ All good', chipCls: 'bg-emerald-500/20 text-emerald-200', cls: 'border-emerald-400/30' },
    caution: { chip: '👀 Heads up', chipCls: 'bg-amber-500/20 text-amber-200', cls: 'border-amber-400/30' },
    warning: { chip: '🚩 Red flag', chipCls: 'bg-rose-500/20 text-rose-200', cls: 'border-rose-400/40' },
  };
  const TOPIC_EMOJI = {
    age: '🎂', data_collected: '🕵️', data_shared: '🤝', photos_content: '📸', location: '📍', contact: '💬',
    ads_tracking: '🎯', money: '💸', delete_account: '🗑️', disputes: '⚖️', changes: '🔄',
  };
  // [what the button shows, what is asked]
  const CHAT_CHIPS = [
    ['💬 Can strangers DM me?', 'Can strangers message me?'],
    ['📸 Can they use my pics?', 'Can they use my photos or videos?'],
    ['🤝 Do they sell my data?', 'Do they sell or share my data?'],
    ['🗑️ How do I delete my account?', 'How do I delete my account?'],
    ['🎂 Is it OK for my age?', 'Is it OK for my age?'],
    ['🇮🇳 Kya ye app mera data bechti hai?', 'Kya ye app mera data bechti hai?'],
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
      s.appendChild(document.createTextNode('  Reading the fine print so you don’t have to… 📖 (can take up to 30 sec)'));
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

  function renderVerdict(data) {
    const r = data.result || {};
    const v = VERDICT_STYLE[r.verdict] || VERDICT_STYLE.amber;
    const card = $('verdict-card');
    card.textContent = '';
    card.className = `rounded-3xl p-5 sm:p-7 space-y-4 border bg-gradient-to-br ${v.cls}`;

    const top = el('div', 'flex items-start gap-4');
    top.appendChild(el('div', 'text-5xl sm:text-6xl leading-none select-none', v.emoji));
    const names = el('div', 'flex-1 min-w-0');
    names.appendChild(el('p', 'text-2xl sm:text-3xl font-extrabold text-white leading-tight', v.label));
    names.appendChild(el('p', 'text-slate-300', `${data.source?.name || data.site || 'Pasted terms'} · ${v.sub}`));
    top.appendChild(names);
    if (data.site) {
      const share = el('button', 'shrink-0 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 text-sm font-bold', '📤 Share');
      share.type = 'button';
      share.addEventListener('click', () => shareCheck(data.site, v.label, r.tldr, share));
      top.appendChild(share);
    }
    card.appendChild(top);

    if (r.tldr) {
      const tldr = el('p', 'text-xl sm:text-2xl font-bold text-white');
      tldr.appendChild(el('span', 'text-xs font-mono uppercase tracking-widest text-slate-400 mr-2 align-middle', 'TL;DR'));
      tldr.appendChild(document.createTextNode(r.tldr));
      card.appendChild(tldr);
    }

    // vibe meter: red (sus) -> green (chill)
    const score = Math.max(0, Math.min(100, Number(r.vibe_score) || 50));
    const meter = el('div', 'space-y-1');
    const labels = el('div', 'flex justify-between text-xs font-bold text-slate-300');
    labels.append(el('span', '', '🚩 Sus'), el('span', '', `Vibe meter · ${score}/100`), el('span', '', 'Chill 😎'));
    const track = el('div', 'relative h-3 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400');
    const dot = el('div', 'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-4 border-slate-900 shadow-lg');
    dot.style.left = `${score}%`;
    track.appendChild(dot);
    meter.append(labels, track);
    card.appendChild(meter);

    if (r.verdict_reason) card.appendChild(el('p', 'text-lg text-slate-100', r.verdict_reason));
    if (r.summary) card.appendChild(el('p', 'text-slate-300', r.summary));
  }

  async function shareCheck(site, label, tldr, button) {
    const url = `${location.origin}/teencheck?site=${encodeURIComponent(site)}`;
    const text = `${label}${tldr ? ` – ${tldr}` : ''} (ClauseGuard Teen Check)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ClauseGuard Teen Check', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      button.textContent = '✅ Link copied';
    } catch {
      /* the visitor closed the share sheet */
    }
  }

  function renderPoint(p) {
    const style = LEVEL_STYLE[p.level] || LEVEL_STYLE.caution;
    const card = el('article', `glass rounded-3xl p-4 space-y-2 border ${style.cls}`);
    const head = el('div', 'flex items-start gap-3');
    head.appendChild(el('div', 'shrink-0 w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-2xl select-none', TOPIC_EMOJI[p.topic] || '📄'));
    const titles = el('div', 'flex-1 min-w-0');
    titles.appendChild(el('h4', 'font-extrabold text-white text-lg leading-snug', p.title));
    titles.appendChild(el('span', `inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${style.chipCls}`, style.chip));
    head.appendChild(titles);
    card.appendChild(head);
    card.appendChild(el('p', 'text-slate-200', p.explanation));
    const receipts = el('details', 'text-sm');
    receipts.appendChild(el('summary', 'cursor-pointer text-emerald-300 font-bold select-none', '🧾 Receipts'));
    receipts.appendChild(el('blockquote', 'quote pl-3 mt-2 text-slate-400 italic', `“${p.quote}”`));
    card.appendChild(receipts);
    return card;
  }

  function renderResult(data) {
    const r = data.result || {};
    renderVerdict(data);

    $('age-value').textContent = r.min_age ? `${r.min_age}+` : 'Not mentioned 🤷';
    const ageQuote = $('age-quote');
    ageQuote.textContent = r.min_age_quote ? `🧾 “${r.min_age_quote}”` : '';
    ageQuote.classList.toggle('hidden', !r.min_age_quote);
    $('india-note').textContent = data.india_note || '';

    const points = $('points');
    points.textContent = '';
    (r.points || []).forEach((p) => points.appendChild(renderPoint(p)));
    $('no-points').classList.toggle('hidden', (r.points || []).length > 0);

    const tips = $('tips');
    tips.textContent = '';
    tips.className = 'space-y-2';
    (r.tips || []).forEach((t) => {
      const li = el('li');
      const label = el('label', 'flex items-start gap-3 cursor-pointer');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'mt-1.5 w-4 h-4 accent-emerald-400 shrink-0';
      const text = el('span', 'text-slate-200', t);
      box.addEventListener('change', () => text.classList.toggle('line-through', box.checked));
      label.append(box, text);
      li.appendChild(label);
      tips.appendChild(li);
    });

    const src = data.source || {};
    const line = $('source-line');
    if (src.type === 'pasted') line.textContent = '📚 Checked from the text you pasted.';
    else if (src.type === 'saved') line.textContent = `📚 This site blocks automatic reading, so we used a saved copy${src.saved_at ? ` (saved ${new Date(src.saved_at).toLocaleDateString()})` : ''}. It might be a bit old.`;
    else if (src.type === 'mixed') line.textContent = '📚 Read live from the site, plus a saved copy for a page the site blocked:';
    else line.textContent = '📚 Read live from the site just now:';
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
    const placeholder = document.getElementById('result-placeholder');
    if (placeholder) placeholder.classList.add('hidden');
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
        ? 'max-w-[85%] rounded-3xl rounded-br-md bg-emerald-400 text-slate-950 font-semibold px-4 py-2.5 whitespace-pre-line shadow-lg'
        : 'max-w-[90%] rounded-3xl rounded-bl-md bg-white/10 border border-white/10 px-4 py-3 space-y-2'
    );
    const p = el('p', 'whitespace-pre-line', text);
    bubble.appendChild(p);
    (quotes || []).forEach((q) => bubble.appendChild(el('blockquote', 'quote pl-3 text-sm text-slate-400 italic', `🧾 “${q}”`)));
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
    const pending = addBubble('bot', 'typing… ✍️');
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

    CHAT_CHIPS.forEach(([label, question]) => {
      const chip = el('button', 'chip px-3 py-1.5 rounded-full text-sm bg-white/5 hover:bg-white/10 border border-white/15', label);
      chip.type = 'button';
      chip.addEventListener('click', () => ask(question));
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
