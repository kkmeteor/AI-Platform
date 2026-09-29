"""Test result reporting and query endpoints.

Automated test runs push their progress to POST /test-results/report using the
shared probe token (X-Probe-Token), and GET /test-results/builds returns the
records grouped by build for the results page.

One row is kept per (build_number, test_type, test_machine) run; repeated
reports for the same run update the row (upsert) instead of appending history.
Each report describes one finished test round through current_result: True
advances current_done by one, False advances failed_count by one.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_probe_token, require_role
from app.database import get_db
from app.models import TestResult, User
from app.schemas import (
    TestResultBuildGroup,
    TestResultBuildListResponse,
    TestResultReport,
    TestResultReportResponse,
    TestResultResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# The run identity must never be blanked out by a partial progress report.
_RUN_KEY_FIELDS = ("build_number", "test_type", "test_machine")


def _apply_report(result: TestResult, payload: TestResultReport) -> None:
    """Copy plain fields from this report onto the row (exclude run key).

    current_result is not a column: it advances the round counters instead
    (True -> current_done + 1, False -> failed_count + 1).
    """
    updates = payload.model_dump(exclude_unset=True)
    for key in _RUN_KEY_FIELDS:
        updates.pop(key, None)
    round_result = updates.pop("current_result", None)
    for key, value in updates.items():
        setattr(result, key, value)
    if round_result is True:
        result.current_done = (result.current_done or 0) + 1
    elif round_result is False:
        result.failed_count = (result.failed_count or 0) + 1


@router.post("/test-results/report", response_model=TestResultReportResponse)
def report_test_result(
    payload: TestResultReport,
    db: Session = Depends(get_db),
    _: bool = Depends(require_probe_token),
):
    """Receive a progress report from an automated test run (upsert by run key).

    The run is identified by (build_number, test_type, test_machine); the first
    report inserts the row, later reports update progress fields. Fields omitted
    from a report keep their previous values. current_result is applied as a
    server-side increment: True -> current_done + 1 (round passed), False ->
    failed_count + 1 (round failed).
    """

    def _find() -> TestResult | None:
        return (
            db.query(TestResult)
            .filter(
                TestResult.build_number == payload.build_number,
                TestResult.test_type == payload.test_type,
                TestResult.test_machine == payload.test_machine,
            )
            .first()
        )

    result = _find()
    created = result is None
    if created:
        result = TestResult(
            build_number=payload.build_number,
            test_type=payload.test_type,
            test_machine=payload.test_machine,
        )
        _apply_report(result, payload)
        db.add(result)
    else:
        _apply_report(result, payload)

    try:
        db.commit()
    except IntegrityError:
        # Rare race: two first reports for the same run arrive together; the
        # unique constraint rejects the loser, which then re-applies as update.
        db.rollback()
        result = _find()
        if result is None:
            raise HTTPException(status_code=500, detail="Failed to store test result")
        created = False
        _apply_report(result, payload)
        db.commit()

    db.refresh(result)
    if created:
        logger.info(
            "Test result registered: build=%s type=%s machine=%s",
            result.build_number,
            result.test_type,
            result.test_machine,
        )
    else:
        logger.debug(
            "Test result updated: build=%s type=%s machine=%s done=%s/%s failed=%s",
            result.build_number,
            result.test_type,
            result.test_machine,
            result.current_done,
            result.target_amount,
            result.failed_count,
        )
    return TestResultReportResponse(ok=True, id=result.id, created=created)


@router.get("/test-results/builds", response_model=TestResultBuildListResponse)
def list_test_result_builds(
    build_number: str | None = Query(default=None, description="Fuzzy match on build number"),
    test_type: str | None = Query(default=None, description="Exact test type filter"),
    test_machine: str | None = Query(default=None, description="Exact test machine filter"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "editor", "viewer")),
):
    """List test results grouped by build (newest builds first)."""
    query = db.query(TestResult)
    if build_number and build_number.strip():
        query = query.filter(TestResult.build_number.like(f"%{build_number.strip()}%"))
    if test_type:
        query = query.filter(TestResult.test_type == test_type)
    if test_machine:
        query = query.filter(TestResult.test_machine == test_machine)

    records = query.all()

    by_build: dict[str, list[TestResult]] = {}
    for record in records:
        by_build.setdefault(record.build_number, []).append(record)

    # Numeric build numbers sort by value (newest first); other identifiers
    # sort lexically and come after the numeric builds.
    numeric_builds = sorted((b for b in by_build if b.isdigit()), key=int, reverse=True)
    other_builds = sorted((b for b in by_build if not b.isdigit()), reverse=True)
    ordered_builds = numeric_builds + other_builds

    total = len(ordered_builds)
    page_builds = ordered_builds[(page - 1) * page_size : page * page_size]

    items: list[TestResultBuildGroup] = []
    for build in page_builds:
        runs = sorted(by_build[build], key=lambda r: (r.test_type, r.test_machine))
        first = runs[0]
        items.append(
            TestResultBuildGroup(
                build_number=build,
                hardware_version=first.hardware_version,
                software_version=first.software_version,
                runs=[TestResultResponse.model_validate(r) for r in runs],
            )
        )

    return TestResultBuildListResponse(items=items, total=total)
