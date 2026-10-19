(() => {
  const options = [
    ['synth', 'TCKO2 Synth Modular'], ['daao', 'DAAO · Astronomy app'],
    ['audiovisual', 'Audiovisuals'], ['interviews', 'Interviews'],
    ['graphic-novel', 'Tiago K: The Story · Graphic novel'],
    ['inner-landscape', 'Inner Landscape · Emotional Architecture'],
    ['tiago-calvados', 'Tiago Calvados'], ['tiago-k', 'Tiago K'],
    ['padel', 'Padel'], ['other', 'Something else'],
  ];
  const root = document.getElementById('visitor-poll');
  if (!root) return;
  const form = root.querySelector('form'), choice = root.querySelector('.visitor-poll-choice');
  const position = root.querySelector('.visitor-poll-position'), status = root.querySelector('.visitor-poll-status');
  const submit = root.querySelector('.visitor-poll-send');
  const storageKey = 'project-stories-favourite-v1';
  let index = 0, busy = false, receipt;
  try { receipt = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch {}
  const setStatus = message => { status.textContent = message; };
  function remember(value) { receipt = value; try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {} }
  function showChoice() { choice.textContent = options[index][1]; position.textContent = `${index + 1} / ${options.length} · swipe or use arrows`; }
  function step(amount) { if (busy) return; index = (index + amount + options.length) % options.length; showChoice(); setStatus(''); }
  root.querySelector('[data-poll-previous]').addEventListener('click', () => step(-1));
  root.querySelector('[data-poll-next]').addEventListener('click', () => step(1));
  root.querySelector('.visitor-poll-choices').addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  let touchStart;
  const carousel = root.querySelector('.visitor-poll-choices');
  carousel.addEventListener('pointerdown', event => { touchStart = { x: event.clientX, y: event.clientY }; });
  carousel.addEventListener('pointerup', event => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y; touchStart = undefined;
    if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
  });
  carousel.addEventListener('pointercancel', () => { touchStart = undefined; });
  function sent() { root.dataset.sent = 'true'; setStatus('Thank you. Your choice has been received.'); }
  if (receipt?.submitted === true) sent();
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || receipt?.submitted) return;
    busy = true; submit.disabled = true; submit.textContent = 'Sending…'; setStatus('');
    const selected = options[index][0];
    const id = receipt?.choice === selected && typeof receipt?.id === 'string' ? receipt.id : crypto.randomUUID();
    remember({ id, choice: selected, submitted: false });
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice: selected, id }), signal: controller.signal, credentials: 'omit' });
      const result = await response.json();
      if (!response.ok || result.accepted !== true) throw new Error(result.message || 'Your choice could not be sent. Please try later.');
      if (result.preview) {
        setStatus('Preview only — this choice was not sent to the live poll.');
      } else { remember({ id, choice: selected, submitted: true }); sent(); }
    } catch (error) {
      setStatus(error.name === 'AbortError' ? 'The connection took too long. Try again; your choice will not be counted twice.' : error.message || 'Could not connect. Please try again.');
    } finally { clearTimeout(timeout); busy = false; submit.disabled = false; submit.textContent = 'Send my choice'; }
  });
  function place() {
    const synth = document.querySelector('.synth-panel'), stories = document.querySelector('.story-buttons');
    if (!synth) return;
    const synthBox = synth.getBoundingClientRect(), storyBox = stories?.getBoundingClientRect();
    const bottom = window.innerHeight - synthBox.top + 10;
    const top = (storyBox?.bottom || 160) + 35;
    const available = Math.max(64, synthBox.top - 10 - top);
    root.style.setProperty('--poll-bottom', `${bottom}px`);
    root.style.setProperty('--poll-space', `${Math.min(270, available)}px`);
  }
  showChoice(); place(); window.addEventListener('resize', place);
  if (window.ResizeObserver) { const observer = new ResizeObserver(place); observer.observe(document.querySelector('.synth-panel')); }
  root.hidden = false;
})();
