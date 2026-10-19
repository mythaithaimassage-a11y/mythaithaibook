import { gmailCommunication, gmailReadError } from './customer-communications.js';

export function reviewEngagementForCustomer(candidate, engagement) {
  const tracked = engagement.find((entry) => entry.email === candidate.email);
  const latest = candidate.lastRequestedAt || '';
  if (!tracked || (latest && Date.parse(latest) > Date.parse(tracked.sentAt))) {
    return { ...candidate, reviewTracking: null };
  }
  return { ...candidate, reviewTracking: tracked };
}

export function reviewThreadReply(messages, requestId) {
  const request = messages.find((message) => message.id === requestId && message.direction === 'sent' && message.kind === 'Review request');
  if (!request?.threadId) return null;
  return messages.filter((message) => message.direction === 'received'
    && message.threadId === request.threadId && message.occurredAt >= request.occurredAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] || null;
}

export async function readReviewRequestReply(gmail, access, messageId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(messageId)) throw new Error('Invalid review email reference.');
  try {
    const sent = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const request = gmailCommunication(sent.data, access);
    if (!request || request.direction !== 'sent' || request.kind !== 'Review request' || !request.threadId) {
      throw new Error('Unable to verify the customer review email.');
    }
    const { data } = await gmail.users.threads.get({ userId: 'me', id: request.threadId, format: 'full' });
    const messages = (data.messages || []).map((message) => gmailCommunication(message, access)).filter(Boolean);
    const reply = reviewThreadReply(messages, messageId);
    return { reply, checkedAt: new Date().toISOString(), messageId };
  } catch (error) {
    throw gmailReadError(error);
  }
}
