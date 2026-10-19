import { get, BlobPreconditionFailedError } from '@vercel/blob';
import { auditedPut } from '../scripts/blob-advanced-operations.mjs';
export const POLL_PATH = 'project-stories/poll/favourites-v1.json';
export function pollStore() {
  const token = process.env.PROJECT_STORIES_POLL_READ_WRITE_TOKEN;
  if (!token) throw new Error('Private poll storage is unavailable.');
  return {
    async read() {
      const result = await get(POLL_PATH, { access: 'private', token, useCache: false, abortSignal: AbortSignal.timeout(8000) });
      if (!result) return null;
      if (result.blob.size > 100000) throw new Error('Poll counter exceeded its size limit.');
      return { etag: result.blob.etag, data: await new Response(result.stream).json() };
    },
    async write(data, etag) {
      await auditedPut(POLL_PATH, JSON.stringify(data), { access: 'private', token, addRandomSuffix: false, allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}), contentType: 'application/json', cacheControlMaxAge: 60, multipart: false, abortSignal: AbortSignal.timeout(8000) }, { purpose: 'anonymous-poll-counter' });
    },
    isConflict(error) { return error instanceof BlobPreconditionFailedError || error?.name === 'BlobAlreadyExistsError'; },
  };
}
