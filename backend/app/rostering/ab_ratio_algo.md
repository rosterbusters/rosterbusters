# AB-RATIO Rostering Algorithm

This document describes what happens in `ab_ratio_algo.py`, the OR-Tools CP-SAT based nurse rostering solver for the `AB-RATIO` algorithm.

## High-Level Flow

`run_ab_ratio_pipeline(...)` is the main entry point.

1. Validate that `ortools.sat.python.cp_model` is installed.
2. Parse and normalize nurses, shifts, hard requests, soft requests, previous roster carry-over shifts, and `milp_config`.
3. Build a CP-SAT model with one boolean variable per nurse, day, and shift code.
4. Add hard constraints that must be satisfied for a feasible roster.
5. Add soft constraints as weighted penalty variables.
6. Add a greedy warm-start hint to guide the solver.
7. Solve within a configured time limit.
8. If infeasible, retry selected "hard-then-soft" rules or run diagnostic relaxations to produce a more specific error.
9. Format the schedule labels and return nurse stats plus metadata.

The solver minimizes a weighted penalty score. A feasible solution may still violate soft preferences, but it cannot violate hard constraints unless one of the internal diagnostic or fallback relaxation flags is enabled.

## Shift And Leave Codes

Internal shift codes:

| Code | Meaning |
| --- | --- |
| `OFF = 0` | Day off |
| `AM = 1` | Morning shift |
| `PM = 2` | Afternoon/evening shift |
| `NIGHT = 3` | Night shift |
| `AL = 4` | Leave/non-working overlay |

String inputs are normalized through `_SHIFT_STR_TO_CODE`:

| Input | Internal shift |
| --- | --- |
| `AM`, `A` | `AM` |
| `PM`, `P` | `PM` |
| `NIGHT`, `N` | `NIGHT` |
| `OFF`, `DO`, `RD` | `OFF` |
| `AL` | `AL` |

The built-in leave codes are `HOL`, `MC`, `URG`, `CL`, `UPL`, `PH`, `BCL`, `CCL`, `ML`, and `EML`. `AL` is added to that set during parsing. Any configured `non_working_shift_codes` are also treated as `AL`.

## Input Parsing

`parse_ab_ratio_inputs(...)` sorts nurses by `id` and builds index-based structures used by the solver.

Important derived groups:

| Group | Meaning |
| --- | --- |
| `working_nurses` | Nurses not fully on leave for the period |
| `rank_a`, `rank_b`, `rank_c` | All nurses of each rank |
| `working_ab` | Working rank A or B nurses |
| `working_rank_c` | Working rank C nurses |
| `pattern_nurses` | Nurses with `shift_pattern` of `AM_ONLY` or `PM_ONLY` |
| `managed_working_*` | Working nurses who are not fixed-pattern nurses |
| `ratio_working_*` | Managed working nurses who are also night-eligible |

`NO_NIGHT` is detected either from a nurse-level `no_night` flag or an item in `nurse["constraints"]` whose `constraint_type` or `type` is `NO_NIGHT`.

Fixed shift patterns:

| Pattern | Effect |
| --- | --- |
| `AM_ONLY` | PM and NIGHT are disallowed except leave |
| `PM_ONLY` | AM and NIGHT are disallowed except leave |

Hard requests are enforced if valid. Leave and non-working codes are always converted to leave (`AL`) and recorded for output overlay. Hard work-shift requests that violate `NO_NIGHT` or fixed AM/PM patterns are ignored during parsing.

Soft requests are stored as preferences unless they violate `NO_NIGHT` or fixed AM/PM patterns. Soft request priority is weighted as `pending = 1`, `approved = 5`, with approved forced to remain greater than pending if configuration overrides make it too low.

## Target Calculations

The algorithm does not use demand as strict coverage for all ranks and shifts. It mainly builds ratio and balance targets.

Weekly off targets:

| Nurse type | Weekly target |
| --- | --- |
| Normal managed nurse | `max(round(2 * week_len / 7), fixed_off_days, 1)` |
| `AM_ONLY` / `PM_ONLY` nurse | Off target is based on `max(week_len - 4, fixed_off_days)` and capped by available non-leave days |

Expected work slots are calculated as non-leave days minus expected OFF days.

Default ratio targets:

| Group | Default ratio |
| --- | --- |
| Rank A/B work allocation | AM `3.1`, PM `3`, NIGHT `2` |
| Rank C work allocation | AM `2`, PM `1`, NIGHT `1` |

`_build_ab_targets(...)` converts expected work slots and ratios into integer total targets, then `_distribute_targets(...)` spreads those totals across days.

## Hard Constraints

These constraints are added directly to the CP-SAT model and must hold in a normal solve.

### Assignment Shape

- Every nurse must have exactly one shift code per day: `OFF`, `AM`, `PM`, `NIGHT`, or `AL`.
- Nurses fully on leave for the period are assigned `AL` every day.
- Working nurses cannot be assigned `AL` except on explicit leave/non-working-request days.
- Explicit leave days are assigned `AL`.
- Accepted hard shift requests are assigned exactly.

### Previous Roster Carry-Over

If `prev_last_shift[nurse_id]` is `NIGHT`, the nurse is marked in `post_night_off`.

- For most nurses, day 0 is forced to `OFF` unless day 0 is leave.
- For managed rank A/B nurses, day 0 is not forced off. Instead, the model softly prefers day 0 `NIGHT` to complete a two-night block from the previous roster.
- If a non-managed or pattern nurse has a conflicting hard day-0 assignment and is not on leave, that hard assignment is removed so post-night rest can be enforced.

### Eligibility

- `NO_NIGHT` nurses cannot work `NIGHT`.
- `AM_ONLY` nurses cannot work `PM` or `NIGHT` on non-leave days.
- `PM_ONLY` nurses cannot work `AM` or `NIGHT` on non-leave days.

### Managed Rank A/B And Rank C Rules

For managed, working, non-pattern nurses:

- Night-ineligible nurses must have exactly `0` nights.
- Night-eligible nurses can have at most `4` nights per roster period.
- Night-eligible nurses can have at most `2` nights per 7-day week.
- If the nurse is night-eligible and has no leave days, they must have at least `ab_ratio_min_nights` nights. Default is `2`.
- Each nurse must have at least `4` non-working days, counting `OFF + AL`.
- Weekly `OFF` count must equal the calculated weekly target.
- No three consecutive nights are allowed.
- After a night block ends, the next day must be `OFF` or `AL`.

The minimum-night requirement intentionally excludes nurses with any leave days.

### Fixed Pattern Nurse Rules

For `AM_ONLY` and `PM_ONLY` nurses:

- Weekly count of the preferred shift must equal the calculated preferred target.
- Weekly count of `OFF` must equal the calculated off target.
- Three consecutive `OFF` days are disallowed.

### Rank Night Rules

Rank A night rules:

- Daily rank A night minimum defaults to the rank A night demand for that day.
- Daily rank A night cap defaults to the rank A night demand for that day.
- Default mode is `hard_then_soft`, so the first solve treats the minimum and cap as hard rules.
- If infeasible, the solver may retry with the rank A cap relaxed into a soft over-cap penalty.

Rank B night rules:

- Daily rank B night minimum defaults to the rank B night demand for that day.
- Daily rank B night cap defaults to the rank B night demand for that day.
- Default minimum mode is `hard_then_soft`, so the first solve treats the minimum as hard.
- Over-cap is always modeled as a soft penalty against `cap + allowed_excess`.
- If infeasible, the solver may retry with the rank B minimum relaxed into a soft shortfall penalty.

Rank C night rules:

- Daily rank C night cap defaults to the rank C night demand for that day.
- In the normal solve, the rank C night cap is hard.
- If `_ab_ratio_relax_rank_c_night_cap` is enabled internally, over-cap becomes a soft penalty.

## Soft Constraints And Penalties

Soft constraints are added to the objective with configured weights. The solver can violate them if necessary.

Default weights:

| Penalty | Default |
| --- | ---: |
| `coverage_c_am` | `600000` |
| `coverage_c_pm` | `450000` |
| `coverage_c_night` | `300000` |
| `ratio_am` | `8000` |
| `ratio_pm` | `8000` |
| `ratio_night` | `9000` |
| `daily_ratio_am` | `6000` |
| `daily_ratio_pm` | `6000` |
| `daily_ratio_night` | `8000` |
| `daily_ratio_night_overflow` | `80000` |
| `daily_ratio_night_overflow_tier2` | `110000` |
| `daily_ratio_night_overflow_tier3` | `260000` |
| `daily_total_night_overflow` | `80000` |
| `daily_total_night_overflow_tier2` | `150000` |
| `daily_total_night_overflow_tier3` | `320000` |
| `rn_night` | `100000` |
| `rn_night_over` | `500000` |
| `rank_b_night` | `100000` |
| `rank_b_night_over` | `500000` |
| `rank_c_night_over` | `14000` |
| `isolated_night` | `100000` |
| `double_night_pref` | `120000` |
| `daily_total_shift_balance` | `24000` |
| `daily_total_shift_balance_c` | `10500` |
| `daily_ap_balance` | `18000` |
| `c_ratio_am` | `4000` |
| `c_ratio_pm` | `4200` |
| `c_ratio_night` | `4200` |
| `c_daily_ratio_am` | `3600` |
| `c_daily_ratio_pm` | `5200` |
| `c_daily_ratio_night` | `5200` |
| `soft_request` | `200` |

Weights are capped and scaled by `ab_ratio_weight_cap`, default `1000000`.

### Soft Coverage

Rank C coverage shortfall is only added when `ab_ratio_coverage_mode` is `current`. The default mode is `night_caps_only`, so these C coverage penalties are normally not active.

### Ratio Penalties

- A/B total AM, PM, and NIGHT counts are penalized by deviation from total ratio targets.
- Rank A and rank B daily AM, PM, and NIGHT counts are penalized by deviation from daily targets.
- Rank C total and daily AM, PM, and NIGHT counts are penalized separately using C weights.

Daily night overflow uses tiered penalties:

- Over target by more than `0`.
- Over target by more than `1`.
- Over target by more than `2`.

The same tiering exists for total daily night overflow across rank A, B, and C night-eligible pools.

### Shift Balance Penalties

When `daily_total_shift_balance_enabled` is true, default true:

- For rank A and rank B night-eligible pools, the spread between daily AM/PM/NIGHT totals is penalized when it exceeds `daily_total_shift_gap_target`, default `2`.
- The absolute AM vs PM difference is penalized separately with `daily_ap_balance`.
- Rank C has a similar spread penalty, but no separate AM/PM difference penalty.

### Night Pattern Preferences

- Isolated single nights are penalized for night-eligible managed nurses.
- For managed rank A/B nurses whose previous roster ended in `NIGHT`, day 0 `NIGHT` is preferred; skipping that continuation is penalized by `double_night_pref`.

### Soft Requests

Soft request violations are penalized by:

```text
soft_request weight * request priority weight
```

By default, pending requests cost `200`, approved requests cost `1000`.

## Special Configurations

`milp_config` controls most tunable behavior.

| Config key | Effect |
| --- | --- |
| `ab_ratio_weights` | Dict of direct weight overrides |
| `night_ratio_weight` | Legacy override for `ratio_night` |
| `daily_ratio_night_overflow_weight` | Override tier-1 daily night overflow weight |
| `daily_ratio_night_overflow_tier2_weight` | Override tier-2 daily night overflow weight |
| `daily_ratio_night_overflow_tier3_weight` | Override tier-3 daily night overflow weight |
| `daily_total_night_overflow_weight` | Override total daily night tier-1 overflow weight |
| `daily_total_night_overflow_tier2_weight` | Override total daily night tier-2 overflow weight |
| `daily_total_night_overflow_tier3_weight` | Override total daily night tier-3 overflow weight |
| `soft_request_weight` | Override base soft request weight |
| `coverage_c_weight` | Legacy override for all C coverage weights |
| `coverage_c_am_weight` | Override AM C coverage shortfall weight |
| `coverage_c_pm_weight` | Override PM C coverage shortfall weight |
| `coverage_c_night_weight` | Override NIGHT C coverage shortfall weight |
| `rn_night_weight` | Override rank A night shortfall weight |
| `rn_night_over_weight` | Override rank A night over-cap weight |
| `rank_b_night_weight` | Override rank B night shortfall weight |
| `rank_b_night_over_weight` | Override rank B night over-cap weight |
| `rank_c_night_over_weight` | Override rank C night over-cap weight |
| `isolated_night_weight` | Override isolated night penalty |
| `daily_total_shift_balance_weight` | Override rank A/B daily shift spread weight |
| `daily_total_shift_balance_c_weight` | Override rank C daily shift spread weight |
| `daily_ap_balance_weight` | Override AM vs PM balance weight |
| `c_ratio_am_weight` | Override C total AM ratio weight |
| `c_ratio_pm_weight` | Override C total PM ratio weight |
| `c_ratio_night_weight` | Override C total NIGHT ratio weight |
| `c_daily_ratio_am_weight` | Override C daily AM ratio weight |
| `c_daily_ratio_pm_weight` | Override C daily PM ratio weight |
| `c_daily_ratio_night_weight` | Override C daily NIGHT ratio weight |
| `ab_ratio_weight_cap` | Caps/scales positive weights, default `1000000` |
| `ab_shift_ratio` | Dict override for A/B ratio target, keys `AM`, `PM`, `NIGHT` |
| `c_shift_ratio` | Dict override for rank C ratio target, keys `AM`, `PM`, `NIGHT` |
| `ab_ratio_coverage_mode` | `current` enables C coverage penalties; `night_caps_only` disables them |
| `daily_total_shift_balance_enabled` | Enables/disables daily spread balance, default true |
| `daily_total_shift_gap_target` | Allowed daily spread before balance penalty, default `2` |
| `rn_night_min_per_day` | Rank A daily night minimum target |
| `rn_night_allowed_excess` | Default allowed rank A night overage |
| `rank_a_night_cap_per_day` / `a_night_cap_per_day` | Rank A daily night cap |
| `rank_a_night_allowed_excess` / `a_night_allowed_excess` | Allowed rank A overage when cap is softened |
| `rank_a_night_cap_mode` / `a_night_cap_mode` | `hard`, `hard_then_soft`, or `soft` |
| `rank_b_night_min_per_day` / `b_night_min_per_day` | Rank B daily night minimum target |
| `rank_b_night_cap_per_day` / `b_night_cap_per_day` | Rank B daily night cap |
| `rank_b_night_allowed_excess` / `b_night_allowed_excess` | Allowed rank B overage before over-cap penalty |
| `rank_b_night_min_mode` / `b_night_min_mode` | `hard`, `hard_then_soft`, or `soft` |
| `rank_c_night_cap_per_day` / `c_night_cap_per_day` | Rank C daily night cap |
| `rank_c_night_allowed_excess` / `c_night_allowed_excess` | Allowed rank C overage if cap is relaxed |
| `ab_ratio_min_nights` | Minimum nights for eligible managed nurses with no leave, default `2` |
| `ab_ratio_time_limit_s` | CP-SAT time limit, default `60.0` seconds |

Supported `ab_ratio_coverage_mode` aliases:

| Input | Normalized mode |
| --- | --- |
| `current`, `with_coverage`, `coverage` | `current` |
| `night_caps_only`, `no_coverage`, `ratio_dominant` | `night_caps_only` |

Supported rank night mode aliases:

| Input | Normalized mode |
| --- | --- |
| `hard`, `strict` | `hard` |
| `hard_then_soft`, `strict_then_soft`, `fallback_soft` | `hard_then_soft` |
| `soft`, `penalty_only` | `soft` |

## Internal Relaxation Flags

These keys are used by fallback/diagnostic retry logic, not as normal product-facing configuration:

| Internal flag | Effect |
| --- | --- |
| `_ab_ratio_relax_min_nights` | Removes the per-nurse minimum night rule |
| `_ab_ratio_relax_min_non_working` | Removes the minimum four non-working days rule |
| `_ab_ratio_relax_weekly_off` | Removes exact weekly OFF count rules |
| `_ab_ratio_relax_post_night_rest` | Removes hard post-night rest rules |
| `_ab_ratio_relax_no_three_nights` | Removes no-three-consecutive-nights rule |
| `_ab_ratio_relax_pattern_exact` | Removes exact preferred/OFF counts for pattern nurses |
| `_ab_ratio_relax_rank_night_mins` | Softens rank A/B night minimum handling |
| `_ab_ratio_relax_rank_a_night_cap` | Softens rank A night cap handling |
| `_ab_ratio_relax_rank_b_night_min` | Softens rank B night minimum handling |
| `_ab_ratio_relax_rank_c_night_cap` | Softens rank C night cap handling |
| `_ab_ratio_diag_active` | Marks a retry as diagnostic so it does not recurse into more diagnostics |

If the first solve is infeasible, the algorithm first retries selected `hard_then_soft` rules:

1. Relax rank B night minimum into a soft shortfall penalty.
2. Relax rank A night cap into a soft over-cap penalty.

If still infeasible, it tries one diagnostic relaxation at a time and logs which relaxation makes the model feasible. When only `min_nights` or only `rank_night_mins` fixes infeasibility, it raises a more specific `ABRatioInfeasibilityError`.

## Greedy Warm Start

`_build_greedy_hint(...)` creates a quick sched  ule hint for CP-SAT:

1. Start everyone on `AM`.
2. Pin full-leave nurses, per-day leave, and post-night day-0 OFF.
3. Assign night blocks round-robin up to a calculated night cap.
4. Add OFF after night block endings.
5. Add two OFF days per week, preferring weekends.
6. Convert some AM assignments to PM until PM demand is closer to target.

This hint is not a constraint. It only helps CP-SAT search faster.

## Output Formatting

`_format_output(...)` converts internal shift codes back into labels.

Important output details:

- Leave overlays restore the original leave code labels, such as `MC`, `PH`, or `AL`.
- Every second `OFF` in each nurse schedule is relabeled as `RD`.
- `total_shifts` excludes `OFF`, `RD`, and leave codes.
- Metadata includes `num_days`, `num_nurses`, `algorithm = "AB-RATIO"`, and `penalty_score`.

## Things To Watch

- Demand is not globally enforced as hard coverage for every rank and shift. Rank A/B night minimums/caps and rank C night caps are much stricter than ordinary AM/PM coverage.
- Default `ab_ratio_coverage_mode` is `night_caps_only`, so rank C coverage shortfall penalties are off unless explicitly enabled.
- Nurses with any leave day are excluded from the minimum-night hard rule.
- Fixed-pattern nurses are kept out of night ratio pools and get exact weekly preferred-shift/OFF rules instead.
- Managed rank A/B nurses with previous `NIGHT` are treated specially: the solver prefers another `NIGHT` on day 0 instead of forcing rest, so a two-night block can continue across roster boundaries.
