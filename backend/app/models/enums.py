from enum import Enum


class NotificationType(str, Enum):
    """
    Canonical notification types with associated message body templates.

    Usage:
        NotificationType.ROSTER_RELEASE.template.format(roster_period="Mar 2026 Week 1")
    """

    def __new__(cls, value: str, template: str = ""):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.template = template
        return obj

    # ------------------------------------------------------------------ #
    # Ward Staff notifications
    # ------------------------------------------------------------------ #

    SHIFT_REQUEST_PERIOD_OPEN = (
        "ShiftRequestPeriodOpen",
        "Shift Request Period ({roster_period}) is Now Open.",
    )
    SHIFT_REQUEST_PERIOD_CLOSING_SOON = (
        "ShiftRequestPeriodClosingSoon",
        "Reminder: Shift request period closing in 12h for {roster_period}.",
    )
    ROSTER_RELEASE = (
        "RosterRelease",
        "{roster_period} Roster Released.",
    )
    SHIFT_REQUEST_APPROVED = (
        "ShiftRequestApproved",
        "Your Shift Request for {roster_period} has been Approved.",
    )
    SHIFT_REQUEST_REJECTED = (
        "ShiftRequestRejected",
        "Your Shift Request for {roster_period} has been Rejected.",
    )

    SHIFT_UPDATED = (
        "ShiftUpdated",
        "Your Shift for {start_date} has been changed.",
    )

    LEAVE_APPROVED = (
        "LeaveApproved",
        "Your Leave Request ({leave_dates}) has been Approved.",
    )
    LEAVE_REJECTED = (
        "LeaveRejected",
        "Your Leave Request ({leave_dates}) has been Rejected.",
    )

    # ------------------------------------------------------------------ #
    # Nurse Manager notifications                                          #
    # ------------------------------------------------------------------ #

    ROSTER_PLANNING = (
        "RosterPlanning",
        "Start Planning Roster for {roster_period}.",
    )
    ROSTER_FINALISATION = (
        "RosterFinalisation",
        "Reminder: Publish Roster due {roster_planning_end_date}.",
    )
    HRIS_PORTAL_OPEN = (
        "HRISPortalOpen",
        "Reminder: Export Roster to HRIS system for {roster_period}.",
    )
    HRIS_PORTAL_CLOSING_SOON = (
        "HRISPortalClosingSoon",
        "Reminder: HRIS Export Portal closing in 12h for {roster_period}.",
    )
    HRIS_REMINDER = (
        "HRISReminder",
        "Reminder: Export Roster to HRIS system by {roster_end_date}.",
    )
    LEAVE_REQUEST = (
        "LeaveRequest",
        "{nurse_name} applied for {leave_code} for {request_date}.",
    )
    SHIFT_REQUEST_REVIEW_OPEN = (
        "ShiftRequestReviewOpen",
        "Shift Requests Review for {roster_period} is Open.",
    )
    SHIFT_REQUEST_REVIEW_CLOSING_SOON = (
        "ShiftRequestReviewClosingSoon",
        "Shift Requests Review for {roster_period} is Closing Soon (12h).",
    )
    SHIFT_REQUEST_REVIEW_CLOSED = (
        "ShiftRequestReviewClosed",
        "Shift Requests Review for {roster_period} is Closed.",
    )
    ALGORITHM_GENERATION = (
        "AlgorithmGeneration",
        "Algorithm generated for {roster_period}.",
    )
    ALGORITHM_IN_PROGRESS = (
        "AlgorithmInProgress",
        "Algorithm generation in progress for {roster_period}.",
    )
