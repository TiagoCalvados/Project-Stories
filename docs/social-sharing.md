# Sharing Project Stories

Share **https://project-stories-eta.vercel.app/**. Vercel's unique deployment URLs
can require Vercel sign-in, even when the production domain is public. A crawler
that reaches a sign-in page cannot read this site's Open Graph metadata.
Canonical metadata cannot fix an authentication redirect before the HTML loads.

The homepage includes Open Graph and large-image Twitter Card metadata in its
initial HTML. Both use an absolute image URL on the production domain.
`scripts/build.mjs` copies the share images into `dist` directly; they do not
require Blob uploads. Keep this copy step when changing the build.

## Updating the picture

Run `powershell -NoProfile -File scripts/generate-social-preview.ps1` to rebuild
`social-preview-2026-10.png` from the current homepage artwork. This is a static
1200 by 630 overview, with named sections, the lunar clock, and the app descriptions.
It does not change any story picture or page.

For a future picture change, use a new filename and update the generator output,
homepage image metadata, and build's `staticShareImages` list together. Retain old
images: Meta caches by image URL, and existing shares can still reference them.

## Checking and publishing

Use `node serve-project.mjs` at http://localhost:8765/ for development checks.
Check the picture and confirm the homepage's desktop and narrow-phone app
descriptions and routes remain intact. Run `npm run build:deploy` locally and
`npm run blob:operations`; commit any manifest updates before Vercel deployment.
Confirm that the built image exists at the exact path specified by `og:image`.

After publishing, verify the production HTML and image return their actual content
without sign-in or redirects for `facebookexternalhit/1.1`. Check the image's PNG
type, real dimensions, and size. A successful user-agent check is useful evidence,
but does not prove a fetch from Meta's own infrastructure has succeeded.

Open [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/), sign
in if asked, and enter the regular homepage URL. Use **Debug**, then **Scrape
Again** if the previous metadata is still cached. Confirm the image and title in
the result before sharing. This step requires the user's Facebook session; a
deployment alone does not confirm that Facebook has refreshed its cache.

Updating the URL's image does not automatically update existing posts. See
[Meta's image guidance](https://developers.facebook.com/documentation/sharing/webmasters/images)
and [Link Sharing FAQ](https://developers.facebook.com/documentation/sharing/webmasters/faq)
for pre-caching and refreshing an existing share.
