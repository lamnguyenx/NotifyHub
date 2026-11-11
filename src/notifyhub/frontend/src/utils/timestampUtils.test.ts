import { describe, expect, it } from 'bun:test';

import { formatRelativeTime } from './timestampUtils';

const now = new Date(2025, 11, 30, 12, 0, 0);

describe('formatRelativeTime', () => {
  it('returns "now" for timestamps less than 60 seconds ago', () => {
    const thirtySecondsAgo = new Date(now.getTime() - 30_000);
    expect(formatRelativeTime(thirtySecondsAgo.toISOString(), now)).toBe('now');
  });

  it('returns "Xm ago" for timestamps 1-59 minutes ago', () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo.toISOString(), now)).toBe('5m ago');

    const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60 * 1000);
    expect(formatRelativeTime(fiftyNineMinutesAgo.toISOString(), now)).toBe('59m ago');
  });

  it('returns "Xh ago" for timestamps earlier the same day', () => {
    const late = new Date(2025, 11, 30, 23, 0, 0);
    const twoHoursAgo = new Date(late.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo.toISOString(), late)).toBe('2h ago');

    const twentyThreeHoursAgo = new Date(late.getTime() - 23 * 60 * 60 * 1000);
    expect(formatRelativeTime(twentyThreeHoursAgo.toISOString(), late)).toBe('23h ago');
  });

  it('returns "Yesterday" for a previous-day timestamp even under 24 hours', () => {
    const yesterdayEvening = new Date(2025, 11, 29, 23, 0, 0);
    expect(formatRelativeTime(yesterdayEvening.toISOString(), now)).toBe('Yesterday');
  });

  it('returns date format for timestamps older than 2 days', () => {
    const threeDaysAgo = new Date(2025, 11, 27, 12, 0, 0);
    expect(formatRelativeTime(threeDaysAgo.toISOString(), now)).toBe('12/27/25');
  });

  it('handles exactly 60 seconds', () => {
    const sixtySecondsAgo = new Date(now.getTime() - 60_000);
    expect(formatRelativeTime(sixtySecondsAgo.toISOString(), now)).toBe('1m ago');
  });

  it('handles midnight transitions', () => {
    const afterMidnight = new Date(2025, 11, 30, 0, 30, 0);
    const beforeMidnight = new Date(2025, 11, 29, 23, 30, 0);
    expect(formatRelativeTime(beforeMidnight.toISOString(), afterMidnight)).toBe('Yesterday');
  });

  it('treats future timestamps as "now"', () => {
    const future = new Date(now.getTime() + 60_000);
    expect(formatRelativeTime(future.toISOString(), now)).toBe('now');
  });
});
