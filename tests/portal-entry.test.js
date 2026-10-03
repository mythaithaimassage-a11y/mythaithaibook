import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { portalEntry } from '../lib/portal-entry.js';

test('public entry points never expose staff navigation', () => {
  for (const path of ['/', '', '/public', '/OWNER', '/owner-extra', '/therapist/other']) {
    assert.deepEqual(portalEntry(path), { mode: 'customer', staffNavigation: false });
  }
  for (const query of ['?manage=1&ref=MTT-test', '?history=1', '?companyToken=test', '?joinToken=test', '?paymentComplete=1', '?view=admin']) {
    const url = new URL(`https://test.example/${query}`);
    assert.deepEqual(portalEntry(url.pathname), { mode: 'customer', staffNavigation: false });
  }
});

test('staff URLs open the appropriate sign-in view including trailing slashes', () => {
  for (const path of ['/owner', '/owner/']) {
    assert.deepEqual(portalEntry(path), { mode: 'admin', staffNavigation: true });
  }
  for (const path of ['/therapist', '/therapist/']) {
    assert.deepEqual(portalEntry(path), { mode: 'therapist', staffNavigation: true });
  }
});

test('staff entry points have explicit deployment routes and no-index headers without replacing legal routes', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const path of ['/owner', '/owner/', '/therapist', '/therapist/']) {
    assert.equal(config.rewrites.find((route) => route.source === path).destination, '/index.html');
    assert.ok(config.headers.find((route) => route.source === path).headers.some((header) =>
      header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow'));
  }
  assert.equal(config.rewrites.find((route) => route.source === '/privacy-policy').destination, '/privacy-policy.html');
  assert.equal(config.rewrites.find((route) => route.source === '/terms-of-service').destination, '/terms-of-service.html');
});

test('public navigation is separate while sign-in gates and staff walk-in workflow are retained', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /portalEntry\(typeof window === 'undefined' \? '\/' : window.location.pathname\)/);
  assert.match(app, /useState\(entry.mode\)/);
  assert.match(app, /entry.staffNavigation \? <nav aria-label="Staff platform views"/);
  assert.match(app, /: <a href="\/" aria-label="Public booking home"/);
  assert.match(app, /<AdminGate>[\s\S]*?<AdminPortal/);
  assert.match(app, /<TherapistPortal \/>/);
  assert.match(app, /onNavigateToBookingPortal=\{\(\) => \{ setStaffBooking\(true\); setViewMode\('customer'\); \}\}/);
});

test('rendered public homepage hides staff tabs and direct staff pages keep authentication screens', async (t) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/App.tsx', import.meta.url))],
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const module = { exports: {} };
  const require = createRequire(new URL('../package.json', import.meta.url));
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
  const App = module.exports.default;
  for (const [key, value] of [
    ['localStorage', { getItem: () => null }],
    ['window', { location: { pathname: '/', search: '' } }],
  ]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  const render = (pathname, search = '') => {
    window.location = { pathname, search };
    return renderToStaticMarkup(React.createElement(App));
  };
  const homepage = render('/');
  assert.match(homepage, /aria-label="Public booking home"/);
  assert.doesNotMatch(homepage, /aria-label="Staff platform views"|aria-label="Dashboard"|aria-label="Therapist"|Owner sign in|Therapist sign in/);
  const owner = render('/owner');
  assert.match(owner, /aria-label="Staff platform views"/);
  assert.match(owner, /Verifying secure owner access/);
  assert.doesNotMatch(owner, /Choose Location|Sales &amp; reports/);
  const therapist = render('/therapist');
  assert.match(therapist, /Therapist sign in/);
  assert.match(therapist, /type="password"/);
  assert.doesNotMatch(therapist, /Choose Location/);
  assert.match(render('/', '?manage=1&ref=MTT-test'), /MTT-test/);
  assert.match(render('/', '?history=1&ref=MTT-test'), /Medical history for an existing appointment/);
});
