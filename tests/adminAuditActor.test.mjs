import assert from 'node:assert/strict';
import { supabase } from '../src/services/supabase.js';
import { logAdminAction } from '../src/services/adminService.js';

const originalFrom = supabase.from;
const originalGetUser = supabase.auth.getUser;
const originalWarn = console.warn;
const calls = [];
const warnings = [];
let role = 'employer';
let signedIn = true;
let lookupError = null;
let insertError = null;
supabase.auth.getUser = async () => ({ data: { user: signedIn ? { id: 'synthetic-actor' } : null } });
supabase.from = table => {
  calls.push(table);
  if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: lookupError }) }) }) };
  assert.equal(table, 'admin_audit_logs');
  return { insert: async records => { calls.push(records); return { error: insertError }; } };
};
console.warn = (...args) => warnings.push(args);
const action = { action: 'SYNTHETIC_TEST', targetType: 'test', targetId: 'synthetic-target', reason: 'Synthetic contract test only' };
try {
  await logAdminAction(action);
  assert.deepEqual(calls, ['profiles'], 'employer must not attempt an admin insert');
  assert.equal(warnings.length, 0);
  calls.length = 0;
  role = 'candidate';
  await logAdminAction(action);
  assert.deepEqual(calls, ['profiles']);
  calls.length = 0;
  signedIn = false;
  await logAdminAction(action);
  assert.deepEqual(calls, []);
  signedIn = true;
  role = 'admin';
  await logAdminAction(action);
  assert.equal(calls[1], 'admin_audit_logs');
  assert.equal(calls[2][0].action, action.action);
  assert.equal(calls[2][0].admin_id, 'synthetic-actor');
  calls.length = 0;
  lookupError = new Error('Synthetic profile lookup failure');
  await logAdminAction(action);
  assert.deepEqual(calls, ['profiles'], 'lookup failure must fail closed');
  assert.equal(warnings.length, 1, 'genuine lookup failures remain visible');
  lookupError = null;
  insertError = new Error('Synthetic admin permission failure');
  await logAdminAction(action);
  assert.equal(warnings.length, 2, 'genuine admin insert failures remain visible');
} finally {
  supabase.from = originalFrom;
  supabase.auth.getUser = originalGetUser;
  console.warn = originalWarn;
}
console.log('Admin audit actor: employer/candidate/anonymous writes excluded; admin writes and real failure reporting preserved.');
