// Password-protected presentation viewer.
// The slides are stored ENCRYPTED in data/locked-deck.json (made by
// `npm run lock-deck`). The password you type is used, only inside your browser,
// to unlock them. Wrong password = the unlock fails, nothing is shown.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { slides: [], index: 0, notes: false };

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function unlock(password) {
    const res = await fetch('./data/locked-deck.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('missing');
    const box = await res.json();
    const { subtle } = window.crypto;
    const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', salt: fromB64(box.salt), iterations: box.iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function show(i) {
    const n = state.slides.length;
    state.index = Math.max(0, Math.min(n - 1, i));
    const s = state.slides[state.index];
    $('slide').src = s.img;
    $('slide').alt = `Slide ${state.index + 1} of ${n}`;
    $('count').textContent = `${state.index + 1} / ${n}`;
    $('progress').style.width = `${((state.index + 1) / n) * 100}%`;
    $('prev').disabled = state.index === 0;
    $('next').disabled = state.index === n - 1;
    const notes = $('notes');
    notes.textContent = '';
    const label = document.createElement('b');
    label.textContent = `Speaker notes · slide ${state.index + 1}`;
    notes.append(label, document.createTextNode(s.notes || 'No notes for this slide.'));
    try {
      sessionStorage.setItem('cg-slide', String(state.index));
    } catch {
      /* not important */
    }
  }

  function toggleNotes(force) {
    state.notes = typeof force === 'boolean' ? force : !state.notes;
    $('notes').classList.toggle('hidden', !state.notes);
    $('notes-btn').setAttribute('aria-pressed', String(state.notes));
  }

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  function relock() {
    state.slides = [];
    $('slide').removeAttribute('src');
    $('viewer').classList.add('hidden');
    $('lock').classList.remove('hidden');
    $('password').value = '';
    $('password').focus();
  }

  function start() {
    $('lock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('open-btn');
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      $('lock-msg').textContent = '';
      try {
        const deck = await unlock($('password').value);
        state.slides = deck.slides || [];
        $('deck-title').textContent = deck.title || 'Presentation';
        document.title = `${deck.title || 'Presentation'} — ClauseGuard`;
        $('lock').classList.add('hidden');
        $('viewer').classList.remove('hidden');
        let startAt = 0;
        try {
          startAt = Number(sessionStorage.getItem('cg-slide') || 0);
        } catch {
          /* ignore */
        }
        show(startAt);
      } catch (err) {
        $('lock-msg').textContent =
          err.message === 'missing' ? 'The presentation hasn’t been uploaded yet.' : 'That password isn’t right. Try again.';
        $('password').select();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Open presentation';
      }
    });

    $('prev').addEventListener('click', () => show(state.index - 1));
    $('next').addEventListener('click', () => show(state.index + 1));
    $('notes-btn').addEventListener('click', () => toggleNotes());
    $('full-btn').addEventListener('click', toggleFull);
    $('relock-btn').addEventListener('click', relock);
    $('slide').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      show(state.index + (e.clientX - r.left < r.width / 3 ? -1 : 1));
    });

    document.addEventListener('keydown', (e) => {
      if ($('viewer').classList.contains('hidden')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(state.index + 1); }
      else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(state.index - 1); }
      else if (e.key === 'Home') show(0);
      else if (e.key === 'End') show(state.slides.length - 1);
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else if (e.key === 'n' || e.key === 'N') toggleNotes();
    });

    let touchX = null;
    $('stage').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    $('stage').addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 40) show(state.index + (dx < 0 ? 1 : -1));
      touchX = null;
    });

    $('password').focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
