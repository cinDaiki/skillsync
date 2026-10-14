# SkillSync Phase 4 — Baseline Job-Fit Accuracy Evaluation Report

**Version:** 1.0.0 (Baseline Measurement Report)  
**Status:** Evaluation Harness Complete — Blocked on Genuine HR Benchmark Data  
**Branch:** `feature/job-fit-baseline-evaluation`  
**Base Phase 3 Commit:** `cfe801e9275b7f57bfe9b1dfe5a6d9cc14795672`  
**Author:** SkillSync Talent Science & Evaluation Working Group  

---

## Executive Summary

Phase 4 establishes the authoritative baseline measurement harness for comparing SkillSync's production job-matching scores ($S_i$) against independent HR reference ratings ($H_i$).

### Key Findings:
1. **Authoritative Scoring Implementation**: Traceable to migration [`20261004000000_fix_compute_and_save_job_match_canonical.sql`](file:///d:/SkillSync/supabase/migrations/20261004000000_fix_compute_and_save_job_match_canonical.sql) implementing a dynamic requirement-aware 6-factor model.
2. **Current Benchmark Readiness**: The repository contains **10 synthetic test fixtures** and **0 genuine HR-reviewed cases**. In accordance with **Rule 1**, synthetic fixtures validate the evaluation tooling and pipeline machinery, but **must never be represented as proof of actual system accuracy against human recruiters**.
3. **Mandatory Qualification Gating Divergence (Rule 3)**: On compliant profiles where candidates possess all mandatory requirements, the current system aligns closely with HR expectations ($\mathrm{MAE} \approx 4.43\%$, $100\%$ within $\pm 10\%$). However, when a candidate demonstrably lacks a mandatory qualification (e.g. active security certification or native platform language), the HR rubric strictly caps scores at $\le 35\%$, whereas SkillSync's existing weighted formula merely deducts partial points, resulting in large divergence ($\mathrm{MAE} \approx 26.67\%$).
4. **Phase 5 Recommendation**: Proceeding to Phase 5 (Scoring Calibration) is **NOT justified** at this time. Calibrating algorithm weights against synthetic fixtures would risk severe overfitting and invalidate future HR claims. The team must first execute the **Stage 1 HR Pilot** to collect genuine double-blind HR ratings.

---

## 1. Baseline Scoring Implementation & Version Traceability

The authoritative calculation is executed via the canonical PostgreSQL database RPC:
- **Canonical RPC**: `public.compute_and_save_job_match(p_job_id UUID)`
- **Defining Migration**: `supabase/migrations/20261004000000_fix_compute_and_save_job_match_canonical.sql`
- **Owner**: `postgres`, executable by `authenticated` and `service_role`.

### 1.1 Factor Breakdown & Dynamic Weight Normalization
$$\text{Score} = \text{round}\left( \frac{\sum_{i=1}^{6} W_i \times S_i}{\sum_{i=1}^{6} W_i} \right)$$

| Factor | Description | Standard Weight ($W_i$) | Dynamic Conditions |
| :--- | :--- | :---: | :--- |
| **Factor 1: Required Skills** | Explicit skills match via centralized normalization | **35%** ($0.35$) | Static |
| **Factor 2: Transferable Skills** | Curated soft/transferable competency overlap | **15%** ($0.15$) | Static |
| **Factor 3: Education Compatibility** | Degree level, field, and course compatibility | **15%** ($0.15$) | Static |
| **Factor 4: Experience Compatibility** | Tenure against `jobs.experience_required` | **15%** ($0.15$) | Static |
| **Factor 5: Credentials** | Domain certifications & licenses | **0%** ($0.00$) | Shifts to **10%** ($0.10$) when `required_certifications` are explicitly required by employer |
| **Factor 6: Semantic Relevance** | Cosine similarity of embedding vectors | **0%** ($0.00$) | Shifts to **20%** ($0.20$) when resume & job embeddings exist |

### 1.2 Database Side Effect & Isolation Rules
- **Side Effect**: `compute_and_save_job_match` mutates `public.job_matches` (`INSERT ... ON CONFLICT (user_id, job_id) DO UPDATE`).
- **Production Guard**: Benchmark evaluations must never target production. The harness enforces that RPC executions run exclusively against isolated local development databases (`127.0.0.1`) or staging preview projects.

---

## 2. Benchmark Dataset & Provenance Breakdown

All benchmark cases were validated using the Phase 3 schema and leakage guard ([`benchmarkSchema.js`](file:///d:/SkillSync/src/services/evaluation/benchmarkSchema.js)):

| Metric / Attribute | Count | Percentage | Provenance / Notes |
| :--- | :---: | :---: | :--- |
| **Total Cases in Repository** | **10** | 100.0% | Multi-category benchmark dataset fixture |
| **Genuine HR-Reviewed Cases** | **0** | **0.0%** | **Not yet collected** |
| **Synthetic Test Fixtures** | **10** | **100.0%** | `source_type: "synthetic_fixture"` (CC0-Synthetic) |
| **Calibration Split Cases** | 6 | 60.0% | Candidate IDs isolated (`CAND-SYNTH-001` to `006`) |
| **Held-Out Validation Cases** | 4 | 40.0% | Candidate IDs isolated (`CAND-SYNTH-007` to `010`) |
| **Cross-Split Data Leakage** | **0** | **0.0%** | **Zero candidate profile ID overlap** |
| **Eligible Comparisons** | 10 | 100.0% | All cases have complete evaluator scorecards |
| **Excluded Cases** | 0 | 0.0% | No incomplete records in fixture file |

---

## 3. Evaluator Reliability & Adjudication Breakdown

Before evaluating system performance, the benchmark protocol assesses agreement between the human evaluators:

| Category | Cases | Avg Inter-Rater Difference ($|R_1 - R_2|$) | Consensus Rate | Adjudication Triggers |
| :--- | :---: | :---: | :---: | :---: |
| **All Benchmark Cases** | 10 | **3.6 percentage points** | 90% (9/10) | 1 Case (BENCH-SYNTH-002) |
| **Consensus Cases** | 9 | 2.9 percentage points | 100% | None |
| **Adjudicated Cases** | 1 | 6.0 percentage points | N/A | Divergent recommendation (`BORDERLINE` vs `REJECT`) |

- **Adjudication Traceability**: Case `BENCH-SYNTH-002` (Mid-level Go Developer applying for Senior Go role) triggered adjudication due to opposing evaluator recommendations (`BORDERLINE` 53% vs `REJECT` 47%). Senior HR adjudicated the final reference score to $50\%$ with explicit audit rationale.

---

## 4. Benchmark Accuracy Analysis (Synthetic Pilot Evaluation)

> [!WARNING]
> **Mandatory Disclaimer (Rule 1)**: The metrics below reflect execution of the evaluation harness on synthetic fixtures. They demonstrate the correctness of the metric calculations and pipeline machinery, but **do not represent validated accuracy against actual hiring managers**.

### 4.1 Comparative Baseline Summary

$$\mathrm{MAE} = \frac{1}{n}\sum_{i=1}^{n}|S_i - H_i| \qquad \mathrm{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(S_i - H_i)^2}$$

| Cohort | Sample Size ($n$) | MAE (% pts) | RMSE (% pts) | Acc $\le \pm 5\%$ | Acc $\le \pm 10\%$ | Acc $\le \pm 15\%$ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **All Fixture Cases** | 10 | 11.10% | 15.31% | 60.0% | 70.0% | 70.0% |
| **Compliant Profiles** *(Rule 3 Separation)* | 7 | **4.43%** | **5.04%** | **71.4%** | **100.0%** | **100.0%** |
| **Mandatory Gated Failures** *(Rule 3 Separation)* | 3 | **26.67%** | **27.31%** | **0.0%** | **0.0%** | **0.0%** |

---

## 5. Breakdown of Error Patterns & Qualitative Root Causes

Separating compliant candidate cases from mandatory qualification gating failures reveals two distinct operational behaviors:

### 5.1 Pattern A: High Agreement on Compliant Profiles ($\mathrm{MAE} \approx 4.4\%$)
When candidates satisfy mandatory thresholds:
- `BENCH-SYNTH-001` (Senior Frontend): System 82%, HR 88% ($\Delta -6\%$)
- `BENCH-SYNTH-003` (Cloud DevOps): System 80%, HR 85% ($\Delta -5\%$)
- `BENCH-SYNTH-005` (Full Stack Engineer): System 78%, HR 79% ($\Delta -1\%$)
- `BENCH-SYNTH-007` (Staff Frontend Lead): System 90%, HR 94% ($\Delta -4\%$)
- `BENCH-SYNTH-008` (Python Backend): System 80%, HR 83% ($\Delta -3\%$)
- `BENCH-SYNTH-010` (Senior Data Platform): System 85%, HR 89% ($\Delta -4\%$)

**Diagnosis**: The weighted 6-factor model tracks human recruiters remarkably well on candidates whose core qualifications match the job level. The system tends to be slightly more conservative than human evaluators by approximately 3 to 6 percentage points.

### 5.2 Pattern B: Failure to Enforce Hard Gating on Mandatory Requirements ($\mathrm{MAE} \approx 26.7\%$)
When candidates demonstrably lack a non-negotiable mandatory qualification:
- `BENCH-SYNTH-004` (Data Analyst applying for ML Engineer): System awarded 55% based on transferable Python/SQL skills; HR rubric capped score at 30% (`REJECT`) because candidate lacked deep learning frameworks.
- `BENCH-SYNTH-006` (IT Support applying for SOC Analyst): System awarded 65%; HR rubric capped score at 33% (`REJECT`) because the job mandated Security+/CEH/CISSP certification, which the candidate demonstrably lacked.
- `BENCH-SYNTH-009` (React Native dev applying for Senior iOS): System awarded 50%; HR rubric capped score at 26% (`REJECT`) because the role mandated native Swift/SwiftUI.

**Diagnosis**: The production database RPC currently calculates match percentages using a weighted average. When a candidate meets secondary or transferable factors (e.g. good education, general communication skills, adjacent programming tools), those points dilute the penalty for missing a mandatory requirement. Human recruiters, conversely, treat mandatory requirements as hard gates.

---

## 6. Known Statistical & Dataset Limitations

1. **Synthetic Nature of Existing Data**: The current 10 cases are synthetic fixtures. Real hiring managers possess nuanced domain heuristics (e.g., assessing company prestige, progression velocity, project impact) that synthetic examples only approximate.
2. **Small Pilot Sample Size ($n = 10$)**: Statistical claims cannot be generalized from 10 cases. An evaluation dataset must contain at least 30 cases per stratum (seniority $\times$ job category) to produce statistically valid confidence intervals.
3. **Local DB Hotfix Pending**: Migration `20261004000000` is present in source control, but has not yet been applied to the local developer container.

---

## 7. Go/No-Go Decision for Phase 5 (Scoring Calibration)

### **Decision: NO-GO on Phase 5 Calibration at this time**

**Rationale**:
- Proceeding to Phase 5 to re-tune weights ($W_i$) against synthetic fixtures would be mathematically irresponsible. It would optimize the algorithm against synthetic fixtures rather than genuine human hiring decisions.
- The baseline study has identified a clear architectural insight: **the primary source of large divergence is not weight miscalibration, but the absence of mandatory qualification gating in the database RPC**.

### Next Immediate Steps:
1. **Stage 1 HR Pilot Data Collection**: Collect 30 genuine, authorized resume-job evaluations across Frontend, Backend, and DevOps disciplines from at least two independent technical recruiters.
2. **Mandatory Gating RFC**: Draft a proposal to add explicit mandatory qualification gating to the server-authoritative RPC so that candidates demonstrably lacking mandatory requirements are capped appropriately.
3. **Phase 5 Initiation**: Begin Phase 5 calibration only after the 30-case genuine HR pilot dataset is committed and validated.
