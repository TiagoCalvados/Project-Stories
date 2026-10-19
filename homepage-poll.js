(() => {
  const options = [
    ['synth', 'TCKO2 Synth'], ['daao', 'DAAO app'],
    ['audiovisual', 'Audiovisuals'], ['interviews', 'Interviews'],
    ['graphic-novel', 'Tiago K: The Story'],
    ['inner-landscape', 'Inner Landscape'],
    ['tiago-calvados', 'Tiago Calvados'], ['tiago-k', 'Tiago K'],
    ['padel', 'Padel'], ['other', 'Something else'],
  ];
  const root = document.getElementById('visitor-poll');
  if (!root) return;
  const form = root.querySelector('form'), choices = root.querySelector('.visitor-poll-choices');
  const status = root.querySelector('.visitor-poll-status');
  const submit = root.querySelector('.visitor-poll-send');
  const other = root.querySelector('.visitor-poll-other'), comment = form.querySelector('textarea');
  const storageKey = 'project-stories-favourite-v1';
  let busy = false, receipt;
  try { receipt = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch {}
  const setStatus = message => { status.textContent = message; };
  function remember(value) { receipt = value; try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch {} }
  for (const [value, text] of options) {
    const label = document.createElement('label'), input = document.createElement('input'), caption = document.createElement('span');
    input.type = 'radio'; input.name = 'topic'; input.value = value; input.required = true;
    caption.textContent = text; label.append(input, caption); choices.append(label);
  }
  choices.addEventListener('change', () => {
    const selected = form.querySelector('input[name="topic"]:checked')?.value;
    other.hidden = selected !== 'other'; comment.disabled = selected !== 'other'; comment.required = selected === 'other';
    root.dataset.other = String(selected === 'other');
    submit.disabled = busy || Boolean(receipt?.submitted); setStatus('');
  });
  submit.disabled = true;
  function sent() { root.dataset.sent = 'true'; setStatus('Thank you. Your choice has been received.'); }
  if (receipt?.submitted === true) sent();
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || receipt?.submitted) return;
    const selected = form.querySelector('input[name="topic"]:checked')?.value;
    if (!selected) return;
    const note = selected === 'other' ? comment.value.trim() : '';
    if (selected === 'other' && !note) { comment.focus(); setStatus('Please write a few words about what you enjoyed.'); return; }
    busy = true; choices.disabled = true; submit.disabled = true; submit.textContent = 'Sending…'; setStatus('');
    const id = receipt?.choice === selected && typeof receipt?.id === 'string' ? receipt.id : crypto.randomUUID();
    remember({ id, choice: selected, submitted: false });
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice: selected, id, ...(note ? { note } : {}) }), signal: controller.signal, credentials: 'omit' });
      const result = await response.json();
      if (!response.ok || result.accepted !== true) throw new Error(result.message || 'Your choice could not be sent. Please try later.');
      if (result.preview) {
        setStatus('Preview only — this choice was not sent to the live poll.');
      } else { remember({ id, choice: selected, submitted: true }); sent(); }
    } catch (error) {
      setStatus(error.name === 'AbortError' ? 'The connection took too long. Try again; your choice will not be counted twice.' : error.message || 'Could not connect. Please try again.');
    } finally { clearTimeout(timeout); busy = false; choices.disabled = Boolean(receipt?.submitted); submit.disabled = Boolean(receipt?.submitted); submit.textContent = 'Send my choice'; }
  });
  function place() {
    const synth = document.querySelector('.synth-panel'), stories = document.querySelector('.story-buttons');
    if (!synth) return;
    const synthBox = synth.getBoundingClientRect(), storyBox = stories?.getBoundingClientRect();
    const bottom = window.innerHeight - synthBox.top + 10;
    const top = (storyBox?.bottom || 160) + 8;
    const available = Math.max(64, synthBox.top - 10 - top);
    root.style.setProperty('--poll-bottom', `${bottom}px`);
    root.style.setProperty('--poll-space', `${Math.min(340, available)}px`);
  }
  place(); window.addEventListener('resize', place);
  if (window.ResizeObserver) { const observer = new ResizeObserver(place); observer.observe(document.querySelector('.synth-panel')); }
  root.hidden = false;
})();
