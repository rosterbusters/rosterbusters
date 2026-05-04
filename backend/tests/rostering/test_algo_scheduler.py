import json

from app.api.routes.run_rostering import _staffing_to_algo_inputs
from app.api.routes.wards import _sync_legacy_staffing_columns
from app.models.roster import Ward
from app.rostering import algo_scheduler


def test_twelve_hour_ward_uses_twelve_hour_pipeline_even_when_ab_ratio_requested(monkeypatch) -> None:
    nurses = [{"id": 1, "name": "A1", "rank": "A"}]
    shifts = [{"A-12": {"A": 0, "B": 0, "C": 0}, "N-12": {"A": 0, "B": 0, "C": 0}}]

    called = {}

    def fake_twelve_hour_pipeline(*args, **kwargs):
        called["twelve_hour"] = True
        return {"nurses": []}

    def fail_ab_ratio_pipeline(*args, **kwargs):
        raise AssertionError("12-hour ward should not route to AB-RATIO")

    monkeypatch.setattr(algo_scheduler, "_run_twelve_hour_pipeline", fake_twelve_hour_pipeline)
    monkeypatch.setattr(algo_scheduler, "_run_ab_ratio_pipeline", fail_ab_ratio_pipeline)

    result = algo_scheduler.generate_roster(
        nurses=nurses,
        shifts=shifts,
        ward_hour_type="12_HOURS",
        algorithm="AB-RATIO",
    )

    assert called == {"twelve_hour": True}
    assert result == {"method": "12HR", "roster": {"nurses": []}}


def test_twelve_hour_ward_staffing_uses_twelve_hour_shift_keys() -> None:
    ward = Ward(
        wardname="Ward 16",
        wardhourtype="12_HOURS",
        am_rn=2,
        am_en_na_min=2,
        am_hca_min=0,
        pm_rn=2,
        pm_en_na_min=2,
        pm_hca_min=0,
        nd_rn=2,
        nd_en_na_min=1,
        nd_hca_min=0,
    )

    shifts, _ = _staffing_to_algo_inputs(ward)

    assert shifts[0] == {
        "A-12": {"A": 2, "B": 2, "C": 0},
        "N-12": {"A": 2, "B": 1, "C": 0},
    }


def test_sync_legacy_staffing_columns_sets_rank_a_night_max() -> None:
    ward = Ward(wardname="Ward 9", isactive=True)

    _sync_legacy_staffing_columns(
        ward,
        json.dumps(
            {
                "RN": {
                    "A": {"minimum": 2, "maximum": 2},
                    "P": {"minimum": 2, "maximum": 2},
                    "N": {"minimum": 1, "maximum": 3},
                },
                "EN": {
                    "A": {"minimum": 1, "maximum": 2},
                    "P": {"minimum": 1, "maximum": 2},
                    "N": {"minimum": 1, "maximum": 2},
                },
                "NA": {
                    "A": {"minimum": 0, "maximum": 1},
                    "P": {"minimum": 0, "maximum": 1},
                    "N": {"minimum": 0, "maximum": 1},
                },
                "HCA12": {
                    "A": {"minimum": 0, "maximum": 1},
                    "P": {"minimum": 0, "maximum": 1},
                    "N": {"minimum": 0, "maximum": 1},
                },
                "HCA3": {
                    "A": {"minimum": 0, "maximum": 1},
                    "P": {"minimum": 0, "maximum": 1},
                    "N": {"minimum": 0, "maximum": 1},
                },
            }
        ),
    )

    assert ward.nd_rn == 1
    assert ward.nd_rn_max == 3


def test_staffing_to_algo_inputs_uses_rank_a_night_max_column_when_present() -> None:
    ward = Ward(
        wardname="Ward 10",
        isactive=True,
        am_rn=2,
        am_en_na_min=1,
        am_hca_min=0,
        pm_rn=2,
        pm_en_na_min=1,
        pm_hca_min=0,
        nd_rn=1,
        nd_rn_max=3,
        nd_en_na_min=1,
        nd_hca_min=0,
        nd_hca_max=1,
    )

    _, milp_config = _staffing_to_algo_inputs(ward)

    assert milp_config["RN"]["max_night_per_day"] == 3
