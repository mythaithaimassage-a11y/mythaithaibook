import { useEffect, useState } from 'react';
import { branchAppointmentTimes, type WeeklyBusinessHours } from '../lib/booking-options.js';
import { isTherapistScheduledAtBranch } from '../lib/work-schedule.js';

type AvailabilityRequest = {
  branchId: string | number | undefined;
  date: string;
  time: string | null | undefined;
  durationMinutes: number;
  isRmt: boolean;
  excludeBookingId?: string;
};

type BookingSlotAvailabilityRequest = Omit<AvailabilityRequest, 'time' | 'excludeBookingId'> & {
  times: string[];
};

type NextAvailableSlotRequest = {
  branch?: { id: string | number; businessHours?: WeeklyBusinessHours };
  date: string;
  durationMinutes: number;
  isRmt: boolean;
  therapistCount: number;
  enabled: boolean;
  therapists: Array<{
    id: string | number;
    active?: boolean;
    rmtCertified?: boolean;
    branches?: number[];
    schedule?: Record<string, number | null>;
  }>;
};

export function useNextAvailableBookingSlot({
  branch,
  date,
  durationMinutes,
  isRmt,
  therapistCount,
  enabled,
  therapists,
}: NextAvailableSlotRequest) {
  const branchId = branch?.id;
  const therapistsKey = JSON.stringify(therapists.map((therapist) => [
    therapist.id, therapist.active, therapist.rmtCertified, therapist.branches, therapist.schedule,
  ]));
  const requestKey = JSON.stringify([branchId, branch?.businessHours, date, durationMinutes, isRmt, therapistCount, therapistsKey]);
  const [state, setState] = useState<{
    key: string;
    slot: { date: string; time: string } | null;
    loading: boolean;
    error: string;
  }>({ key: '', slot: null, loading: false, error: '' });

  useEffect(() => {
    if (!enabled || !branchId || !date || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || therapistCount < 1) {
      setState({ key: requestKey, slot: null, loading: false, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ key: requestKey, slot: null, loading: true, error: '' });
    const findSlot = async () => {
      try {
        for (let offset = 1; offset <= 7; offset += 1) {
          const nextDate = new Date(`${date}T12:00:00Z`);
          nextDate.setUTCDate(nextDate.getUTCDate() + offset);
          const candidateDate = nextDate.toISOString().slice(0, 10);
          const times = branchAppointmentTimes(branch, candidateDate, durationMinutes);
          if (!times.length) continue;
          const query = new URLSearchParams({
            branchId: String(branchId),
            date: candidateDate,
            times: JSON.stringify(times),
            durationMinutes: String(durationMinutes),
            isRmt: String(isRmt),
          });
          const response = await fetch(`/api/booking?view=available-therapists&${query}`, {
            signal: controller.signal, cache: 'no-store',
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
          if (!data.therapistIdsByTime || typeof data.therapistIdsByTime !== 'object' || Array.isArray(data.therapistIdsByTime)) {
            throw new Error('Therapist availability could not be verified. Refresh and try again.');
          }
          for (const time of times) {
            const ids = data.therapistIdsByTime[time];
            if (!Array.isArray(ids) || !ids.every((id: unknown) => typeof id === 'string' || typeof id === 'number')) {
              throw new Error('Therapist availability could not be verified. Refresh and try again.');
            }
            const availableIds = new Set(ids.map(String));
            const eligibleCount = therapists.filter((therapist) =>
              therapist.active !== false && (!isRmt || therapist.rmtCertified) &&
              isTherapistScheduledAtBranch(therapist, branchId, candidateDate) &&
              availableIds.has(String(therapist.id))).length;
            if (eligibleCount >= therapistCount) {
              if (!controller.signal.aborted) {
                setState({ key: requestKey, slot: { date: candidateDate, time }, loading: false, error: '' });
              }
              return;
            }
          }
        }
        if (!controller.signal.aborted) setState({ key: requestKey, slot: null, loading: false, error: '' });
      } catch (requestError: unknown) {
        if (!controller.signal.aborted) {
          setState({
            key: requestKey,
            slot: null,
            loading: false,
            error: requestError instanceof Error ? requestError.message : 'Therapist availability could not be verified. Refresh and try again.',
          });
        }
      }
    };
    void findSlot();
    return () => controller.abort();
  }, [enabled, branchId, branch?.businessHours, date, durationMinutes, isRmt, therapistCount, therapistsKey, requestKey]);

  const current = state.key === requestKey;
  return {
    slot: current ? state.slot : null,
    loading: !current || state.loading,
    error: current ? state.error : '',
  };
}

export function useBookingSlotAvailability({ branchId, date, times, durationMinutes, isRmt }: BookingSlotAvailabilityRequest) {
  const timesKey = JSON.stringify(times);
  const requestKey = JSON.stringify([branchId, date, timesKey, durationMinutes, isRmt]);
  const [state, setState] = useState<{
    key: string;
    therapistIdsByTime: Record<string, string[]>;
    loading: boolean;
    error: string;
  }>({ key: '', therapistIdsByTime: {}, loading: false, error: '' });

  useEffect(() => {
    if (!branchId || !date || !times.length || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setState({ key: requestKey, therapistIdsByTime: {}, loading: false, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ key: requestKey, therapistIdsByTime: {}, loading: true, error: '' });
    const query = new URLSearchParams({
      branchId: String(branchId),
      date,
      times: timesKey,
      durationMinutes: String(durationMinutes),
      isRmt: String(isRmt),
    });
    fetch(`/api/booking?view=available-therapists&${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
        if (!data.therapistIdsByTime || typeof data.therapistIdsByTime !== 'object' || Array.isArray(data.therapistIdsByTime)) {
          throw new Error('Therapist availability could not be verified. Refresh and try again.');
        }
        const therapistIdsByTime = Object.fromEntries(times.map((time) => {
          const ids = data.therapistIdsByTime[time];
          if (!Array.isArray(ids) || !ids.every((id: unknown) => typeof id === 'string' || typeof id === 'number')) {
            throw new Error('Therapist availability could not be verified. Refresh and try again.');
          }
          return [time, ids.map(String)];
        }));
        if (!controller.signal.aborted) setState({ key: requestKey, therapistIdsByTime, loading: false, error: '' });
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key: requestKey,
            therapistIdsByTime: {},
            loading: false,
            error: requestError instanceof Error ? requestError.message : 'Therapist availability could not be verified. Refresh and try again.',
          });
        }
      });
    return () => controller.abort();
  }, [branchId, date, timesKey, durationMinutes, isRmt, requestKey]);

  const current = state.key === requestKey;
  return {
    therapistIdsByTime: current ? state.therapistIdsByTime : {},
    loading: !current || state.loading,
    error: current ? state.error : '',
  };
}

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
