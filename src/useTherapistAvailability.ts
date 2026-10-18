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

type AvailabilityConflict = {
  source: 'booking';
  reference: string;
  date: string;
  time: string;
  durationMinutes: number;
} | {
  source: 'calendar';
  reference: string;
  start: string;
  end: string;
};
type UnavailableTherapist = {
  id: string | number;
  name: string;
  reason: string;
  conflicts?: AvailabilityConflict[];
};

function isAvailabilityConflict(value: unknown): value is AvailabilityConflict {
  if (!value || typeof value !== 'object') return false;
  const conflict = value as Record<string, unknown>;
  return typeof conflict.reference === 'string' &&
    (conflict.source === 'booking'
      ? typeof conflict.date === 'string' && typeof conflict.time === 'string' &&
        typeof conflict.durationMinutes === 'number' && Number.isFinite(conflict.durationMinutes)
      : conflict.source === 'calendar' && typeof conflict.start === 'string' && typeof conflict.end === 'string');
}

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
            publicBooking: 'true',
          });
          const response = await fetch(`/api/booking?view=available-therapists&${query}`, {
            signal: controller.signal, cache: 'no-store',
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
          if (!data.therapistIdsByTime || typeof data.therapistIdsByTime !== 'object' || Array.isArray(data.therapistIdsByTime)) {
            throw new Error('Therapist availability could not be verified. Refresh and try again.');
          }
          if (!data.unassignedTherapistCountByTime || typeof data.unassignedTherapistCountByTime !== 'object' ||
              Array.isArray(data.unassignedTherapistCountByTime)) {
            throw new Error('Therapist availability could not be verified. Refresh and try again.');
          }
          for (const time of times) {
            const ids = data.therapistIdsByTime[time];
            const unassignedCount = data.unassignedTherapistCountByTime[time];
            if (!Array.isArray(ids) || !ids.every((id: unknown) => typeof id === 'string' || typeof id === 'number') ||
                !Number.isInteger(unassignedCount) || unassignedCount < 0) {
              throw new Error('Therapist availability could not be verified. Refresh and try again.');
            }
            const availableIds = new Set(ids.map(String));
            const eligibleCount = therapists.filter((therapist) =>
              therapist.active !== false && (!isRmt || therapist.rmtCertified) &&
              isTherapistScheduledAtBranch(therapist, branchId, candidateDate) &&
              availableIds.has(String(therapist.id))).length;
            if (eligibleCount + unassignedCount >= therapistCount) {
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
    unassignedTherapistCountByTime: Record<string, number>;
    bookingCutoffsByTime: Record<string, number>;
    loading: boolean;
    error: string;
  }>({ key: '', therapistIdsByTime: {}, unassignedTherapistCountByTime: {}, bookingCutoffsByTime: {}, loading: false, error: '' });
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const nextCutoff = Math.min(...Object.values(state.bookingCutoffsByTime).filter((cutoff) => cutoff >= now));
    if (!Number.isFinite(nextCutoff)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(nextCutoff - Date.now() + 1, 2147483647));
    return () => clearTimeout(timer);
  }, [state.bookingCutoffsByTime, now]);

  useEffect(() => {
    if (!branchId || !date || !times.length || !Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setState({ key: requestKey, therapistIdsByTime: {}, unassignedTherapistCountByTime: {}, bookingCutoffsByTime: {}, loading: false, error: '' });
      return;
    }
    const controller = new AbortController();
    setState({ key: requestKey, therapistIdsByTime: {}, unassignedTherapistCountByTime: {}, bookingCutoffsByTime: {}, loading: true, error: '' });
    const query = new URLSearchParams({
      branchId: String(branchId),
      date,
      times: timesKey,
      durationMinutes: String(durationMinutes),
      isRmt: String(isRmt),
      publicBooking: 'true',
    });
    fetch(`/api/booking?view=available-therapists&${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || `Server returned status ${response.status}`);
        if (!data.therapistIdsByTime || typeof data.therapistIdsByTime !== 'object' || Array.isArray(data.therapistIdsByTime)) {
          throw new Error('Therapist availability could not be verified. Refresh and try again.');
        }
        if (!data.unassignedTherapistCountByTime || typeof data.unassignedTherapistCountByTime !== 'object' ||
            Array.isArray(data.unassignedTherapistCountByTime)) {
          throw new Error('Therapist availability could not be verified. Refresh and try again.');
        }
        const therapistIdsByTime = Object.fromEntries(times.map((time) => {
          const ids = data.therapistIdsByTime[time];
          const unassignedCount = data.unassignedTherapistCountByTime[time];
          if (!Array.isArray(ids) || !ids.every((id: unknown) => typeof id === 'string' || typeof id === 'number') ||
              !Number.isInteger(unassignedCount) || unassignedCount < 0) {
            throw new Error('Therapist availability could not be verified. Refresh and try again.');
          }
          return [time, ids.map(String)];
        }));
        const unassignedTherapistCountByTime = Object.fromEntries(times.map((time) => [
          time, data.unassignedTherapistCountByTime[time],
        ]));
        const bookingCutoffsByTime = Object.fromEntries(times.map((time) => {
          const cutoff = data.bookingCutoffsByTime?.[time];
          if (!Number.isFinite(cutoff)) {
            throw new Error('Booking notice could not be verified. Refresh and try again.');
          }
          return [time, cutoff];
        }));
        if (!controller.signal.aborted) {
          setNow(Date.now());
          setState({ key: requestKey, therapistIdsByTime, unassignedTherapistCountByTime, bookingCutoffsByTime, loading: false, error: '' });
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key: requestKey,
            therapistIdsByTime: {},
            unassignedTherapistCountByTime: {},
            bookingCutoffsByTime: {},
            loading: false,
            error: requestError instanceof Error ? requestError.message : 'Therapist availability could not be verified. Refresh and try again.',
          });
        }
      });
    return () => controller.abort();
  }, [branchId, date, timesKey, durationMinutes, isRmt, requestKey]);

  const current = state.key === requestKey;
  return {
    therapistIdsByTime: current ? Object.fromEntries(times.map((time) => [
      time, state.bookingCutoffsByTime[time] >= now ? state.therapistIdsByTime[time] : [],
    ])) : {},
    unassignedTherapistCountByTime: current ? Object.fromEntries(times.map((time) => [
      time, state.bookingCutoffsByTime[time] >= now ? state.unassignedTherapistCountByTime[time] : 0,
    ])) : {},
    loading: !current || state.loading,
    error: current ? state.error : '',
  };
}

export default function useTherapistAvailability({ branchId, date, time, durationMinutes, isRmt, excludeBookingId }: AvailabilityRequest) {
  const [therapistIds, setTherapistIds] = useState<Set<string>>(() => new Set());
  const [unavailableTherapists, setUnavailableTherapists] = useState<UnavailableTherapist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setUnavailableTherapists([]);
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
      staffBooking: 'true',
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
        if (data.unavailableTherapists !== undefined && (!Array.isArray(data.unavailableTherapists) ||
            !data.unavailableTherapists.every((item: { id?: unknown; name?: unknown; reason?: unknown; conflicts?: unknown } | null) =>
              item && (typeof item.id === 'string' || typeof item.id === 'number') &&
              typeof item.name === 'string' && typeof item.reason === 'string' &&
              (item.conflicts === undefined || Array.isArray(item.conflicts) && item.conflicts.every(isAvailabilityConflict))))) {
          throw new Error('Therapist availability could not be verified. Refresh and try again.');
        }
        if (!controller.signal.aborted) {
          setTherapistIds(new Set(data.therapistIds.map(String)));
          setUnavailableTherapists(data.unavailableTherapists ?? []);
        }
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

  return { therapistIds, unavailableTherapists, loading, error };
}
