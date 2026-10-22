# SkillSync: HR-Validated Job Matching Accuracy — Professor Demonstration Protocol

## Research question
How closely do frozen SkillSync candidate–job match scores agree with independent, structured human assessments of **job-related qualifications**? Workplace preferences and interpersonal observations are separate and are not encoded as an automatic Culture Fit score.

## Collecting evidence
1. Obtain written permission/consent or use fully synthetic examples. Store anonymized candidate IDs, not real email/phone, government ID, or personal names. Do not collect protected characteristics, personality inferences, or sensitive interview notes in the benchmark.
2. Freeze each **candidate resume snapshot**, target job requirements, system version, and **authoritative score** before HR reviews. Do not let HR view the system's score when rating.
3. At least **two independent HR evaluators** assess each candidate–job pair with the same `RUBRIC_CRITERIA` from `src/services/evaluation/rubricEngine.js` (six criteria scored 0–4). This allows a comparable 0–100 HR qualification reference. Do not treat the existing one-person 1–5 interview stars as the 6-criterion benchmark reference.
4. Record mandatory qualification status based on specific published job requirements. `INSUFFICIENT_EVIDENCE` is not equivalent to a demonstrated lack of a license or credential. A mandatory gate must be evidence-based.
5. When reviewers differ by more than 15 points or give opposing decisions, obtain documented independent adjudication. Unresolved disagreements must not count as ground truth.
6. Separate candidate identities into `CALIBRATION` and `HELD_OUT_VALIDATION` so the same candidate cannot appear in both. Lock weights/thresholds before evaluating on the held-out split.
7. Capture broad job families where possible (healthcare, accounting, IT, trades, admin, etc.). Report the sample size for each family. Do not make definitive claims for a category with very few pairs.
8. Run `node scripts/run_hr_fit_validation.mjs <benchmark-file.json>` to report precision, recall, F1, MAE, RMSE, disagreement case IDs, exclusions, and provenance. The script does no network/database operations.

## Data rules
A benchmark file is a JSON array in the existing validated `benchmarkSchema.js` format, including:
- `case_id`, `provenance.source_type`, `provenance.license_or_consent`, `validation_split`
- `job_posting` with job ID, category, explicit requirements and description
- anonymized candidate profile and frozen resume evidence
- `system_baseline.skillsync_score` recorded from the authoritative matcher **before** HR evaluation
- `evaluations` from distinct evaluators with six `criteria_scores`, `overall_fit_percentage`, and recommendation
- `adjudication.is_adjudicated` and `adjudication.reference_score`
- `mandatory_gating_status`

Only `authorized_candidate_case` records can contribute to *genuine* held-out validation metrics. `synthetic_fixture` cases can demonstrate functionality but never provide real-world accuracy evidence.

## Interpretation
- **Precision**: Of candidates the system scores at least 70, what fraction HR also qualifies under the benchmark rubric?
- **Recall**: Of candidates HR qualifies, what fraction did the system rate at least 70?
- **F1**: Balance of precision and recall. Missing denominators are `N/A`, not 0%.
- **MAE/RMSE**: Difference between system percentage and comparable HR qualification percentage, not probability of hiring.
- **False positive/negative** flags point to candidate–job pairs for review. Confirm whether mismatches stem from missing mandatory credentials, insufficient resume text, role relevance, or evaluator disagreement before changing any scoring rules.

## Workplace alignment
For a future opt-in extension, compare **explicit** candidate and job requirements such as work setup, shift schedule, and travel. Missing candidate preferences yield **Not assessed**, never assumed compatibility. A potential conflict yields **Needs discussion**, not automatic rejection. Avoid personality/culture labels, sensitive traits, and vague “would fit in here” assumptions. Communication can be rated using structured job-related evidence without making it a recruitment gate unless justified by the role.

## Demo sequence
- Show an existing authoritative Job Match and its evidence.
- Open the Employer Private Recruiter Evaluation modal. The separate 1–5 role-rating starts blank (not prefilled 5/5). Review signals update as HR enters a rating.
- Show the independent communication rating and the work-alignment **Not assessed** state.
- Save via the existing employer-owned private evaluation RPC. Confirm the stored system match remains unchanged.
- Run the read-only benchmark report on synthetic fixture data; highlight that synthetic results do **not** establish accuracy.
- Explain the consented, double-reviewed held-out workflow needed before making a real-world accuracy claim.
