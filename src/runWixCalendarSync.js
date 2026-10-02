export async function runWixCalendarSync(requestBatch, onProgress, initial) {
  let current = initial ?? await requestBatch();
  let synced = 0;
  while (true) {
    synced += current.synced;
    onProgress({ synced, pending: current.pending });
    if (current.errors.length) {
      throw new Error(`Bookings are saved, but Calendar sync stopped: ${current.errors.map((issue) => `${issue.bookingId}: ${issue.message}`).join('; ')} Retry Wix Calendar sync to resume.`);
    }
    if (current.pending === 0) return { synced, pending: 0 };
    if (current.synced === 0) throw new Error('Calendar sync made no progress. Refresh and retry Wix Calendar sync.');
    current = await requestBatch();
  }
}
