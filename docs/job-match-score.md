# Job Match Score

The employer resume viewer used a skills-only intersection percentage (including a 100 fallback when no requirements were listed) while other views used the authoritative six-factor score. The shared Job Match Score component now presents the authoritative result and its calculation evidence on both sides. There is no new scoring rubric and no change to hiring decisions or independent HR evaluations.

## What the user sees

One overall percentage, an expandable "How this score was calculated" section, criterion contribution points out of available points, matched/missing evidence, data sources, date, and scoring version. Weights and criterion percentages are not displayed. Compatibility rule results are expressed out of 100, so the conversion to contribution points can be reproduced.

The existing canonical engine uses required skills, transferable skills, education, experience, and optional certifications and resume/job context. Maximum contribution points are normalized over applicable factors. Certification requirements absent from a job and missing embeddings are excluded. Original education/experience baseline rules remain unchanged and are disclosed in the evidence; full compatibility is not represented as verified proof of qualification.

For each included criterion:

```
available points = 100 × internal factor weight / sum of applicable weights
contribution = recorded criterion compatibility × available points / 100
Job Match Score = PostgreSQL-rounded sum of contributions
```

Each displayed contribution is rounded to two decimal places, independently. The server score is authoritative, including floating point half-way rounding. The sample mockup's 50/25/15/10 weights are not used.

## Data flow and historical consistency

`compute_and_save_job_match` calculates and stores `job_matches.match_calculation` in the same upsert as `match_score`. The JSON includes a scoring version, timestamp, candidate/job IDs, actual factor results and denominator, matched/missing skills and certifications, education and experience inputs, and embedding availability/similarity. Candidate evidence is extracted/structured data, not invented verbatim resume quotations or document page citations.

On application INSERT, the existing server trigger discards client-authored score claims and freezes the score and matching calculation into `applicant_snapshot`. A before-UPDATE trigger retains those saved score fields during stage changes and client snapshot refreshes. Both roles use `readJobMatchEvidence`, which prefers the application snapshot over a later match row. Legacy applications without a frozen score can show the latest authoritative record, explicitly labelled as current.

Old application scores without calculation evidence are not backfilled from current data. The UI states that historical evidence was not saved. Recalculate can create evidence for the current match, but cannot rewrite an earlier application.

## Rollout status

Implemented on `feature/explainable-job-match-score`, based on `feature/candidate-resume-builder` at `ffe9b7e99e3169da9e043e7e9b279a858ba02293`.

The staging runtime was verified in the browser: preview deployment `5cc4d4e` reports backend `https://zjzymrpifutqubffvhyt.supabase.co`. Only after that check, `connected_recruitment` and `explainable_job_match_score` were applied to staging. Production was not queried, migrated, merged, or promoted.

The candidate details and improvement panels always show the overall score, including while evidence loads. Legacy current matches fetch server evidence and calculate it once when absent. Historical application evidence remains immutable and is never reconstructed from current resume data.

A live regression after switching resume sources exposed a stale marketplace card: details refreshed to 77 but Apply still checked 68. The eligibility response now updates the card cache and Apply prefers the selected job's refreshed authoritative score. Recalculate retains the calculation and existing career relevance fields.

## Staging verification on October 22, 2026

- Candidate sign-in and email verification succeeded with the dedicated QA account.
- Junior Web Developer: built resume displayed 37; expanded evidence totaled 36.89 points. Switching to the existing uploaded resume displayed 33, totaling 32.56 points. Both matched saved database score and versioned evidence. Original built source was restored and verified in the database.
- Resume Builder review and preview rendered; Word download was a valid 9,800-byte DOCX with no ZIP integrity errors. Existing upload screen and extracted skills rendered. A fresh upload/parse has not yet been exercised in this run.
- Actual authenticated database RPC transaction: application → shortlist → online invitation → candidate acceptance (`CONFIRMED`) → one evaluation → `hired`. Saved score was 77 and versioned evidence remained unchanged. The complete transaction was rolled back; application and resume counts remained 2 each.
- Candidate console: extension-origin metadata errors and a Transformers content-length buffer warning; no application-origin exception observed in these checks. This does not establish every screen is error-free.
- Security advisor counts matched the pre-migration baseline (7 mutable search-path warnings, 16 anon definer warnings, 56 authenticated definer warnings, and existing platform configuration notices). No broad privilege changes were made.
- Employer browser sign-in, fresh upload parsing, and the complete browser recruitment workflow remain pending. Database-role workflow success is not a claim of browser end-to-end completion.

## Validation

- `npm test`: existing regression suites, HR validation, plus the new evidence integration suite.
- `node tests/phase6ConnectedRecruitment.test.mjs`: connected status/preference contracts.
- `npm run build`: Vite production build.
- New integration suite executes the real migration and canonical scoring helpers in isolated PGlite PostgreSQL with synthetic data. It checks unchanged overall scoring, normalized contributions, optional factors, aliases, saved/returned evidence equality, forged-input rejection, immutable snapshots, both resume-source labels, legacy states, and shared React markup with exactly one percentage.
- Auth/eligibility and career-relevance integrations are local test stubs. The vector distance operator has a scalar test stand-in. These tests do not establish Supabase RLS, embedding quality, remote auth, or live end-to-end behavior.
- `docs/job-match-score-preview.html` is a synthetic static rendering. Live candidate visual verification and an expanded-score screenshot were subsequently captured on staging.

Before release: finish the pending browser checks, compare submitted score/evidence on both roles, and test mobile layout. Do not merge or promote to production as part of staging verification.
