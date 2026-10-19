import { createPollHandler } from '../poll/poll-core.mjs';
import { pollStore } from '../poll/poll-store.mjs';
export const config = { maxDuration: 30 };
export default async function handler(request, response) {
  const origins = ['https://project-stories-eta.vercel.app', ...[process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`)];
  try { return await createPollHandler(pollStore(), { origins })(request, response); }
  catch { response.setHeader('Cache-Control', 'no-store'); response.statusCode = 503; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ message: 'Voting is temporarily unavailable. Please try later.' })); }
}
