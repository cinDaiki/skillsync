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

The migration `20261022124540_explainable_job_match_score.sql` is prepared but has NOT been applied to any remote database. It requires the existing candidate source and connected recruitment migrations. Apply only to verified staging `zjzymrpifutqubffvhyt`. Never apply it to production `blekdvuovbfpuaepjvfq` as part of this work. The migration retains existing authentication and employer/candidate eligibility guards and grants no new client write access.

Vercel environment metadata access still returns HTTP 403 for team `cindaikis-projects`. The available tool advises team authorization, but no team-authorization tool is exposed in this session. The app's source includes a preview isolation guard; deployed build-time configuration and runtime routing have not been independently verified. No staging application writes or production database requests were performed.

## Validation

- `npm test`: existing regression suites, HR validation, plus the new evidence integration suite.
- `node tests/phase6ConnectedRecruitment.test.mjs`: connected status/preference contracts.
- `npm run build`: Vite production build.
- New integration suite executes the real migration and canonical scoring helpers in isolated PGlite PostgreSQL with synthetic data. It checks unchanged overall scoring, normalized contributions, optional factors, aliases, saved/returned evidence equality, forged-input rejection, immutable snapshots, both resume-source labels, legacy states, and shared React markup with exactly one percentage.
- Auth/eligibility and career-relevance integrations are local test stubs. The vector distance operator has a scalar test stand-in. These tests do not establish Supabase RLS, embedding quality, remote auth, or live end-to-end behavior.
- `docs/job-match-score-preview.html` is a static rendering of the actual component using synthetic SQL test data, not a live deployment screenshot. Cloud Browser disallowed opening local `file:` URLs, so visual browser verification remains pending. No workaround was attempted.

Before release: verify staging runtime routing, apply the migration there, then sign in with dedicated staging Job Seeker and Employer accounts. Exercise upload and builder matching, submit an application, compare score/evidence on both roles, edit the resume, recalculate the current match, and confirm that submitted evidence stays unchanged. Check mobile layout, keyboard expansion, console/network errors, and actual persisted JSON. Do not merge or promote to production as part of staging verification.
