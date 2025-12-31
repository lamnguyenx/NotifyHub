import { formatTimestamp } from './timestampUtils';

describe('formatTimestamp', () => {
  const mockNow = new Date('2025-12-30T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "now" for timestamps less than 60 seconds ago', () => {
    const thirtySecondsAgo = new Date(mockNow.getTime() - 30000).toISOString();
    expect(formatTimestamp(thirtySecondsAgo)).toBe('now');
  });

  it('returns "Xm ago" for timestamps 1-59 minutes ago', () => {
    const fiveMinutesAgo = new Date(mockNow.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatTimestamp(fiveMinutesAgo)).toBe('5m ago');

    const fiftyNineMinutesAgo = new Date(mockNow.getTime() - 59 * 60 * 1000).toISOString();
    expect(formatTimestamp(fiftyNineMinutesAgo)).toBe('59m ago');
  });

  it('returns "Xh ago" for timestamps 1-23 hours ago', () => {
    const twoHoursAgo = new Date(mockNow.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(twoHoursAgo)).toBe('2h ago');

    const twentyThreeHoursAgo = new Date(mockNow.getTime() - 23 * 60 * 60 * 1000).toISOString();
    expect(formatTimestamp(twentyThreeHoursAgo)).toBe('23h ago');
  });

  it('returns "Yesterday" for timestamps from the previous calendar day', () => {
    const yesterday = new Date(mockNow);
    yesterday.setDate(mockNow.getDate() - 1);
    yesterday.setHours(15, 0, 0, 0); // 3 PM yesterday
    expect(formatTimestamp(yesterday.toISOString())).toBe('Yesterday');
  });

  it('returns date format for timestamps older than 2 days', () => {
    const threeDaysAgo = new Date(mockNow);
    threeDaysAgo.setDate(mockNow.getDate() - 3);
    expect(formatTimestamp(threeDaysAgo.toISOString())).toBe('12/27/25');
  });

  it('handles edge case of exactly 60 seconds', () => {
    const sixtySecondsAgo = new Date(mockNow.getTime() - 60000).toISOString();
    expect(formatTimestamp(sixtySecondsAgo)).toBe('1m ago');
  });

  it('handles midnight transition correctly', () => {
    // Set mock time to just after midnight
    const afterMidnight = new Date('2025-12-30T00:30:00Z');
    jest.setSystemTime(afterMidnight);

    // Notification from just before midnight yesterday
    const beforeMidnight = new Date('2025-12-29T23:30:00Z');
    expect(formatTimestamp(beforeMidnight.toISOString())).toBe('Yesterday');
  });
});