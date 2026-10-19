# Homepage visitor poll

The homepage “Talk to me” box expands within the space above the synth card. It supports mouse, keyboard arrows and horizontal swipe, with ten topic choices. No names, email addresses, login, free text or IP addresses are stored by the poll. The hosting platform may retain normal request logs.

The browser remembers a random submission receipt and successful vote in local storage. The private counter stores aggregate topic totals and monthly hashed receipts to deduplicate retries. Clearing browser storage permits another vote; this lightweight preference poll is not an election or identity verification system.

## Storage and limits

The poll uses a separate private Vercel Blob store through `PROJECT_STORIES_POLL_READ_WRITE_TOKEN`. Keep this separate from the existing public media store and `BLOB_READ_WRITE_TOKEN`. No new media assets are needed. Each new accepted vote writes one small JSON counter with an ETag condition; conflicts retry once. Reads bypass the cache. Writes use the existing advanced-operation audit wrapper.

The counter permits at most 30 new votes per UTC day and 150 per UTC month. These caps limit successful writes, not all requests or conflict attempts, and do not guarantee that other account usage stays within a quota. Voting fails clearly when unavailable. The existing per-process operation guard also applies. Inspect Vercel usage before changing these limits.

## Local verification

Run `node serve-project.mjs` and open `http://localhost:8765/`. Local submissions use an in-memory counter and show “Preview only”; they do not affect production. Restarting the server clears test results. Run `node --test poll/poll-core.test.mjs` for vote, retry, concurrency, validation and budget checks.

## Read and export results

After the poll credential is available in `.env.local`, run `node --use-system-ca scripts/poll-results.mjs` to display aggregate totals. Add `--csv` to save `logs/poll-results.csv`. This performs one private read and no uploads or Blob listings. The JSON counter and CSV totals can move with the website to another host; the storage adapter is isolated from the vote logic.

Publishing requires the private store connection and a Vercel Node function at `/api/poll`. A static-only deployment cannot save votes.
