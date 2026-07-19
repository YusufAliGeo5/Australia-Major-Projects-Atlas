#!/usr/bin/env python3
"""Build deterministic map-ready JSON from the supplied raw CSV.

The raw source file is intentionally treated as immutable. Editorial enrichment
(category and approximate map location) lives in data/curated and is joined by
Map legend ID.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = ROOT / "data" / "raw" / "Australia Projects.csv"
ENRICHMENT_PATH = ROOT / "data" / "curated" / "project_enrichment.csv"
SOURCE_PATH = ROOT / "data" / "source.json"
OUTPUT_PATH = ROOT / "site" / "data" / "projects.json"

REQUIRED_RAW_COLUMNS = {
    "Map legend",
    "Project name",
    "Project proponent",
    "Description",
    "State / Territory",
    "Major Project Status granted",
    "Major Project Status expires",
}
REQUIRED_ENRICHMENT_COLUMNS = {
    "Map legend",
    "Category",
    "Location label",
    "Latitude",
    "Longitude",
    "Location precision",
    "Location basis",
    "Marker dx",
    "Marker dy",
}
ALLOWED_STATES = {"ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"}
ALLOWED_CATEGORIES = {
    "Advanced manufacturing",
    "Carbon management",
    "Critical minerals & resources",
    "Digital infrastructure",
    "Offshore wind",
    "Renewable energy & hydrogen",
}
ALLOWED_PRECISION = {"exact", "locality", "regional"}
DATE_FORMATS = ("%d %b %Y", "%d %B %Y")

CAPEX_PATTERN = re.compile(
    r"capital expenditure(?:\s+of)?[^$]{0,80}(?:A)?\$\s*([0-9][0-9,.]*)\s*(billion|million)",
    re.IGNORECASE,
)
CONSTRUCTION_JOBS_PATTERN = re.compile(
    r"([0-9][0-9,]*)\s+constructions?(?:\s+jobs)?\b", re.IGNORECASE
)
ONGOING_JOBS_PATTERN = re.compile(
    r"([0-9][0-9,]*)\s+ongoing(?:\s+operational)?\s+jobs\b", re.IGNORECASE
)


class DataValidationError(ValueError):
    """Raised when source or enrichment data cannot be built safely."""


def _normalise_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def clean_description(value: str) -> str:
    """Remove the scraped trailing company-link label and preserve paragraphs."""

    lines = [_normalise_inline(line) for line in value.splitlines() if line.strip()]
    if len(lines) > 1:
        final = lines[-1]
        looks_like_link_label = (
            len(final) <= 100
            and len(final.split()) <= 14
            and not re.search(r"[.!?]$", final)
        )
        if looks_like_link_label:
            lines.pop()
    return "\n\n".join(lines)


def parse_date(value: str, *, field: str, project_id: int) -> str:
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    raise DataValidationError(
        f"Project {project_id}: could not parse {field!r} date {value!r}"
    )


def parse_capex_aud(description: str) -> int | None:
    match = CAPEX_PATTERN.search(_normalise_inline(description))
    if not match:
        return None
    value = float(match.group(1).replace(",", ""))
    multiplier = 1_000_000_000 if match.group(2).lower() == "billion" else 1_000_000
    return round(value * multiplier)


def _parse_job_count(description: str, pattern: re.Pattern[str]) -> int | None:
    match = pattern.search(_normalise_inline(description))
    return int(match.group(1).replace(",", "")) if match else None


def parse_state_codes(value: str, *, project_id: int) -> list[str]:
    codes = [part.strip().upper() for part in value.split(",") if part.strip()]
    invalid = sorted(set(codes) - ALLOWED_STATES)
    if not codes or invalid:
        raise DataValidationError(
            f"Project {project_id}: invalid state/territory value {value!r}; invalid codes: {invalid}"
        )
    return codes


def load_csv(path: Path, required_columns: set[str]) -> list[dict[str, str]]:
    if not path.exists():
        raise DataValidationError(f"Required file does not exist: {path.relative_to(ROOT)}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = sorted(required_columns - columns)
        if missing:
            raise DataValidationError(
                f"{path.relative_to(ROOT)} is missing required columns: {', '.join(missing)}"
            )
        return [dict(row) for row in reader]


def load_enrichment() -> dict[int, dict[str, Any]]:
    rows = load_csv(ENRICHMENT_PATH, REQUIRED_ENRICHMENT_COLUMNS)
    result: dict[int, dict[str, Any]] = {}
    for row in rows:
        try:
            project_id = int(row["Map legend"])
            latitude = float(row["Latitude"])
            longitude = float(row["Longitude"])
            marker_dx = float(row["Marker dx"] or 0)
            marker_dy = float(row["Marker dy"] or 0)
        except ValueError as exc:
            raise DataValidationError(
                f"Invalid numeric value in enrichment row {row.get('Map legend')!r}"
            ) from exc

        if project_id in result:
            raise DataValidationError(f"Duplicate enrichment row for project {project_id}")
        category = row["Category"].strip()
        precision = row["Location precision"].strip().lower()
        if category not in ALLOWED_CATEGORIES:
            raise DataValidationError(
                f"Project {project_id}: unsupported category {category!r}"
            )
        if precision not in ALLOWED_PRECISION:
            raise DataValidationError(
                f"Project {project_id}: unsupported location precision {precision!r}"
            )
        if not (-44.5 <= latitude <= -9.0 and 111.0 <= longitude <= 155.0):
            raise DataValidationError(
                f"Project {project_id}: coordinates are outside the Australian map extent"
            )
        result[project_id] = {
            "category": category,
            "location": {
                "label": row["Location label"].strip(),
                "latitude": latitude,
                "longitude": longitude,
                "precision": precision,
                "basis": row["Location basis"].strip(),
                "marker_offset": {"x": marker_dx, "y": marker_dy},
            },
        }
    return result


def build_payload() -> dict[str, Any]:
    raw_rows = load_csv(RAW_PATH, REQUIRED_RAW_COLUMNS)
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    enrichment = load_enrichment()

    projects: list[dict[str, Any]] = []
    seen_ids: set[int] = set()
    seen_names: set[str] = set()

    for row in raw_rows:
        try:
            project_id = int(row["Map legend"])
        except ValueError as exc:
            raise DataValidationError(
                f"Invalid Map legend value {row['Map legend']!r}"
            ) from exc
        if project_id in seen_ids:
            raise DataValidationError(f"Duplicate project ID {project_id}")
        seen_ids.add(project_id)

        name = _normalise_inline(row["Project name"])
        name_key = name.casefold()
        if not name or name_key in seen_names:
            raise DataValidationError(f"Project {project_id}: missing or duplicate project name")
        seen_names.add(name_key)

        if project_id not in enrichment:
            raise DataValidationError(f"Project {project_id}: missing enrichment row")

        description = clean_description(row["Description"])
        granted = parse_date(
            row["Major Project Status granted"],
            field="Major Project Status granted",
            project_id=project_id,
        )
        expires = parse_date(
            row["Major Project Status expires"],
            field="Major Project Status expires",
            project_id=project_id,
        )
        if expires <= granted:
            raise DataValidationError(
                f"Project {project_id}: expiry date must be after grant date"
            )

        project = {
            "id": project_id,
            "name": name,
            "proponent": _normalise_inline(row["Project proponent"]),
            "description": description,
            "state_display": _normalise_inline(row["State / Territory"]),
            "state_codes": parse_state_codes(
                row["State / Territory"], project_id=project_id
            ),
            "status_granted": granted,
            "status_expires": expires,
            "capex_aud": parse_capex_aud(description),
            "construction_jobs": _parse_job_count(
                description, CONSTRUCTION_JOBS_PATTERN
            ),
            "ongoing_jobs": _parse_job_count(description, ONGOING_JOBS_PATTERN),
            **enrichment[project_id],
        }
        projects.append(project)

    unexpected_enrichment = sorted(set(enrichment) - seen_ids)
    if unexpected_enrichment:
        raise DataValidationError(
            "Enrichment contains project IDs absent from the raw CSV: "
            + ", ".join(map(str, unexpected_enrichment))
        )

    projects.sort(key=lambda item: item["id"])
    expected_ids = list(range(1, len(projects) + 1))
    actual_ids = [item["id"] for item in projects]
    if actual_ids != expected_ids:
        raise DataValidationError(
            f"Map legend IDs must be contiguous from 1; got {actual_ids}"
        )

    capex_values = [p["capex_aud"] for p in projects if p["capex_aud"] is not None]
    construction_values = [
        p["construction_jobs"]
        for p in projects
        if p["construction_jobs"] is not None
    ]
    ongoing_values = [p["ongoing_jobs"] for p in projects if p["ongoing_jobs"] is not None]

    return {
        "meta": {
            "schema_version": 1,
            "project_count": len(projects),
            "reported_capex_aud": sum(capex_values),
            "capex_project_count": len(capex_values),
            "reported_construction_jobs": sum(construction_values),
            "construction_jobs_project_count": len(construction_values),
            "reported_ongoing_jobs": sum(ongoing_values),
            "ongoing_jobs_project_count": len(ongoing_values),
            "categories": dict(sorted(Counter(p["category"] for p in projects).items())),
            "states": dict(
                sorted(Counter(code for p in projects for code in p["state_codes"]).items())
            ),
            "raw_sha256": hashlib.sha256(RAW_PATH.read_bytes()).hexdigest(),
            "source": source,
        },
        "projects": projects,
    }


def serialise(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when the committed JSON is not up to date.",
    )
    args = parser.parse_args(argv)

    try:
        rendered = serialise(build_payload())
    except (DataValidationError, json.JSONDecodeError) as exc:
        print(f"data build failed: {exc}", file=sys.stderr)
        return 1

    if args.check:
        if not OUTPUT_PATH.exists() or OUTPUT_PATH.read_text(encoding="utf-8") != rendered:
            print(
                "site/data/projects.json is stale; run `python scripts/build_data.py`.",
                file=sys.stderr,
            )
            return 1
        print("site/data/projects.json is up to date")
        return 0

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(rendered, encoding="utf-8")
    print(f"wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
