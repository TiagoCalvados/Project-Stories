\# what to do after every change



* add, commit and push
* deploy on vercel (cli is available)

\# what to do when checking this project

* only use the local page for development checks: start `node serve-project.mjs` and open http://localhost:8765/

\# icon button routing notes

* narrative slides always belong under the tree icon button, even if a slide name or file name includes "Tiago K"
* before adding or changing a link, confirm which icon button it belongs to so duplicate paths do not get created

\# Vercel Blob advanced-operation monitoring

* route every Blob `put()`, `copy()`, `list()`, and multipart operation through `scripts/blob-advanced-operations.mjs`
* never perform manifest-miss Blob uploads inside Vercel; run `npm run build:deploy` locally and commit `blob-manifest.json` first
* inspect the local 14-day operation history with `npm run blob:operations`
