# Data audit

Audit date: **19 July 2026**

## Supplied snapshot

The raw file contains **30 unique projects** and seven source columns:

- map legend ID;
- project name;
- project proponent;
- description;
- state or territory;
- Major Project Status grant date; and
- Major Project Status expiry date.

All 30 rows have a project name, proponent, description, jurisdiction and valid grant/expiry dates. Map legend IDs are contiguous from 1 to 30.

## Parsed coverage

| Metric | Projects with a numeric value | Total in supplied snapshot |
| --- | ---: | ---: |
| Capital expenditure | 29 of 30 | A$304.8463 billion |
| Construction jobs | 28 of 30 | 35,424 |
| Ongoing jobs | 29 of 30 | 14,385 |

The Luni Niobium Project is intentionally left without numeric capital or jobs values. Its description provides an eligibility threshold and says “hundreds of jobs”, not a defensible project estimate. The Australian Renewable Energy Hub description reports ongoing jobs but no construction-jobs figure.

## Enrichment added by this repository

The source CSV contains no coordinates or sector taxonomy. `data/curated/project_enrichment.csv` therefore adds:

- one editorial category per project;
- an approximate regional latitude and longitude;
- a human-readable location label;
- a precision and provenance note; and
- a small display-only marker offset where nearby projects would overlap.

The enrichment layer is kept separate so source facts are not confused with editorial or geospatial interpretation.

## Source freshness risk

The supplied files are timestamped 26 May 2026. The government register is a live page and can change after a snapshot is taken. A source reconciliation is therefore a release requirement, not an optional cleanup step.

During this bootstrap review, the live register had already changed at project 26: the supplied CSV lists **Sunrise Battery Materials Complex**, while the live register listed **Syerston Scandium Project**. Do not silently overwrite the snapshot; review changes, update enrichment, regenerate JSON and record the new snapshot date together.

## Data quality rules enforced in code

- Required source and enrichment columns must exist.
- Project IDs and names must be unique.
- Project IDs must remain contiguous from 1.
- Every raw project must have exactly one enrichment row.
- Jurisdiction codes must be recognised Australian states or territories.
- Status expiry must be later than status grant.
- Coordinates must fall within the Australian map extent.
- Capital is parsed only from a “capital expenditure” statement.
- Missing or qualitative metrics remain null.
