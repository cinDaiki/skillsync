import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readJobMatchEvidence, explainJobMatch, wholeMatchContributions, MATCH_CALCULATION_VERSION } from '../src/services/jobMatchEvidence.js';
import { readAuthoritativeJobMatch } from '../src/services/evaluation/hrFitValidation.js';
import { loadCurrentJobMatchEvidence } from '../src/services/currentJobMatchEvidence.js';

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
  // Whole-point presentation reconciles to the saved result, including .75 ties.
  // The exact calculation and cached evidence must remain untouched.
  const roundingExample = {score:77,rows:[26.25,13.125,18.75,18.75,0,0].map((points,index)=>({points,included:index<4}))};
  const unchangedExample = JSON.stringify(roundingExample);
  assert.deepEqual(wholeMatchContributions(roundingExample).map(r=>r.displayPoints),[26,13,19,19,0,0]);
  assert.equal(JSON.stringify(roundingExample),unchangedExample);
  for (const total of [explanation, ...Array.from({length:101},(_,score)=>({score,rows:[score/2,score/2,0].map((points,index)=>({points,included:index<2}))}))]) {
    const rounded = wholeMatchContributions(total);
    assert.equal(rounded.reduce((sum,r)=>sum+r.displayPoints,0),Math.round(total.score));
    assert.ok(rounded.every(r=>Number.isInteger(r.displayPoints)&&r.displayPoints>=0&&Math.abs(r.displayPoints-r.points)<1.00000001));
    assert.ok(rounded.filter(r=>!r.included).every(r=>r.displayPoints===0));
  }
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
  // A current cache written before the migration must be upgraded once, not left
  // permanently without details, and eligibility must still come from the server.
  const calls = [];
  const mockClient = (row, result = current, error = null) => ({
    auth: { getUser: async () => ({ data: { user: { id: candidate } } }) },
    from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: row, error: null }) }),
    rpc: async name => {
      calls.push(name);
      return name === 'compute_and_save_job_match' ? {data:result,error} : {data:{match_score:result.match_score,eligible:false,minimum_match_percentage:99},error:null};
    },
  });
  const initialEligibility = {match_score:74,eligible:true};
  const upgraded = await loadCurrentJobMatchEvidence(mockClient({match_score:74}),job,initialEligibility);
  assert.deepEqual(calls,['compute_and_save_job_match','get_job_application_eligibility']);
  assert.equal(upgraded.calculation.match_score,current.match_score);
  assert.equal(upgraded.eligibility.eligible,false,'preserve actual server eligibility instead of deriving it in JS');
  calls.length = 0;
  const cached = await loadCurrentJobMatchEvidence(mockClient({match_score:current.match_score,match_calculation:saved}),job,{match_score:current.match_score});
  assert.deepEqual(calls,[],'complete cache requires no extra computation');
  assert.deepEqual(cached.calculation,saved);
  calls.length = 0;
  const oldServer = await loadCurrentJobMatchEvidence(mockClient({match_score:74},{match_score:74}),job,initialEligibility);
  assert.equal(oldServer.eligibility.match_score,74,'backend without evidence must not hide an existing score');
  assert.equal(oldServer.calculation,null);
  assert.ok(oldServer.evidenceError);
  assert.equal(calls.length,1,'do not repeatedly retry an incompatible backend');
  const denied = await loadCurrentJobMatchEvidence(mockClient({match_score:74},null,new Error('FORBIDDEN')),job,initialEligibility);
  assert.equal(denied.eligibility.match_score,74);
  assert.equal(denied.calculation,null);
  assert.match(denied.evidenceError.message,/FORBIDDEN/);
  // Another candidate cannot forge an application for this candidate.
  await db.query("select set_config('test.uid',$1,false)",[employer]);
  await assert.rejects(()=>db.query('insert into applications(applicant_id,job_id,applicant_snapshot) values ($1,$2,$3)',[candidate,job,{}]),/FORBIDDEN/);
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: JobMatchScore } = await vite.ssrLoadModule('/src/components/alignment/JobMatchScore.jsx');
    const application = {applicant_snapshot:retained,job_match:{match_score:edited.match_score}};
    const markup = renderToStaticMarkup(React.createElement(JobMatchScore,{application}));
    assert.equal((markup.match(/%/g)||[]).length,1,'only the overall score is a percentage');
    assert.ok(markup.includes('Where your points came from'));
    assert.ok(markup.includes('aria-label="Required skills found"'));
    assert.ok(markup.includes('aria-label="Required skills missing"'));
    assert.ok(markup.includes('>sql</li>'));
    assert.ok(markup.includes('Default rule'),'baseline points are not presented as verified evidence');
    assert.ok(!markup.includes('Rule result:'));
    assert.ok(!markup.includes('Calculation:'));
    assert.ok(!markup.includes('<table'));
    assert.ok(!markup.includes('Scoring version:'));
    const optionalMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{score:current.match_score,calculation:saved}));
    assert.ok(optionalMarkup.includes('Not counted'),'excluded factors are not shown as zero-score failures');
    const pointLabels = [...markup.matchAll(/class="jms-points"><span>\+(\d+)<\/span>/g)].map(m=>Number(m[1]));
    assert.equal(pointLabels.length,6,'each included criterion has a whole-point label');
    assert.equal(pointLabels.reduce((sum,n)=>sum+n,0),Math.round(allFactors.match_score));
    assert.ok(markup.includes('keeps full precision'));
    assert.ok(!markup.includes('Weight'));
    const legacyMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{application:{applicant_snapshot:{application_time_match_score:74}}}));
    assert.ok(legacyMarkup.includes('74%'));
    assert.ok(legacyMarkup.includes('calculation details were not recorded'));
    const loadingMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{score:74,loading:true,showScore:false}));
    assert.ok(loadingMarkup.includes('74%'),'score must stay visible even while evidence loads or an old caller passes showScore=false');
    assert.ok(loadingMarkup.includes('Loading calculation details'));
    const missingMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{score:74,evidenceError:new Error('unavailable')}));
    assert.ok(missingMarkup.includes('74%'));
    assert.ok(missingMarkup.includes('could not be loaded'));
    const { default: Banner } = await vite.ssrLoadModule('/src/components/candidate/CandidateMatchStatusBanner.jsx');
    const bannerMarkup = renderToStaticMarkup(React.createElement(Banner,{showScore:false,job:{},eligibility:{matchScore:74,requiredMatch:70}}));
    assert.equal((bannerMarkup.match(/%/g)||[]).length,0,'eligibility banner must not repeat the overall percentage');
    const emptyMarkup = renderToStaticMarkup(React.createElement(JobMatchScore,{application:{}}));
    assert.ok(emptyMarkup.includes('Not evaluated'));
    assert.equal((emptyMarkup.match(/%/g)||[]).length,0);
    const escaped = renderToStaticMarkup(React.createElement(JobMatchScore,{score:current.match_score,calculation:{...saved,matching_skills:['<script>alert(1)</script>']}}));
    assert.ok(!escaped.includes('<script>'));
    if (process.env.MATCH_PREVIEW_PATH) {
      const css = readFileSync(new URL('../src/components/alignment/JobMatchScore.css',import.meta.url),'utf8');
      const sample = {
        ...saved, match_score:77, calculated_at:null,
        applicable_weights:{skills:0.35,transferable:0.15,education:0.15,experience:0.15,credentials:0,semantic:0,total:0.8},
        breakdown:{requiredSkillsScore:60,transferableSkillsScore:70,educationCompatibility:100,experienceCompatibility:100,credentialsScore:100,semanticRelevance:0},
        matching_skills:['html','css','javascript'], missing_skills:['react','sql'], matched_transferable:[], matched_certs:[],
        evidence:{required_skills:['html','css','javascript','react','sql'],required_transferable:[],required_certifications:[],required_education:null,candidate_education:'BS Computer Science',experience_required:null,candidate_years:2},
      };
      const sampleApplication = {applicant_snapshot:{application_time_match_score:77,application_time_match_calculation:sample}};
      const panel = renderToStaticMarkup(React.createElement(JobMatchScore,{application:sampleApplication})).replace('<details class="jms-breakdown">','<details class="jms-breakdown" open>');
      writeFileSync(process.env.MATCH_PREVIEW_PATH,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Job Match Score — design preview</title><style>body{font:15px system-ui;background:#f5f7fb;color:#172033;margin:30px}main{max-width:1200px;margin:auto}.screens{display:grid;grid-template-columns:1fr 1fr;gap:24px}h1{font-size:26px}h2{font-size:16px;color:#59697b}@media(max-width:850px){.screens{grid-template-columns:1fr}body{margin:16px}}${css}</style><main><h1>SkillSync · Job Match Score</h1><p>Design preview · Illustrative software-role data · Same saved result for both roles</p><div class="screens"><div><h2>Job Seeker · Submitted application</h2>${panel}</div><div><h2>Employer · Applicant resume</h2>${panel}</div></div></main></html>`);
    }
  } finally { await vite.close(); }
  console.log('Job Match Score: SQL calculation, persistence, optional factors, immutable snapshots, forged input rejection, candidate/employer parity, and real React rendering passed.');
} finally {
  await db.close();
}
