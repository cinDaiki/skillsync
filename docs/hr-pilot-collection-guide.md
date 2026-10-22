# SkillSync Stage 1 HR Pilot Collection Guide

**Target Scope:** 30 Double-Blind Evaluated Resume-Job Pairs  
**Disciplines:** Frontend Engineering, Backend Engineering, Cloud DevOps  
**Target Raters:** Minimum 2 Independent Senior Technical Recruiters per Case  
**Confidentiality:** Strict PII Exclusion — Zero Candidate Contact Details in Repository  

---

## 1. Objective of the Pilot

The goal of this pilot is to collect the first **genuine, human-adjudicated benchmark dataset** ($H_i$) against which SkillSync's matching algorithm can be compared.

### Strict Blind Protocol:
- **Zero Algorithmic Bias**: Evaluators must **never** see SkillSync's calculated percentage ($S_i$), sub-scores, or ATS reports before or during evaluation.
- **Rater Independence**: Evaluator 1 and Evaluator 2 assess each case in complete isolation. Neither rater can view the other's scores or comments until both have formally submitted.

---

## 2. Evaluator Onboarding & Calibration Session

Before rating live benchmark cases, each participating recruiter must complete a **Calibration Workshop**:
1. Review the standardized 6-factor rubric in [`docs/hr-evaluation-rubric.md`](file:///d:/SkillSync/docs/hr-evaluation-rubric.md).
2. Practice evaluating 2 synthetic reference cases.
3. Compare practice scorecards with the benchmark lead until rater variance is $\le 10\%$.

---

## 3. Step-by-Step Evaluation Workflow

For each assigned benchmark case:

### Step 1: Review the Job Requisition
- Read the job title, seniority level, department, and full description.
- Identify:
  - **Mandatory Requirements**: Non-negotiable prerequisites (must-have skills, required licenses, minimum years).
  - **Preferred Qualifications**: Nice-to-have tools or desirable background (plus factors).

### Step 2: Review Candidate Resume
- Read the anonymized candidate resume.
- Locate documentary evidence: job titles, dates, company domains, project bullets, code repositories, degrees, licenses.

### Step 3: Rate the 6 Rubric Criteria (0 to 4 Scale)
Assign a score from 0 to 4 for each criterion using the defined behavioral anchors:
1. `REQ_SKILLS` (30%): Required Skills & Core Competencies
2. `EXP_RELEVANCE` (25%): Relevant Work Experience & Seniority
3. `EVIDENCE_ACHIEVE` (15%): Job-Related Evidence & Quantified Achievements
4. `TRANS_SKILLS` (15%): Transferable Skills & Cross-Stack Agility
5. `EDU_QUAL` (10%): Education & Technical Qualifications
6. `CERTS_CRED` (5%): Certifications & Domain Credentials

*Requirement: For every score, cite specific text from the resume in the `criteria_evidence` field.*

### Step 4: Classify Mandatory Requirements (`MET`, `NOT_MET`, `UNKNOWN`)
For each mandatory requirement specified in the job posting:
- **`MET`**: Positive documentary evidence confirms requirement.
- **`NOT_MET`**: Explicit documentary evidence confirms the candidate fails the requirement.
- **`UNKNOWN`**: Requirement is not mentioned in the resume. *(Do NOT assume failure!)*

### Step 5: Assign Recommendation & Summary
- Choose overall recommendation: `STRONG_MATCH` ($\ge 85\%$), `ACCEPTABLE_MATCH` ($70\% - 84\%$), `BORDERLINE` ($55\% - 69\%$), or `REJECT` ($< 55\%$).
- Provide a 2–3 sentence executive summary explaining your rationale.

---

## 4. Disagreement & Adjudication Protocol

When both evaluators submit scorecards:
1. **Automated Agreement Check**:
   The system calculates the rater difference $|R_1 - R_2|$.
2. **Consensus Resolution**:
   If $|R_1 - R_2| \le 15.0\%$ and both raters recommend the same hiring tier, the authoritative reference score is:
   $$H_i = \frac{R_1 + R_2}{2}$$
3. **Adjudication Escalation**:
   Adjudication is automatically triggered if:
   - Score difference $> 15.0$ percentage points.
   - Evaluators have conflicting recommendations (e.g. `ACCEPTABLE_MATCH` vs `REJECT`).
   - One evaluator marks a mandatory requirement as `NOT_MET` while the other marks it as `MET`.
4. **Adjudication Outcome**:
   A Senior HR Adjudicator reviews both scorecards, inspects the disputed resume text, and determines a binding reference score $H_i$ with an audit trail note.

---

## 5. Candidate Privacy, Authorization & Retention Checklist

To comply with data privacy standards and repository safety:
- [ ] **Candidate Authorization**: Every resume evaluated must be covered by a signed data-sharing and evaluation consent form (`license_or_consent: "Candidate-Consent-Signed-2026"`).
- [ ] **PII Scrubbing**:
  - [ ] Candidate personal names replaced with anonymized IDs (`CAND-AUTH-001`).
  - [ ] Real email addresses removed; replace with `@example.com` synthetic domain.
  - [ ] Phone numbers removed.
  - [ ] Street addresses removed (retain city/state/country only for location matching).
  - [ ] LinkedIn, GitHub, or portfolio URLs replaced with generic place-markers (e.g., `https://github.com/example-profile`).
- [ ] **Public Remote Guard**: Real candidate resumes and personal notes must **NEVER** be committed to public GitHub remotes.

---

## 6. Pilot Completion Checklist (Per Case)

Before marking a case complete:
- [ ] Evaluator 1 scorecard complete (all 6 criteria rated + text evidence cited).
- [ ] Evaluator 2 scorecard complete (all 6 criteria rated + text evidence cited).
- [ ] Mandatory qualification status recorded for each rater.
- [ ] Inter-rater divergence analyzed.
- [ ] Adjudication completed if divergence $> 15\%$.
- [ ] Benchmark case validated against `benchmarkSchema.js` (0 errors).
- [ ] Assigned strictly to `CALIBRATION` (60%) or `HELD_OUT_VALIDATION` (40%) split without cross-split leakage.
