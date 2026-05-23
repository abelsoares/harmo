import { parseAppleTimestamp } from '@src/normalize/apple/timestamp';
import { describe, expect, it } from 'vitest';

describe('parseAppleTimestamp', () => {
  it('parses a +0100 timestamp into UTC instant + offset', () => {
    const result = parseAppleTimestamp('2024-12-30 22:36:38 +0100');

    expect(result.offsetMinutes).toBe(60);
    expect(result.utc.toISOString()).toBe('2024-12-30T21:36:38.000Z');
  });

  it('parses a +0000 timestamp', () => {
    const result = parseAppleTimestamp('2024-11-05 01:52:07 +0000');

    expect(result.offsetMinutes).toBe(0);
    expect(result.utc.toISOString()).toBe('2024-11-05T01:52:07.000Z');
  });

  it('parses a negative offset', () => {
    const result = parseAppleTimestamp('2024-06-01 09:00:00 -0500');

    expect(result.offsetMinutes).toBe(-300);
    expect(result.utc.toISOString()).toBe('2024-06-01T14:00:00.000Z');
  });

  it('handles partial-hour offsets (e.g. +0530)', () => {
    const result = parseAppleTimestamp('2024-03-15 12:00:00 +0530');

    expect(result.offsetMinutes).toBe(330);
    expect(result.utc.toISOString()).toBe('2024-03-15T06:30:00.000Z');
  });

  it('parses across DST boundary in Lisbon (last spring-forward instant)', () => {
    // 2024-03-31 01:59:59 +0000 is the last second of WET before WEST starts (skip to 02:00 -> 03:00 local).
    // The Apple format records actual offset at sample time, so a sample one second later would be +0100.
    const before = parseAppleTimestamp('2024-03-31 01:59:59 +0000');
    const after = parseAppleTimestamp('2024-03-31 03:00:00 +0100');

    expect(after.utc.getTime() - before.utc.getTime()).toBe(1000);
  });

  it('throws on malformed input', () => {
    expect(() => parseAppleTimestamp('2024/12/30 22:36:38 +0100')).toThrow(/invalid apple timestamp/);
    expect(() => parseAppleTimestamp('2024-12-30T22:36:38+0100')).toThrow(/invalid apple timestamp/);
    expect(() => parseAppleTimestamp('not a date')).toThrow(/invalid apple timestamp/);
    expect(() => parseAppleTimestamp('')).toThrow(/invalid apple timestamp/);
  });
});
