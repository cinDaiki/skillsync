import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readJobMatchEvidence, explainJobMatch, MATCH_CALCULATION_VERSION } from '../src/services/jobMatchEvidence.js';
import { readAuthoritativeJobMatch } from '../src/services/evaluation/hrFitValidation.js';

// Isolated in-memory PostgreSQL. No network, credentials or remote Supabase access.
// Identity/eligibility and career relevance are boundary stubs. Embedding distance
// uses a scalar stand-in; vector math itself is unchanged and is not tested here.
const db = new PGlite();
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const candidate = '11111111-1111-4111-8111-111111111111';
const employer = '22222222-2222-4222-8222-222222222222';
const job = '33333333-3333-4333-8333-333333333333';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.is_candidate_active(uuid) returns boolean language sql as $$ select true $$;
    create function public.is_employer_job_eligible(uuid) returns boolean language sql as $$ select true $$;
    create function public.compute_and_save_career_relevance(uuid,uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create function public.test_distance(double precision,double precision) returns double precision language sql as $$ select abs($1-$2) $$;
    create operator <=> (leftarg=double precision,rightarg=double precision,function=public.test_distance);
    create table profiles(id uuid primary key,skills text,certifications jsonb,education jsonb,work_experience jsonb,full_name text);
    create table candidate_profiles(user_id uuid primary key,course text,degree text,education_level text,skills jsonb,certifications jsonb,years_experience numeric);
    create table resumes(applicant_id uuid primary key,resume_embedding double precision,extracted_skills text);
    create table jobs(id uuid primary key,title text,required_skills text,required_education text,experience_required text,required_certifications text,description text,job_embedding double precision,employer_id uuid,status text,work_setup text,work_schedule text,travel_requirement text);
    create table job_matches(user_id uuid,job_id uuid,employer_id uuid,match_score numeric,skills_score numeric,education_score numeric,experience_score numeric,semantic_score numeric,match_status text,matching_skills jsonb,missing_skills jsonb,matched_certs jsonb,match_type text,updated_at timestamptz,unique(user_id,job_id));
    create table candidate_work_preferences(user_id uuid,work_setup text,work_schedule text,travel_requirement text,share_on_application boolean);
    create table applications(id int generated always as identity,applicant_id uuid,job_id uuid,applicant_snapshot jsonb,status text);
    insert into profiles values ('${candidate}','HTML5, CSS3, JavaScript, ReactJS','[]','[]','[]','Synthetic Candidate');
    insert into candidate_profiles values ('${candidate}','BS Information Technology',null,null,'[]','[]',0);
    insert into resumes values ('${candidate}',null,'HTML, CSS, JavaScript, React');
    insert into jobs(id,title,required_skills,required_education,experience_required,required_certifications,description,employer_id,status)
      values ('${job}','Junior Web Developer','HTML, CSS, JavaScript, React, SQL','Bachelor of Information Technology','0-1 years','','Entry level web role','${employer}','open');
    select set_config('test.uid','${candidate}',false);
  `);
  const helpers = read('20260904000000_match_quality_canonical_normalization.sql');
  await db.exec(helpers.slice(helpers.indexOf('CREATE OR REPLACE FUNCTION'), helpers.indexOf('CREATE OR REPLACE FUNCTION public.compute_and_save_job_match')));
  const compatibility = read('20260901000000_match_quality_refinement.sql');
  await db.exec(compatibility.slice(compatibility.indexOf('CREATE OR REPLACE FUNCTION'),compatibility.indexOf('CREATE OR REPLACE FUNCTION public.compute_and_save_job_match')));
  const canonical = read('20261004000000_fix_compute_and_save_job_match_canonical.sql');
  await db.exec(canonical);
  const compute = async () => (await db.query('select compute_and_save_job_match($1) as result',[job])).rows[0].result;
  const old = await compute();
  await db.exec(read('20261022124540_explainable_job_match_score.sql'));
  const current = await compute();
  assert.equal(current.match_score, old.match_score, 'adding evidence preserves the existing six-factor score');
  const saved = (await db.query('select match_calculation from job_matches')).rows[0].match_calculation;
  assert.deepEqual(saved,current.match_calculation,'returned calculation is exactly the persisted calculation');
  const explanation = explainJobMatch(saved,current.match_score);
  assert.ok(explanation);
  assert.equal(saved.version,MATCH_CALCULATION_VERSION);
  assert.equal(saved.evidence.required_skills.length,5);
  assert.equal(saved.matching_skills.length,4,'aliases HTML5/CSS3/ReactJS matched by real SQL helpers');
  assert.deepEqual(saved.missing_skills,['sql']);
  assert.equal(explanation.rows.filter(x=>x.included).length,4,'missing embeddings and unrequired certs excluded');
  assert.equal(Math.round(explanation.total),current.match_score);
  assert.ok(Math.abs(explanation.rows.reduce((sum,x)=>sum+x.maximum,0)-100)<1e-8);
  // No invented evidence for old scores or malformed results.
  assert.equal(explainJobMatch(null,74),null);
  assert.equal(explainJobMatch(saved,100),null);
  assert.equal(explainJobMatch({...saved,version:'unknown'},current.match_score),null);
  assert.equal(explainJobMatch({...saved,applicable_weights:{...saved.applicable_weights,total:null}},current.match_score),null);
  assert.equal(explainJobMatch({...saved,breakdown:{...saved.breakdown,credentialsScore:undefined}},current.match_score),null);
  // Full calculation with all optional factors, with every contribution reconciled.
  await db.exec(`update jobs set required_certifications='AWS',job_embedding=0.8; update resumes set resume_embedding=0.8; update candidate_profiles set certifications='["AWS"]';`);
  const allFactors = await compute();
  const allExplanation = explainJobMatch(allFactors.match_calculation,allFactors.match_score);
  assert.equal(allExplanation.rows.filter(x=>x.included).length,6);
  assert.ok(allExplanation.rows.find(x=>x.key==='credentials').points>0);
  assert.ok(Math.abs(allExplanation.total-allFactors.match_score)<=0.50000001);
  // Server discards client-forged score and evidence on insertion.
  const forged = {application_time_match_score:100,application_time_match_source:'client',application_time_match_calculation:{match_score:100},resume_source:'upload'};
  await db.query('insert into applications(applicant_id,job_id,applicant_snapshot,status) values ($1,$2,$3,$4)',[candidate,job,forged,'applied']);
  const frozen = (await db.query('select applicant_snapshot from applications where id=1')).rows[0].applicant_snapshot;
  assert.equal(frozen.application_time_match_score,allFactors.match_score);
  assert.deepEqual(frozen.application_time_match_calculation,allFactors.match_calculation);
  // Recalculation after a resume/profile edit cannot rewrite the application.
  await db.exec(`update profiles set skills=''; update resumes set extracted_skills='',resume_embedding=null; update candidate_profiles set degree=null,course=null,certifications='[]';`);
  const edited = await compute();
  assert.notEqual(edited.match_score,allFactors.match_score);
  await db.query('update applications set status=$1,applicant_snapshot=$2 where id=1',['hired',forged]);
  const retained = (await db.query('select applicant_snapshot from applications where id=1')).rows[0].applicant_snapshot;
  assert.deepEqual(retained.application_time_match_calculation,frozen.application_time_match_calculation);
  assert.equal(retained.application_time_match_score,frozen.application_time_match_score);
  for (const resumeSource of ['upload','builder']) {
    const application = {applicant_snapshot:{...retained,resume_source:resumeSource},job_match:{match_score:edited.match_score,match_calculation:edited.match_calculation}};
    const candidateView = readJobMatchEvidence(application);
    const employerView = readAuthoritativeJobMatch(application);
    assert.equal(candidateView.score,employerView.score);
    assert.equal(candidateView.score,allFactors.match_score);
    assert.ok(explainJobMatch(candidateView.calculation,candidateView.score));
  }
  const legacy = readJobMatchEvidence({applicant_snapshot:{application_time_match_score:74},job_match:{match_score:100,match_calculation:allFactors.match_calculation}});
  assert.equal(legacy.score,74);
  assert.equal(legacy.calculation,null,'never reuse a newer calculation for an old application');
  assert.equal(readJobMatchEvidence({job_match:{match_score:0}}).score,0);
  assert.equal(readJobMatchEvidence({job_match:{match_score:NaN}}).score,null);
  assert.equal(readJobMatchEvidence({match_score:100}).score,null);
  // Another candidate cannot forge an application for this candidate.
  await db.query("select set_config('test.uid',$1,false)",[employer]);
  await assert.rejects(()=>db.query('insert into applications(applicant_id,job_id,applicant_snapshot) values ($1,$2,$3)',[candidate,job,{}]),/FORBIDDEN/);
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: JobMatchScore } = await vite.ssrLoadModule('/src/components/alignment/JobMatchScore.jsx');
    const application = {applicant_snapshot:retained,job_match:{match_score:edited.match_score}};
    const markup = renderToStaticMarkup(React.createElement(JobMatchScore,{application}));
    assert.equal((markup.match(/%/g)||[]).length,1,'only the overall score is a percentage');
    assert.ok(markup.includes('Points earned / available'));
    assert.ok(markup.includes('Matched: html, css, javascript, react'));
    assert.ok(markup.includes('Not found: sql'));
    assert.ok(!markup.includes('Weight'));
    const legacyMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{application:{applicant_snapshot:{application_time_match_score:74}}}));
    assert.ok(legacyMarkup.includes('74%'));
    assert.ok(legacyMarkup.includes('no saved calculation evidence'));
    const emptyMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{application:{}}));
    assert.ok(emptyMarkup.includes('Not evaluated'));
    assert.equal((emptyMarkup.match(/%/g)||[]).length,0);
    const escaped = renderToStaticMarkup(React.createElement(JobMatchScore,{score:current.match_score,calculation:{...saved,matching_skills:['<script>alert(1)</script>']}}));
    assert.ok(!escaped.includes('<script>'));
    if (process.env.MATCH_PREVIEW_PATH) {
      const css = readFileSync(new URL('../src/components/alignment/JobMatchScore.css',import.meta.url),'utf8');
      const panel = markup.replace('<details>','<details open>');
      writeFileSync(process.env.MATCH_PREVIEW_PATH,`<!doctype html><html><meta charset="utf-8"><title>Job Match Score — local component preview</title><style>body{font:15px system-ui;background:#f5f7fb;color:#172033;margin:30px}main{max-width:1200px;margin:auto}.screens{display:grid;grid-template-columns:1fr 1fr;gap:24px}h1{font-size:26px}h2{font-size:18px}@media(max-width:850px){.screens{grid-template-columns:1fr}}${css}</style><main><h1>SkillSync · Job Match Score</h1><p>Local component preview · Synthetic SQL test data · Same saved application shown to both roles</p><div class="screens"><div><h2>Job Seeker · Submitted application</h2>${panel}</div><div><h2>Employer · Applicant resume</h2>${panel}</div></div></main></html>`);
    }
  } finally { await vite.close(); }
  console.log('Job Match Score: SQL calculation, persistence, optional factors, immutable snapshots, forged input rejection, candidate/employer parity, and real React rendering passed.');
} finally {
  await db.close();
}
