export async function sendGmailMessage(gmail, request) {
  try {
    return await gmail.users.messages.send(request);
  } catch (error) {
    if (
      error?.response?.data?.error === 'invalid_grant'
      || /^invalid_grant(?:$|:|\s)/.test(error?.message || '')
    ) {
      throw new Error(
        'Gmail authorization is no longer valid (invalid_grant). The administrator must reauthorize the sender mailbox, replace GOOGLE_OAUTH_REFRESH_TOKEN using the configured OAuth client, and redeploy. The email was not sent.',
        { cause: error },
      );
    }
    throw error;
  }
}
