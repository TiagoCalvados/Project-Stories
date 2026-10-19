# Homepage visitor poll

The homepage “Talk to me” box expands within the space above the synth card. All ten topic choices appear together in a compact grid of radio options, without a carousel. Select a topic and press “Send my choice”. Selecting “Something else” reveals a required short comment field (120 characters). The poll does not request names, contact details or login, and does not store IP addresses. Comments are private and may contain whatever the visitor types; the form asks visitors to leave out personal details. The hosting platform may retain normal request logs.

The browser remembers a random submission receipt and successful vote in local storage. The private counter stores aggregate topic totals, monthly hashed receipts to deduplicate retries, and the latest 100 short comments with their calendar month. Export comments regularly to retain older feedback. Comments never appear publicly or in operation logs. Clearing browser storage permits another vote; this lightweight preference poll is not an election or identity verification system.

## Storage and limits

The poll uses a separate private Vercel Blob store through `PROJECT_STORIES_POLL_READ_WRITE_TOKEN`. Keep this separate from the existing public media store and `BLOB_READ_WRITE_TOKEN`. No new media assets are needed. Each new accepted vote writes one small JSON counter with an ETag condition; conflicts retry once. Reads bypass the cache. Writes use the existing advanced-operation audit wrapper.

The counter permits at most 30 new votes per UTC day and 150 per UTC month. These caps limit successful writes, not all requests or conflict attempts, and do not guarantee that other account usage stays within a quota. Voting fails clearly when unavailable. The existing per-process operation guard also applies. Inspect Vercel usage before changing these limits.

## Local verification

Run `node serve-project.mjs` and open `http://localhost:8765/`. Local submissions use an in-memory counter and show “Preview only”; they do not affect production. Restarting the server clears test results. Run `node --test poll/poll-core.test.mjs` for vote, retry, concurrency, validation and budget checks.

## Read and export results

After the poll credential is available in `.env.local`, run `node --use-system-ca scripts/poll-results.mjs` to display aggregate totals. Add `--csv` to save `logs/poll-results.csv` and `logs/poll-comments.json`. This performs one private read and no uploads or Blob listings. The JSON counter and CSV totals can move with the website to another host; the storage adapter is isolated from the vote logic.

Publishing requires the private store connection and a Vercel Node function at `/api/poll`. A static-only deployment cannot save votes.
