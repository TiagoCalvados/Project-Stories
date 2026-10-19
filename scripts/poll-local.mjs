import { createPollHandler } from '../poll/poll-core.mjs';
let current = null, version = 0;
const store = {
  async read() { return current ? { etag: String(version), data: structuredClone(current) } : null; },
  async write(data, etag) { if ((current && etag !== String(version)) || (!current && etag)) throw Object.assign(new Error('Conflict'), { conflict: true }); current = structuredClone(data); version++; },
  isConflict(error) { return error.conflict === true; },
};
export const localPoll = createPollHandler(store, { origins: ['http://localhost:8765', 'http://127.0.0.1:8765'], preview: true });
