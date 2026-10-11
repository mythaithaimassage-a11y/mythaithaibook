import { useEffect, useState } from 'react';

type AvailabilityRequest = {
  branchId: string | number | undefined;
  date: string;
  time: string | null | undefined;
  durationMinutes: number;
  isRmt: boolean;
  excludeBookingId?: string;
};

export default function useTherapistAvailability({ branchId, date, time, durationMinutes, isRmt, excludeBookingId }: AvailabilityRequest) {
  const [therapistIds, setTherapistIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!branchId || !date || !time || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setTherapistIds(new Set());
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({
      branchId: String(branchId),
      date,
      time,
      durationMinutes: String(durationMinutes),
      isRmt: String(isRmt),
    });
    if (excludeBookingId) query.set('excludeBookingId', excludeBookingId);
    setTherapistIds(new Set());
    setLoading(true);
    setError('');
    fetch(`/api/booking?view=available-therapists&${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
        if (!Array.isArray(data.therapistIds) || !data.therapistIds.every((id: unknown) => typeof id === 'string' || typeof id === 'number')) {
          throw new Error('Therapist availability could not be verified. Refresh and try again.');
        }
        if (!controller.signal.aborted) setTherapistIds(new Set(data.therapistIds.map(String)));
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Therapist availability could not be verified. Refresh and try again.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [branchId, date, time, durationMinutes, isRmt, excludeBookingId]);

  return { therapistIds, loading, error };
}
