\# what to do after every change



* add, commit and push
* deploy on vercel (cli is available)

\# story picture folder updates

* whenever any story page or story picture is added, replaced, edited, or reordered, also update the matching file in `C:\Users\audio\OneDrive\Documents\youtube-music-downloader\project-stories-recovered\tiago-k-story-online-pics`
* keep that folder as the ordered snapshot of the pictures that are online; for example NGR7 is `10-b4ngr7.png`

\# task confirmation rule

* before starting any task, restate what you think the user wants and ask for confirmation
* only begin making changes, running task commands, committing, pushing, or deploying after the user explicitly says something like "make the changes", "go ahead", "yes", or "do it"
* questions, brainstorming, and discussion are safe to answer without turning them into implementation work

\# what to do when checking this project

* only use the local page for development checks: start `node serve-project.mjs` and open http://localhost:8765/

\# icon button routing notes

* narrative slides always belong under the tree icon button, even if a slide name or file name includes "Tiago K"
* before adding or changing a link, confirm which icon button it belongs to so duplicate paths do not get created

\# Vercel Blob advanced-operation monitoring

* route every Blob `put()`, `copy()`, `list()`, and multipart operation through `scripts/blob-advanced-operations.mjs`
* never perform manifest-miss Blob uploads inside Vercel; run `npm run build:deploy` locally and commit `blob-manifest.json` first
* inspect the local 14-day operation history with `npm run blob:operations`
