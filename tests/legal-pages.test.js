import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('public policy URLs serve independent static documents through explicit Vercel rewrites', async () => {
  const config = JSON.parse(await read('vercel.json'));
  for (const [path, title] of [
    ['privacy-policy', 'Privacy Policy'],
    ['terms-of-service', 'Terms of Service'],
  ]) {
    const route = config.rewrites.find((rewrite) => rewrite.source === `/${path}`);
    assert.equal(route.destination, `/${path}.html`);
    const html = await read(`public${route.destination}`);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<html lang="en">/);
    assert.ok(html.includes(`<h1>${title}</h1>`));
    assert.match(html, /href="\/legal\.css"/);
    assert.match(html, /href="#main"/);
    assert.match(html, /<main id="main">/);
    assert.match(html, /mythaithaimassage@gmail\.com/);
    assert.doesNotMatch(html, /<script|\/api\/booking|GOOGLE_OAUTH_CLIENT_SECRET/);
    for (const match of html.matchAll(/href="(\/[^"]*)"/g)) {
      const href = match[1];
      assert.ok(['/', '/privacy-policy', '/terms-of-service', '/legal.css'].includes(href), `Unexpected local link: ${href}`);
    }
  }
  assert.match(await read('public/legal.css'), /:focus-visible/);
});

test('privacy policy describes medical records, providers, optional marketing and Gmail send-only authorization', async () => {
  const html = await read('public/privacy-policy.html');
  for (const text of [
    'medical', 'Vercel', 'BigQuery', 'Google Calendar', 'Square', 'Gemini',
    'gmail.send', 'Limited Use', 'Retention', 'unsubscribe', 'outside your province or Canada',
  ]) assert.ok(html.includes(text), `Missing privacy disclosure: ${text}`);
  assert.match(html, /does not request permission to read customers' inboxes/);
  assert.match(html, /Google API Services User Data Policy/);
});

test('terms match existing cancellation, rescheduling and deferred medical-history behavior', async () => {
  const html = await read('public/terms-of-service.html');
  for (const text of [
    'at least 24 hours', 'less than 24 hours', 'Rescheduling is free',
    'Rescheduling does not issue a refund', '$10 online deposit',
    'Square', 'does not itself activate', 'before treatment', 'matching email',
  ]) assert.ok(html.includes(text), `Missing term: ${text}`);
});

test('booking screen exposes policies in footer, consent and review without changing form submission', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /<nav aria-label="Legal information"[\s\S]*?href="\/privacy-policy"[\s\S]*?href="\/terms-of-service"/);
  assert.match(app, /Consent and Waiver Form[\s\S]*?href="\/privacy-policy" target="_blank" rel="noopener noreferrer"/);
  assert.match(app, /Please read our[\s\S]*?href="\/terms-of-service" target="_blank" rel="noopener noreferrer"/);
});
