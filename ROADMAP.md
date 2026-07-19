# Delivery roadmap

## Now: make the MVP publishable

1. **Reconcile the live government register.** Review additions, removals, renamed projects, dates and proponents against the supplied snapshot. Treat this as the launch blocker.
2. **Verify all 30 regional markers.** Replace inferred regional points with proponent- or approval-document locations where available, while retaining the precision field.
3. **Confirm licensing and ownership.** Add the repository licence, nominate a data owner and agree an update cadence.
4. **Enable GitHub Pages.** Select GitHub Actions as the Pages source, merge to `main` and verify the first deployment.

## Next: reduce maintenance risk

- Add a source-ingestion command that downloads the government register into a dated staging file.
- Generate a human-reviewable change report before replacing the committed snapshot.
- Add source URLs at project level where the register exposes proponent links.
- Record `added`, `changed` and `removed` project history rather than publishing only the latest state.
- Add an accessibility pass covering keyboard navigation, screen readers, zoom and colour contrast.

## Later: deepen the product

- Shareable URLs for filters and individual projects.
- Project boundary or corridor geometry where authoritative spatial data is published.
- Timeline views for status grant and expiry dates.
- State, category and investment comparison charts.
- Downloadable filtered CSV/JSON.
- Analytics and error monitoring with a privacy review.
- Automated visual regression checks at desktop and mobile breakpoints.

## Product decisions still needed

- Is the map a public information product, an internal research tool or both?
- Should the dataset cover only current Major Project Status projects, or also expired and withdrawn projects?
- What qualifies as the authoritative location when a project has mines, processing plants, ports, pipelines or offshore components in different places?
- Who approves editorial categories and project descriptions before publication?
