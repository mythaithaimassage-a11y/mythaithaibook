import assert from 'node:assert/strict';
import test from 'node:test';
import { sendGmailMessage } from '../lib/gmail.js';

test('Gmail sends preserve the request, method receiver, and response', async () => {
  const request = { userId: 'me', requestBody: { raw: 'synthetic-message' } };
  const response = { data: { id: 'message-id' } };
  const messages = {
    async send(actual) {
      assert.equal(this, messages);
      assert.equal(actual, request);
      return response;
    },
  };
  assert.equal(await sendGmailMessage({ users: { messages } }, request), response);
});

for (const [name, error] of [
  ['OAuth response', Object.assign(new Error('Request failed with status code 400'), {
    response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
  })],
  ['OAuth message', new Error('invalid_grant')],
  ['prefixed OAuth message', new Error('invalid_grant: Bad Request')],
]) {
  test(`${name} gives recovery guidance without retrying or exposing the response`, async () => {
    let attempts = 0;
    const gmail = {
      users: { messages: { send: async () => { attempts += 1; throw error; } } },
    };
    await assert.rejects(sendGmailMessage(gmail, { userId: 'me' }), (actual) => {
      assert.equal(actual.cause, error);
      assert.match(actual.message, /invalid_grant/);
      assert.match(actual.message, /reauthorize the sender mailbox/);
      assert.match(actual.message, /replace GOOGLE_OAUTH_REFRESH_TOKEN/);
      assert.match(actual.message, /configured OAuth client, and redeploy/);
      assert.match(actual.message, /email was not sent/);
      assert.doesNotMatch(actual.message, /Token has been expired or revoked/);
      return true;
    });
    assert.equal(attempts, 1);
  });
}

test('other Gmail failures are propagated unchanged', async () => {
  for (const error of [
    new Error('Rate limit exceeded'),
    Object.assign(new Error('invalid_client'), { response: { data: { error: 'invalid_client' } } }),
    new Error('invalid_grant_unrelated'),
  ]) {
    const gmail = { users: { messages: { send: async () => { throw error; } } } };
    await assert.rejects(sendGmailMessage(gmail, {}), (actual) => actual === error);
  }
});
