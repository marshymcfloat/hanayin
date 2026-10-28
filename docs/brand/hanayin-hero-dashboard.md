# Hero dashboard image

Asset: `public/hanaylo/hero-owner-dashboard-v2.png`.

The hero uses a browser screenshot of `OwnerDashboardStudy`, the actual
presentation component behind `/redesign/owner-dashboard`. It is labelled as
fictional sample data. No customer records, credentials, database writes, or
live API responses are included in the asset or capture fixture.

The local-only capture harness in `scripts/brand-dashboard` renders the same
component and CSS with typed fictional props. It substitutes plain anchors for
Next.js navigation and disables mutation callbacks. It is not a public app route.
No AI generation is used for UI text, numbers, or layout.

## Reproduce

1. Keep the regular Next.js development server running on port 3000 and visit
   `/redesign` once so its Poppins font assets are compiled.
2. Run `node scripts/brand-dashboard/server.mjs` from the repository root.
3. Use a dedicated browser session and open `http://127.0.0.1:4138`.
4. Set the viewport to 1600 × 1120. Wait for the dashboard, fonts, and entrance
   animations to settle. Confirm `document.fonts.check('14px Poppins')` is true.
5. Save a viewport screenshot to the asset path above. Visually inspect it before
   using it; other tasks must not share the capture browser session.
6. Stop only the temporary capture server when finished.

The harness reads compiled local font declarations and proxies their static
files from port 3000. It does not load `.env` files. Sample financial totals are
checked in `scripts/brand-dashboard/fixtures.test.ts`.
