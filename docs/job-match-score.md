# Job Match Score

Candidate and employer application views use the same server-owned score and saved calculation evidence. The interface shows one overall percentage and an expandable visual breakdown.

## Visual breakdown

Each criterion appears in a card with an icon, whole contribution points, a short evidence summary, and found/missing skill chips where available. Unspecified requirements use a **Default rule** label, rather than implying verified qualification evidence. Excluded criteria say **Not counted**. No weight percentages, per-criterion percentages, long formulas, or decimal contribution points appear in the interface.

The total strip adds the displayed contributions. To avoid rounding discrepancies, the presentation floors each exact contribution and distributes the remaining points to the largest fractional contributions until their sum equals the authoritative rounded score. For example, exact contributions of 26.25, 13.125, 18.75, and 18.75 appear as 26 + 13 + 19 + 19 = 77. A short note explains that whole displayed points are adjusted to add up and the underlying calculation keeps full precision.

This is a display change. It does not change factor weights, canonical scores, eligibility, application snapshots, or historical evidence. The engine uses required skills, transferable skills, education, experience, and optional certifications and resume/job context. It does not use a four-factor 50/25/15/10 rubric.

## Data contract

`compute_and_save_job_match` saves score and calculation evidence together. Application insertion freezes this result in the snapshot, and later updates preserve it. Both roles resolve the saved application result before any newer match. A current match can request missing evidence from the server; an earlier application's missing evidence cannot be reconstructed from a newer resume.

Whole points are presentation-only. The complete versioned calculation, original precision, evidence inputs, timestamp, and internal applicable weights remain stored for audit. Human HR evaluation remains independent of the job-alignment score.

## Verification

The evidence suite runs the real SQL migration in isolated PGlite with synthetic fixtures. It checks unchanged scoring, calculation persistence, optional factors, aliases, immutable snapshots, forged-input rejection, and candidate/employer parity. Shared React rendering checks a single percentage, visual cards, whole-point labels that reconcile to the score, explicit baseline/exclusion states, loading/error/legacy states, and escaped evidence text.

`docs/job-match-score-preview.html` renders the actual component with illustrative software-role data. It contains no real accounts, deployment identifiers, or database results.
