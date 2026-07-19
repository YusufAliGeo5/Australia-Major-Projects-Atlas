# Australia Major Projects Atlas

**Mapping major projects, infrastructure, investment, employment and regional opportunity across Australia.**

The **Australia Major Projects Atlas** is an independent GIS and data visualisation project exploring the geography of major investment projects across Australia.

The repository is designed as the home for a growing series of related products: a national project explorer, project-specific map briefs, interactive web maps, ArcGIS StoryMaps, dashboards, data and reproducible methodology.

The current working product is the **Major Projects Explorer**.

![Desktop preview of the Major Projects Explorer](docs/preview.png)

## Atlas components

| Component | Purpose | Status |
|---|---|---|
| **Major Projects Explorer** | Search, filter and compare major projects across Australia | Working MVP |
| **Major Project Map Briefs** | Explain individual projects, infrastructure and regional opportunity | Pilot stage |
| **Interactive Web Maps** | Provide detailed project and regional geography | Planned |
| **Major Project Stories** | Present narrative project profiles through ArcGIS StoryMaps | Planned |
| **Australia Major Projects Dashboard** | Summarise national project patterns and indicators | Under consideration |
| **Data and Methodology** | Document sources, assumptions, processing and limitations | In development |

## Major Projects Explorer

The **Major Projects Explorer** is the national entry point to the atlas. It currently allows users to:

- search projects by name, proponent, description or location;
- filter projects by state, territory and category;
- compare reported capital expenditure and employment figures;
- view approximate regional project locations; and
- browse project descriptions and key metrics.

The explorer is intended as a discovery and comparison tool. As detailed project products are added, project cards will link to available map briefs, web maps, StoryMaps and supporting methodology.

## Major Project Map Briefs

Selected projects will receive dedicated cartographic briefs. These will generally use a two-part structure:

1. **Project geography and infrastructure** — the project location, footprint, supporting infrastructure, transport or transmission connections, nearby communities and relevant environmental context.
2. **Workforce and regional opportunity** — construction and operating employment, workforce readiness, relevant industries, training capacity, supply chains and regional economic opportunity.

The analytical content will vary by project type. Offshore wind may require greater emphasis on ports, marine services and transmission, while mining and processing projects may focus on freight, energy, water, workforce access and industrial capability.

The **Star of the South** offshore wind concept is the first pilot for this format.

## Run locally

Python 3.10 or newer is sufficient. The explorer does not require npm packages, a database, a map API or third-party runtime JavaScript.

```bash
python scripts/build_data.py
python -m http.server 8000 --directory site
```

Open:

```text
http://localhost:8000
```

With `make` installed:

```bash
make serve
```

## Validate the project

Run the full validation suite before committing changes:

```bash
make check
```

Validation checks include:

- required raw and curated data fields;
- project IDs, dates, jurisdictions and coordinates;
- capital expenditure and employment parsing;
- one-to-one matching between raw projects and enrichment records;
- generated application data;
- Python unit tests; and
- JavaScript syntax.

## Update the national project data

1. Replace `data/raw/Australia Projects.csv` with the reviewed source snapshot while preserving the required columns.
2. Reconcile each project ID with `data/curated/project_enrichment.csv`.
3. Review project categories, regional labels, coordinates and marker offsets.
4. Run `python scripts/build_data.py`.
5. Run `make check`.
6. Review the explorer locally before committing the source data, enrichment changes and regenerated JSON together.

The build intentionally fails when the raw project register and curated enrichment layer do not match.

## Current repository structure

```text
.
├── data/
│   ├── curated/project_enrichment.csv
│   ├── raw/Australia Projects.csv
│   └── source.json
├── docs/
│   └── preview.png
├── scripts/
│   └── build_data.py
├── site/
│   ├── assets/
│   ├── data/
│   └── index.html
├── tests/
│   └── test_build_data.py
├── DATA_AUDIT.md
├── ROADMAP.md
└── Makefile
```

As the atlas grows, project-specific material can be organised under a structure such as:

```text
projects/
├── star-of-the-south/
│   ├── data/
│   ├── maps/
│   ├── methodology/
│   └── arcgis/
└── additional-projects/

templates/
├── project-brief/
├── project-readme-template.md
├── source-register-template.csv
└── methodology-template.md

shared-data/
├── boundaries/
├── transport/
├── ports/
├── labour-market/
└── metadata/
```

Large geodatabases, proprietary material and unnecessary source files should not be committed directly. Where practical, the repository should store open processed formats, source links, download instructions, metadata and reproducible scripts.

## Data and geographic limitations

The current explorer is based on the supplied Australian Government major project register. Capital expenditure and employment values are project- or proponent-reported figures contained in the source descriptions. They should not be treated as independently verified outcomes unless explicitly stated.

The source register does not provide precise coordinates or project boundary geometry. Locations in `data/curated/project_enrichment.csv` are approximate regional reference points derived from project descriptions, named localities and the published source map.

They must not be represented as legal project boundaries, approved infrastructure alignments, cadastral locations or engineering coordinates.

Detailed project maps should clearly distinguish between verified geometry, proposed corridors, approximate locations, conceptual infrastructure and analytical reference points.

See [DATA_AUDIT.md](DATA_AUDIT.md) for the current dataset review and [ROADMAP.md](ROADMAP.md) for delivery priorities.

## Roadmap

The next priorities are to:

1. complete the transition from a single map project to the Australia Major Projects Atlas;
2. refine the national explorer and project metadata model;
3. create reusable project brief, source and methodology templates;
4. develop several pilot briefs across different project sectors;
5. publish selected ArcGIS web maps and a flagship StoryMap; and
6. expand the series based on data availability, geographic diversity and regional significance.

## Deploy with GitHub Pages

The included GitHub Pages workflow builds the project data, runs validation and deploys the contents of `site/` after a push to `main`.

Set the repository publishing source to:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

## Attribution, licensing and disclaimer

Source attribution for the national project register is recorded in the application and in `data/source.json`. The simplified national outline is derived from Natural Earth country geometry, which is public domain.

A repository licence should be selected before public reuse or outside contribution. Individual datasets, basemaps, icons and ArcGIS items may have separate attribution and licensing requirements.

The Australia Major Projects Atlas is not an official Australian Government product and is not affiliated with project proponents unless explicitly stated. Project status, costs, employment estimates and proposed infrastructure may change. Official government, planning and proponent sources should be consulted for current legal, technical or investment information.
