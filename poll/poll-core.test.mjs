import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPollHandler, emptyPoll, recordVote } from './poll-core.mjs';
function memory() {
  let data = null, version = 0, writes = 0;
  return {
    async read() { return data ? { data: structuredClone(data), etag: String(version) } : null; },
    async write(next, etag) { if (etag !== (data ? String(version) : undefined)) throw { conflict: true }; data = structuredClone(next); version++; writes++; },
    isConflict: error => error.conflict === true,
    get data() { return data; }, get writes() { return writes; },
  };
}
const store = memory(), id = randomUUID();
assert.equal((await recordVote(store, 'daao', id)).accepted, true);
assert.equal((await recordVote(store, 'daao', id)).accepted, true);
assert.equal(store.writes, 1); assert.equal(store.data.counts.daao, 1);
assert.equal((await recordVote(store, 'synth', id)).status, 409);
const concurrent = memory();
assert.ok((await Promise.all(['synth', 'daao'].map(choice => recordVote(concurrent, choice, randomUUID())))).every(result => result.accepted));
assert.equal(concurrent.data.counts.synth + concurrent.data.counts.daao, 2);
const budget = memory(), date = new Date('2026-10-19T12:00:00Z');
assert.equal((await recordVote(budget, 'synth', randomUUID(), { now: date, dailyLimit: 1 })).status, 200);
assert.equal((await recordVote(budget, 'synth', randomUUID(), { now: date, dailyLimit: 1 })).status, 429);
assert.equal(budget.writes, 1);
assert.equal((await recordVote(budget, 'synth', randomUUID(), { now: new Date('2026-10-20'), monthlyLimit: 1 })).status, 429);
assert.equal((await recordVote(budget, 'synth', randomUUID(), { now: new Date('2026-11-01'), monthlyLimit: 1 })).status, 200);
assert.equal(budget.data.counts.synth, 2);
assert.ok(!JSON.stringify(store.data).includes(id));
async function request(overrides = {}, backend = memory()) {
  const req = { method: 'POST', headers: { origin: 'http://localhost:8765', 'content-type': 'application/json' }, body: { choice: 'daao', id: randomUUID() }, ...overrides };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await createPollHandler(backend, { origins: ['http://localhost:8765'], preview: true })(req, res);
  return res;
}
assert.equal((await request()).body.preview, true);
assert.equal((await request({ method: 'GET' })).statusCode, 405);
assert.equal((await request({ headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json' } })).statusCode, 403);
assert.equal((await request({ body: { choice: 'daao', id: randomUUID(), email: 'test@example.com' } })).statusCode, 400);
assert.equal((await request({ body: { choice: 'unknown', id: randomUUID() } })).statusCode, 400);
assert.equal((await request({}, { read() { throw Error('storage failure'); } })).statusCode, 503);
assert.equal(Object.values(emptyPoll().counts).reduce((a,b) => a+b), 0);
console.log('PASS: atomic concurrent votes, retry deduplication, budget caps, period rollover, private receipts, request validation, preview isolation and storage failure.');
