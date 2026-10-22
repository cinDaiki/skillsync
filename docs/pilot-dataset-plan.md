# SkillSync Stage 1 HR Pilot Dataset Plan

**Target Dataset Size:** 30 Authorized, Anonymized Resume-Job Pairs  
**Target Roles:** Frontend Engineering (10), Backend Engineering (10), Cloud DevOps (10)  
**Status:** Operational Plan Approved — Awaiting Evaluator Session Scheduling  
**Target Splits:** Calibration (18 pairs / 60%), Held-Out Validation (12 pairs / 40%)  

---

## 1. Scope & Objective

The Stage 1 HR Pilot is designed to gather the first empirical ground-truth benchmark dataset ($H_i$) rated independently by professional technical recruiters.

### Current Repository Status:
- **Genuine HR Records Present Today**: **0**
- **Synthetic Test Fixtures**: **10** (clearly segregated in `benchmark/fixtures/synthetic_benchmark_dataset.json`)
- **Blocker**: Until participating recruiters complete ratings using the collection toolkit, the genuine benchmark dataset remains unpopulated. No synthetic scores will be substituted for human ground truth.

---

## 2. Requisition Selection & Quality Control

To ensure high-quality, balanced benchmarking, 30 distinct resume-job evaluation pairs will be collected across 3 critical disciplines:

| Target Category | Requisition Types | Seniority Distribution | Target Volume |
| :--- | :--- | :--- | :---: |
| **Frontend Engineering** | React / TypeScript, Next.js, UI Architecture | Junior (2), Mid (5), Senior/Lead (3) | **10 Pairs** |
| **Backend Engineering** | Go, Node.js, Python/Django, Distributed Systems | Junior (2), Mid (5), Senior/Lead (3) | **10 Pairs** |
| **Cloud DevOps / SRE** | AWS, Terraform, Kubernetes, CI/CD Automation | Junior (2), Mid (5), Senior/Lead (3) | **10 Pairs** |

### Consistency Checking for Job Descriptions:
Before matching resumes against requisitions, the benchmark coordinator must verify:
1. Requisitions have clear, non-conflicting mandatory requirements (maximum 3–5 mandatory items).
2. Preferred qualifications are explicitly labeled as "Preferred" or "Plus" to prevent requirement creep.
3. Realistic tenure requirements matching the stated seniority level.

---

## 3. Evaluator Assignment & Double-Blind Protocol

- **Pool**: 4 experienced technical recruiters (minimum 2 years in tech recruiting).
- **Assignment**: Each case is assigned to **2 distinct evaluators** randomly paired from the pool.
- **Double-Blind Isolation**:
  - Evaluators receive the job description and scrubbed resume text.
  - Evaluators **cannot see** SkillSync's calculated percentage or ATS score.
  - Evaluators **cannot see** each other's scorecards until both have submitted.
- **Criterion Rating**: Evaluators score all 6 rubric dimensions and classify each mandatory requirement as `MET`, `NOT_MET`, or `UNKNOWN`.

---

## 4. Disagreement Resolution & Adjudication Rules

1. **Consensus**:
   If $|R_1 - R_2| \le 15.0\%$ and recommendations align, the authoritative ground truth is the arithmetic average:
   $$H_i = \frac{R_1 + R_2}{2}$$
2. **Adjudication Trigger**:
   If $|R_1 - R_2| > 15.0\%$ or recommendations conflict (`REJECT` vs `ACCEPTABLE`), the case escalates to a Senior HR Adjudicator.
3. **Binding Decision**:
   The adjudicator reviews both scorecards, checks the documentary citations, and submits a binding reference rating ($H_i$) with an audit trail note.

---

## 5. Partitioning & Data Leakage Prevention

The 30 benchmark pairs will be partitioned into two distinct splits:
- **Calibration Split (60% — 18 cases)**: Used in Phase 5 to analyze error modes, test weight adjustments, and experiment with scoring rules.
- **Held-Out Validation Split (40% — 12 cases)**: Strictly quarantined to validate final algorithm performance on unseen data.

### Candidate-Level Isolation Rule:
If a candidate has multiple applications or resume variants in the dataset, **all records for that candidate ID must be assigned strictly to either Calibration or Held-Out Validation**. Cross-split overlap is strictly prohibited and enforced by automated tests.

---

## 6. Known Sample Size Limitations

While 30 cases provide a sound exploratory pilot for engineering disciplines, the team acknowledges:
- **Domain Specificity**: 30 software engineering cases do not establish statistical reliability for non-engineering disciplines (e.g. Sales, Marketing, Healthcare).
- **Statistical Power**: To establish tight 95% confidence intervals across all seniority levels, an expanded dataset of 120+ pairs will be required following the pilot.
- **Actionable Objective**: The pilot will determine whether the observed mandatory-gating mismatch is confirmed by real recruiters, providing empirical evidence before modifying production code.
