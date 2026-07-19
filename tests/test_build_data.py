from __future__ import annotations

import json
import unittest
from pathlib import Path

from scripts import build_data


ROOT = Path(__file__).resolve().parents[1]


class MetricParsingTests(unittest.TestCase):
    def test_capex_parses_billions_and_millions(self) -> None:
        self.assertEqual(
            build_data.parse_capex_aud(
                "The project has a projected capital expenditure of $3.5 billion."
            ),
            3_500_000_000,
        )
        self.assertEqual(
            build_data.parse_capex_aud(
                "The project has a projected capital expenditure of approximately A$511.3 million."
            ),
            511_300_000,
        )

    def test_capex_does_not_treat_eligibility_threshold_as_project_value(self) -> None:
        self.assertIsNone(
            build_data.parse_capex_aud(
                "The project exceeds the Major Project Status eligibility threshold of $50 million CAPEX."
            )
        )

    def test_job_patterns_cover_source_variants(self) -> None:
        description = "The project would create 2,500 construction and 600 ongoing jobs."
        self.assertEqual(
            build_data._parse_job_count(
                description, build_data.CONSTRUCTION_JOBS_PATTERN
            ),
            2_500,
        )
        self.assertEqual(
            build_data._parse_job_count(description, build_data.ONGOING_JOBS_PATTERN),
            600,
        )
        self.assertEqual(
            build_data._parse_job_count(
                "About 100 constructions jobs are expected.",
                build_data.CONSTRUCTION_JOBS_PATTERN,
            ),
            100,
        )
        self.assertEqual(
            build_data._parse_job_count(
                "Around 800 ongoing operational jobs are expected.",
                build_data.ONGOING_JOBS_PATTERN,
            ),
            800,
        )

    def test_scraped_company_link_label_is_removed(self) -> None:
        value = "A complete project sentence.\nCompany Link Label"
        self.assertEqual(build_data.clean_description(value), "A complete project sentence.")


class RepositoryDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = build_data.build_payload()
        cls.projects = cls.payload["projects"]
        cls.meta = cls.payload["meta"]

    def test_project_ids_are_complete_and_unique(self) -> None:
        self.assertEqual([project["id"] for project in self.projects], list(range(1, 31)))
        self.assertEqual(len({project["name"] for project in self.projects}), 30)

    def test_expected_metric_coverage_and_totals(self) -> None:
        self.assertEqual(self.meta["project_count"], 30)
        self.assertEqual(self.meta["reported_capex_aud"], 304_846_300_000)
        self.assertEqual(self.meta["capex_project_count"], 29)
        self.assertEqual(self.meta["reported_construction_jobs"], 35_424)
        self.assertEqual(self.meta["construction_jobs_project_count"], 28)
        self.assertEqual(self.meta["reported_ongoing_jobs"], 14_385)
        self.assertEqual(self.meta["ongoing_jobs_project_count"], 29)

    def test_luni_unquantified_metrics_remain_null(self) -> None:
        luni = next(project for project in self.projects if project["id"] == 13)
        self.assertIsNone(luni["capex_aud"])
        self.assertIsNone(luni["construction_jobs"])
        self.assertIsNone(luni["ongoing_jobs"])

    def test_dates_and_locations_are_valid(self) -> None:
        for project in self.projects:
            with self.subTest(project=project["id"]):
                self.assertLess(project["status_granted"], project["status_expires"])
                location = project["location"]
                self.assertTrue(-44.5 <= location["latitude"] <= -9.0)
                self.assertTrue(111.0 <= location["longitude"] <= 155.0)
                self.assertEqual(location["precision"], "regional")

    def test_descriptions_do_not_end_with_scraped_link_labels(self) -> None:
        for project in self.projects:
            with self.subTest(project=project["id"]):
                final_paragraph = project["description"].split("\n\n")[-1]
                self.assertRegex(final_paragraph, r"[.!?]$")

    def test_generated_json_is_current(self) -> None:
        committed = (ROOT / "site" / "data" / "projects.json").read_text(
            encoding="utf-8"
        )
        self.assertEqual(committed, build_data.serialise(self.payload))

    def test_source_metadata_is_present(self) -> None:
        source = self.meta["source"]
        self.assertTrue(source["url"].startswith("https://business.gov.au/"))
        self.assertEqual(source["repository_snapshot_date"], "2026-05-26")

    def test_basemap_is_valid_geojson(self) -> None:
        basemap = json.loads(
            (ROOT / "site" / "data" / "australia.geojson").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(basemap["type"], "FeatureCollection")
        self.assertGreater(len(basemap["features"]), 0)


if __name__ == "__main__":
    unittest.main()
