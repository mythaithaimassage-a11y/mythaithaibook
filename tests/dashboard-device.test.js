import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { createDashboardChallengeStore, handleDashboardChallengeQuery, readDashboardOtp } from './helpers/dashboard-auth.js';

test('registered dashboard browsers skip OTP for 90 days but never skip passwords or account checks', async (t) => {
  const originalEnv = { ...process.env };
  t.after(() => { process.env = originalEnv; });
  Object.assign(process.env, {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: 'synthetic-key',
    GOOGLE_SPREADSHEET_ID: 'test-sheet', BIGQUERY_PROJECT_ID: 'test-project',
    BIGQUERY_DATASET: 'booking_system', GOOGLE_GMAIL_SENDER_EMAIL: 'test@example.com',
    GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client', GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'synthetic-refresh',
    OWNER_ADMIN_EMAIL: 'owner@example.com', OWNER_ADMIN_PASSWORD: 'synthetic-owner-password',
    OWNER_ADMIN_SESSION_SECRET: 'synthetic-session-secret-at-least-thirty-two-characters',
    OWNER_INITIAL_SETUP_SECRET: '',
  });
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const password = 'synthetic-staff-password';
  const passwordHash = `scrypt$salt$${crypto.scryptSync(password, 'salt', 64).toString('hex')}`;
  const account = {
    id: 'staff-1', email: 'staff@example.com', name: 'Staff',
    role: 'branch_receptionist', branch_ids: '["1"]', status: 'active', password_hash: passwordHash,
  };
  const challenges = createDashboardChallengeStore();
  const emails = [];
  t.mock.method(google, 'gmail', () => ({
    users: { messages: { send: async (request) => { emails.push(request); return { data: {} }; } } },
  }));
  t.mock.method(BigQuery.prototype, 'dataset', () => ({
    exists: async () => [true],
    table: () => ({
      exists: async () => [true],
      getMetadata: async () => [{ schema: { fields: [{ name: 'receives_alerts' }] } }],
    }),
  }));
  t.mock.method(BigQuery.prototype, 'query', async ({ query, params }) => {
    const challengeResult = handleDashboardChallengeQuery(query, params, challenges);
    if (challengeResult) return challengeResult;
    if (query.startsWith('SELECT id, email, name, password_hash')) {
      return [[account].filter((user) => user.email === params.email && user.status === 'active')];
    }
    throw new Error(`Unexpected query: ${query}`);
  });
  const { default: handler } = await import(`../api/booking.js?device-test=${now}`);
  const jar = new Map();
  const request = async (view, body = {}, origin = 'https://test.example', method = 'POST') => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
      method, query: { view }, body,
      headers: {
        host: 'test.example', origin, 'content-type': 'application/json',
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
      },
    });
    const res = {
      code: 200, headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
        if (key !== 'Set-Cookie') return;
        for (const cookie of Array.isArray(value) ? value : [value]) {
          const [name, ...parts] = cookie.split(';')[0].split('=');
          if (cookie.includes('Max-Age=0;')) jar.delete(name);
          else jar.set(name, parts.join('='));
        }
      },
      status(code) { this.code = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await handler(req, res);
    return res;
  };
  const credentials = { email: account.email, password };
  const verify = async (login, rememberDevice) => request('owner-verify', {
    challengeId: login.data.challengeId, code: readDashboardOtp(emails.at(-1)), rememberDevice,
  });
  const firstLogin = await request('owner-login', { ...credentials, rememberDevice: true });
  assert.equal(firstLogin.data.otpRequired, true, 'Login body alone cannot register a device');
  assert.equal(jar.has('mtt_dashboard_device'), false);
  const badCode = await request('owner-verify', {
    challengeId: firstLogin.data.challengeId,
    code: readDashboardOtp(emails.at(-1)) === '000000' ? '000001' : '000000', rememberDevice: true,
  });
  assert.equal(badCode.code, 401);
  assert.equal(jar.has('mtt_dashboard_device'), false);
  assert.equal((await verify(firstLogin, false)).data.authenticated, true);
  assert.equal(jar.has('mtt_dashboard_device'), false, 'Registration is opt-in');
  const registration = await verify(await request('owner-login', credentials), true);
  assert.equal(registration.data.authenticated, true);
  const deviceCookie = registration.headers['Set-Cookie'].find((value) => value.startsWith('mtt_dashboard_device='));
  assert.match(deviceCookie, /Max-Age=7776000; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
  const registeredToken = jar.get('mtt_dashboard_device');
  assert.equal((await request('owner-logout')).code, 200);
  assert.equal(jar.has('mtt_owner_session'), false);
  assert.equal(jar.get('mtt_dashboard_device'), registeredToken, 'Ordinary sign-out retains registration');
  const emailCount = emails.length;
  assert.equal((await request('owner-session', {}, 'https://test.example', 'GET')).data.authenticated, false,
    'A device token is not a dashboard session');
  assert.equal((await request('owner-login', { ...credentials, password: 'wrong' })).code, 401);
  assert.equal((await request('owner-login', credentials, 'https://wrong.example')).code, 403);
  const trustedLogin = await request('owner-login', credentials);
  assert.equal(trustedLogin.data.authenticated, true);
  assert.equal(emails.length, emailCount, 'No OTP email is sent on a registered browser');
  assert.match(trustedLogin.headers['Set-Cookie'], /Max-Age=28800;/);
  assert.equal(jar.get('mtt_dashboard_device'), registeredToken, 'Trust expiry does not slide');
  account.branch_ids = '["2"]';
  const changedPermissions = await request('owner-login', credentials);
  assert.deepEqual(changedPermissions.data.user.branchIds, ['2']);
  account.status = 'disabled';
  assert.equal((await request('owner-login', credentials)).code, 401);
  account.status = 'active';
  account.password_hash = `scrypt$new-salt$${crypto.scryptSync(password, 'new-salt', 64).toString('hex')}`;
  assert.equal((await request('owner-login', credentials)).data.otpRequired, true, 'Password reset invalidates registration');
  account.password_hash = passwordHash;
  const tokenPayload = registeredToken.split('.')[0];
  for (const token of [
    `${tokenPayload}.forged`,
    `${registeredToken}.extra`,
    `${tokenPayload}.${'é'.repeat(43)}`,
    'malformed',
  ]) {
    jar.set('mtt_dashboard_device', token);
    const result = await request('owner-login', credentials);
    assert.equal(result.code, 200);
    assert.equal(result.data.otpRequired, true, 'Invalid tokens fall back to OTP');
    await verify(result, false);
  }
  jar.set('mtt_dashboard_device', registeredToken);
  jar.delete('mtt_owner_session');
  assert.equal((await request('patient-history', {}, 'https://test.example', 'GET')).code, 401,
    'Registration alone cannot access protected records');
  const ownerLogin = await request('owner-login', {
    email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD,
  });
  assert.equal(ownerLogin.data.otpRequired, true, 'Registration is bound to the account');
  await verify(ownerLogin, true);
  const ownerDevice = jar.get('mtt_dashboard_device');
  assert.notEqual(ownerDevice, registeredToken);
  assert.equal((await request('owner-login', {
    email: process.env.OWNER_ADMIN_EMAIL, password: process.env.OWNER_ADMIN_PASSWORD,
  })).data.authenticated, true, 'Environment owner accounts can register a device too');
  jar.set('mtt_dashboard_device', registeredToken);
  now += 90 * 86400000 - 1;
  assert.equal((await request('owner-login', credentials)).data.authenticated, true);
  now += 1;
  const expiredLogin = await request('owner-login', credentials);
  assert.equal(expiredLogin.data.otpRequired, true, 'OTP is required exactly at 90 days');
  await verify(expiredLogin, true);
  assert.equal((await request('owner-logout', { forgetDevice: true }, 'https://wrong.example')).code, 403);
  assert.equal(jar.has('mtt_dashboard_device'), true);
  assert.equal((await request('owner-logout', { forgetDevice: true })).code, 200);
  assert.equal(jar.has('mtt_dashboard_device'), false);
  assert.equal(jar.has('mtt_owner_session'), false);
  assert.equal((await request('owner-login', credentials)).data.otpRequired, true);
});
