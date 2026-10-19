import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TOPICS, emptyPoll, validPoll } from '../poll/poll-core.mjs';
import { pollStore } from '../poll/poll-store.mjs';
const root = new URL('../', import.meta.url);
try { process.loadEnvFile(fileURLToPath(new URL('.env.local', root))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
try {
  const snapshot = await pollStore().read();
  const data = snapshot ? validPoll(snapshot.data) : emptyPoll();
  const rows = Object.entries(TOPICS).map(([key, topic]) => ({ topic, votes: data.counts[key] }));
  console.table(rows.sort((a,b) => b.votes - a.votes));
  console.log(`Private comments available: ${(data.notes || []).length}. Use --csv to export totals and comments.`);
  if (process.argv.includes('--csv')) {
    await mkdir(new URL('logs/',root),{recursive:true});
    const destination = new URL('logs/poll-results.csv',root);
    await writeFile(destination,'topic,votes\n'+rows.map(row=>`"${row.topic.replaceAll('"','""')}",${row.votes}`).join('\n')+'\n');
    await writeFile(new URL('logs/poll-comments.json',root),JSON.stringify(data.notes || [],null,2)+'\n');
    console.log('Saved aggregate totals to logs/poll-results.csv and private comments to logs/poll-comments.json.');
  }
} catch { console.error('Could not read the private poll totals. Check the poll storage credential and connection.'); process.exitCode = 1; }
