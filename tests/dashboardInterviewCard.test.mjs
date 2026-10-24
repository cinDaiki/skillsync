import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { transformWithEsbuild } from 'vite';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';

const temporary = await mkdtemp(fileURLToPath(new URL('./.dashboard-card-', import.meta.url)));
try {
  const source = await readFile(new URL('../src/components/candidate/DashboardInterviewCard.jsx', import.meta.url), 'utf8');
  const compiled = await transformWithEsbuild(source, 'DashboardInterviewCard.jsx', { loader: 'jsx', jsx: 'automatic', format: 'esm' });
  await writeFile(`${temporary}/card.mjs`, compiled.code);
  const { default: Card } = await import(pathToFileURL(`${temporary}/card.mjs`));
  const render = interview => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Card, { interview })));
  const base = { status: 'CONFIRMED', interview_type: 'ONLINE', scheduled_date: '2026-10-25', scheduled_time: '2:30 PM', platform: 'Other', meeting_url: 'https://example.com/qa-session', job_title: 'Synthetic QA role' };
  const confirmed = render(base);
  assert.match(confirmed, />25</);
  assert.match(confirmed, /Oct 2026/);
  assert.match(confirmed, /2:30 PM/);
  assert.match(confirmed, /Online · Other/);
  assert.match(confirmed, /href="https:\/\/example.com\/qa-session"/);
  assert.doesNotMatch(confirmed, /Google Meet|PST|>May</);
  const pending = render({ ...base, status: 'PENDING_CONFIRMATION' });
  assert.match(pending, /Awaiting your confirmation/);
  assert.match(pending, /Review invitation/);
  assert.doesNotMatch(pending, /Join call|href="https:/);
  const walkin = render({ ...base, interview_type: 'WALK_IN', address: 'Synthetic training room' });
  assert.match(walkin, /Walk-in · Synthetic training room/);
  assert.doesNotMatch(walkin, /Join call/);
  const missing = render({ status: 'RESCHEDULE_REQUESTED', interview_type: 'ONLINE' });
  assert.match(missing, /Date pending/);
  assert.match(missing, /Time: To be confirmed/);
  assert.match(missing, /New time requested/);
  assert.doesNotMatch(missing, /Invalid Date|10:00|PST|meet.google/);
  assert.doesNotMatch(render({ ...base, meeting_url: 'javascript:alert(1)' }), /javascript:|Join call/);
  assert.match(render({ ...base, job_title: '<script>injected</script>' }), /&lt;script&gt;/);
  console.log('Dashboard interview cards: saved date/time/platform/link, pending response, walk-in, missing data, unsafe URL and escaping checks passed.');
} finally {
  await rm(temporary, { recursive: true });
}
