import { createHash } from 'node:crypto';

export const TOPICS = Object.freeze({
  synth: 'TCKO2 Synth Modular', daao: 'DAAO · Astronomy app', audiovisual: 'Audiovisuals', interviews: 'Interviews',
  'graphic-novel': 'Tiago K: The Story · Graphic novel', 'inner-landscape': 'Inner Landscape · Emotional Architecture',
  'tiago-calvados': 'Tiago Calvados', 'tiago-k': 'Tiago K', padel: 'Padel', other: 'Something else',
});
export function emptyPoll() { return { version: 1, counts: Object.fromEntries(Object.keys(TOPICS).map(key => [key, 0])), month: '', day: '', monthlyVotes: 0, dailyVotes: 0, receipts: [] }; }
export function validPoll(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.receipts) || value.receipts.length > 500) throw new Error('Invalid poll data.');
  for (const key of Object.keys(TOPICS)) if (!Number.isSafeInteger(value.counts?.[key]) || value.counts[key] < 0) throw new Error('Invalid poll counts.');
  for (const key of ['monthlyVotes', 'dailyVotes']) if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Invalid poll budget.');
  if (typeof value.month !== 'string' || typeof value.day !== 'string') throw new Error('Invalid poll period.');
  if (value.notes !== undefined && (!Array.isArray(value.notes) || value.notes.length > 100 || value.notes.some(note => typeof note?.text !== 'string' || note.text.length > 120 || typeof note.month !== 'string'))) throw new Error('Invalid poll comments.');
  return value;
}
export async function recordVote(store, choice, id, { now = new Date(), monthlyLimit = 150, dailyLimit = 30, note = '' } = {}) {
  const month = now.toISOString().slice(0, 7), day = now.toISOString().slice(0, 10);
  const receipt = createHash('sha256').update(id).digest('hex');
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = await store.read();
    const data = snapshot ? structuredClone(validPoll(snapshot.data)) : emptyPoll();
    if (data.month !== month) { data.month = month; data.monthlyVotes = 0; data.receipts = []; }
    if (data.day !== day) { data.day = day; data.dailyVotes = 0; }
    const previous = data.receipts.find(item => item[0] === receipt);
    if (previous) return previous[1] === choice ? { status: 200, accepted: true } : { status: 409, message: 'Please retry your original choice.' };
    if (data.monthlyVotes >= monthlyLimit || data.dailyVotes >= dailyLimit) return { status: 429, message: 'Voting is paused to protect the website’s storage allowance. Please try later.' };
    data.counts[choice]++; data.monthlyVotes++; data.dailyVotes++; data.receipts.push([receipt, choice]);
    if (choice === 'other' && note) data.notes = [...(data.notes || []), { month, text: note }].slice(-100);
    try { await store.write(data, snapshot?.etag); return { status: 200, accepted: true }; }
    catch (error) { if (!store.isConflict(error)) throw error; }
  }
  return { status: 409, message: 'Someone else voted at the same moment. Please try sending again.' };
}
export function createPollHandler(store, { origins = ['https://project-stories-eta.vercel.app'], preview = false } = {}) {
  return async function poll(request, response) {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { response.statusCode = status; response.end(JSON.stringify(data)); };
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return send(405, { message: 'Use the poll’s Send my choice button.' }); }
    if (!origins.includes(request.headers.origin)) return send(403, { message: 'Please send your choice from Project Stories.' });
    if (!/^application\/json\b/i.test(request.headers['content-type'] || '')) return send(415, { message: 'Please use the poll on the homepage.' });
    if (Number(request.headers['content-length'] || 0) > 1024) return send(413, { message: 'The response is too large.' });
    let body;
    try {
      if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) body = request.body;
      else if (typeof request.body === 'string') { if (Buffer.byteLength(request.body) > 1024) throw new Error(); body = JSON.parse(request.body); }
      else { const chunks = []; let size = 0; for await (const chunk of request) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 1024) throw new Error(); chunks.push(bytes); } body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    } catch { return send(400, { message: 'Please select a topic and try again.' }); }
    if (!Object.hasOwn(TOPICS, body?.choice) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body?.id || '') || Object.keys(body).some(key => !['choice', 'id', 'note'].includes(key))) return send(400, { message: 'Please select a valid topic and try again.' });
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if ((body.choice === 'other' && (!note || body.note.length > 120)) || (body.choice !== 'other' && body.note !== undefined)) return send(400, { message: 'For Something else, please write up to 120 characters.' });
    try { const result = await recordVote(store, body.choice, body.id, { note }); const { status, ...data } = result; return send(status, { ...data, ...(preview ? { preview: true } : {}) }); }
    catch { return send(503, { message: 'Your choice could not be saved right now. Please try later.' }); }
  };
}
