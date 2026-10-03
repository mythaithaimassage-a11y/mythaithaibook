export async function runWixCalendarSync(requestBatch, onProgress, initial) {
  let current = initial ?? await requestBatch();
  let synced = 0;
  const failures = new Map();
  while (true) {
    synced += current.synced;
    const repeatedFailure = current.errors.some((issue) => failures.has(issue.bookingId));
    for (const issue of current.errors) failures.set(issue.bookingId, issue);
    await onProgress({ synced, pending: current.pending });
    if (failures.size && (current.stopped || repeatedFailure || current.pending === 0 || current.pending === null || failures.size >= 100)) {
      throw new Error(`${synced} bookings synced. Bookings are saved, but ${failures.size} booking(s) could not sync: ${[...failures.values()].map((issue) => `${issue.bookingId}: ${issue.message}`).join('; ')} Correct the reported errors and Retry Wix Calendar sync to resume.`);
    }
    if (current.pending === 0) return { synced, pending: 0 };
    if (current.synced === 0 && current.errors.length === 0) throw new Error('Calendar sync made no progress. Refresh and retry Wix Calendar sync.');
    current = await requestBatch([...failures.keys()]);
  }
}
