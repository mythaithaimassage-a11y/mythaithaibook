export function createDashboardChallengeStore() {
  return [];
}

export function handleDashboardChallengeQuery(query, params = {}, challenges) {
  if (!query.includes('dashboard_login_challenges')) return null;
  if (query.startsWith('SELECT id FROM')) {
    return [challenges.filter((challenge) =>
      challenge.email === params.email
      && !challenge.consumed
      && challenge.expires_at > params.now,
    ).map(({ id }) => ({ id }))];
  }
  if (query.startsWith('INSERT INTO')) {
    challenges.push({ ...params, attempts: 0, consumed: false });
    return [[]];
  }
  if (query.startsWith('SELECT id, email, otp_hash')) {
    return [challenges.filter((challenge) => challenge.id === params.id)];
  }
  if (query.startsWith('UPDATE') && query.includes('attempts =')) {
    const challenge = challenges.find((entry) => entry.id === params.id);
    if (challenge && !challenge.consumed) {
      challenge.attempts += 1;
      challenge.consumed = challenge.attempts >= 5;
    }
    return [[]];
  }
  if (query.startsWith('UPDATE')) {
    const challenge = challenges.find((entry) => entry.id === params.id);
    if (challenge) challenge.consumed = true;
    return [[]];
  }
  throw new Error(`Unexpected dashboard challenge query: ${query}`);
}

export function readDashboardOtp(emailRequest) {
  const raw = Buffer.from(emailRequest.requestBody.raw, 'base64url').toString();
  const match = raw.match(/verification code is (\d{6})/);
  if (!match) throw new Error('Dashboard OTP was not present in the captured email');
  return match[1];
}
