# Private homepage statistics

The homepage uses Vercel Web Analytics. Statistics are private to the Vercel account; no visitor counter or credentials are exposed on the website.

Dashboard: https://vercel.com/tiago-calvados-projects/project-stories/analytics

- Collection starts with the analytics deployment on 15 October 2026. Analytics was not enabled before this change, so this tracker cannot recover earlier visits.
- Only the production homepage at `project-stories-eta.vercel.app` is tracked. `/index.html` is grouped into `/`. Local previews, deployment-preview hosts, story pages, and the synth are not tracked.
- The dashboard reports page views and estimated unique visitors, not a lifetime count of individual people. Vercel discards visitor identifiers after 24 hours; returning visitors can be counted again. Reloads increase page views.
- The loader removes homepage query parameters and fragments and respects Do Not Track and Global Privacy Control. Ad blockers, disabled JavaScript, and privacy preferences can cause undercounting.
- Vercel provides aggregate statistics such as referrer, approximate location, browser, and device without analytics cookies. No names, email addresses, or synth interactions are sent by this integration.
- The current Hobby plan includes 50,000 events per month shared across the team, with a one-month reporting window. Collection can pause at the free limit; no paid upgrade or Analytics Plus add-on is enabled by this change. Export reports regularly if you need longer-term records.
- If the production domain changes, update the hostname guard in `homepage-analytics.js`.

References: https://vercel.com/docs/analytics/quickstart, https://vercel.com/docs/analytics/privacy-policy, https://vercel.com/docs/analytics/limits-and-pricing
