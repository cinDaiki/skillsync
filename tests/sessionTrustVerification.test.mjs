import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Isolated SQL regression. JWT identity and digest are boundary stubs: these
// tests exercise authorization/ledger logic, not signature or hash validation.
const db = new PGlite();
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const session = '33333333-3333-4333-8333-333333333333';
const otherSession = '44444444-4444-4444-8444-444444444444';
const device = '55555555-5555-4555-8555-555555555555';
const token = 'synthetic-test-device-token-32-characters';
const legacy = readFileSync(new URL('../supabase/migrations/20260825050000_phase_6_5_adaptive_login_security.sql',import.meta.url),'utf8');
const start = legacy.indexOf('CREATE OR REPLACE FUNCTION public.check_session_trust_status(');
const end = legacy.indexOf('--',legacy.indexOf('GRANT EXECUTE ON FUNCTION public.check_session_trust_status(TEXT)',start));
const identity = async (uid=user,sid=session) => {
  await db.query("select set_config('test.uid',$1,false),set_config('test.jwt',$2,false)",[uid || '',JSON.stringify(sid===undefined?{}:{session_id:sid})]);
};
const trust = async (deviceToken=null) => (await db.query('select public.check_session_trust_status($1) result',[deviceToken])).rows[0].result;
const seedVerified = async (uid=user,sid=session,deviceId=null,verified=true) => db.query('insert into verified_user_sessions(session_id,user_id,device_id,is_step_up_verified,verified_at) values($1,$2,$3,$4,now()) on conflict(session_id) do update set user_id=excluded.user_id,device_id=excluded.device_id,is_step_up_verified=excluded.is_step_up_verified,verified_at=excluded.verified_at',[sid,uid,deviceId,verified]);
let checks = 0;
const expect = async (allowed,label,deviceToken=null) => {
  assert.deepEqual(await trust(deviceToken),{is_trusted:allowed,requires_otp:!allowed},label);
  checks++;
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
    create function public.digest(bytea,text) returns bytea language sql as $$select $1$$;
    create table trusted_devices(id uuid primary key,user_id uuid,device_token_hash text,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
    create table verified_user_sessions(session_id uuid primary key,user_id uuid,is_step_up_verified boolean,device_id uuid,verified_at timestamptz);
  `);
  await db.exec(legacy.slice(start,end));
  await identity(); await seedVerified();
  await expect(false,'legacy bug: successful OTP loses trust when no device is remembered');
  assert.equal((await db.query('select is_step_up_verified from verified_user_sessions')).rows[0].is_step_up_verified,false);
  const migrations = new URL('../supabase/migrations/',import.meta.url);
  const migrationName = readdirSync(migrations).find(name=>name.endsWith('_preserve_verified_session_trust.sql'));
  const fixPath = process.env.SESSION_TRUST_FIX_SQL_PATH || (migrationName && new URL(migrationName,migrations));
  assert.ok(fixPath,'Reviewed session-trust migration must exist');
  await db.exec(readFileSync(fixPath,'utf8'));
  await seedVerified();
  await expect(true,'OTP verified current session remains allowed without a remembered device');
  await expect(true,'repeated route checks preserve session verification');
  await expect(true,'changing the device token cannot clear an independently verified session','unremembered-other-token');
  assert.equal((await db.query('select count(*)::int n from trusted_devices')).rows[0].n,0,'no persistent device created'); checks++;
  await identity(user,otherSession); await expect(false,'same user with a new session still requires OTP');
  await identity(other,session); await expect(false,'another user cannot reuse verified session identity');
  await identity(); await seedVerified(user,session,null,false); await expect(false,'revoked verification is not restored from a timestamp');
  await identity(null,session); await expect(false,'unauthenticated caller requires OTP');
  await identity(user,null); await expect(false,'missing session identity requires OTP');
  await identity(user,'malformed'); await expect(false,'malformed session identity requires OTP');
  await identity();
  await db.query("insert into trusted_devices values($1,$2,encode(convert_to($3,'UTF8'),'hex'),now()+interval '1 day',null,null)",[device,user,token]);
  await seedVerified(user,session,device,true); await expect(true,'valid device-linked session remains trusted');
  await db.exec('update trusted_devices set revoked_at=now()'); await expect(false,'revoked device-linked session is blocked');
  await db.exec("update trusted_devices set revoked_at=null,expires_at=now()-interval '1 day'");
  await seedVerified(user,session,device,true); await expect(false,'expired device-linked session is blocked');
  await db.exec("update trusted_devices set expires_at=now()+interval '1 day'");
  await seedVerified(user,session,null,false); await expect(true,'existing valid remembered-device fallback still works',token);
  await identity(user,otherSession); await expect(false,'device token is not optional for an unverified new session');
  await expect(false,'wrong device token cannot authorize new session','incorrect-device-token-at-least-32-characters');
  console.log(`Session trust: ${checks} SQL checks passed (legacy reproduction, current-session preservation, identity isolation, revocation, expiry, remembered-device fallback).`);
} finally { await db.close(); }
