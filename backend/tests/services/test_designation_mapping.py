from app.designation_mapping import classify_designation


def test_classify_designation_workbook_titles() -> None:
    expectations = {
        "STAFF NURSE I": ("RN", "A"),
        "STAFF NURSE II": ("RN", "A"),
        "SNR STAFF NURSE I": ("RN", "A"),
        "SNR STAFF NURSE II": ("RN", "A"),
        "ENROLLED NURSE I": ("EN", "B"),
        "ENROLLED NURSE II": ("EN", "B"),
        "SNR ENROLLED NURSE I": ("EN", "B"),
        "SNR ENROLLED NURSE II": ("EN", "B"),
        "NURSING AIDE I": ("NA", "B"),
        "NURSING AIDE II": ("NA", "B"),
        "SENIOR NURSING AIDE I": ("NA", "B"),
        "SENIOR NURSING AIDE II": ("NA", "B"),
        "PATIENT SERVICE ASST I": ("HCA3", "C"),
        "PATIENT SERVICE ASST II": ("HCA3", "C"),
        "SNR PATIENT SERVICE ASST": ("HCA3", "C"),
        "HEALTHCARE ASST I": ("HCA12", "B"),
        "HEALTHCARE ASST II": ("HCA12", "B"),
        "HEALTHCARE ASST III": ("HCA3", "C"),
        "SENIOR HEALTHCARE ASSISTANT I": ("HCA12", "B"),
        "SENIOR HEALTHCARE ASSISTANT II": ("HCA12", "B"),
    }

    for designation, expected in expectations.items():
        result = classify_designation(designation)
        assert result.staffing_role == expected[0]
        assert result.roster_rank == expected[1]


def test_classify_designation_excludes_manager_and_clinician_titles() -> None:
    for designation in (
        "NURSE MANAGER I",
        "NURSE MANAGER II",
        "NURSING MANAGER",
        "SENIOR NURSE MANAGER",
        "ASSISTANT NURSE CLINICIAN",
        "NURSE CLINICIAN II",
    ):
        result = classify_designation(designation)
        assert result.staffing_role is None
        assert result.roster_rank is None
