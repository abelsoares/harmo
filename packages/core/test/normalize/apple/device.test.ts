import { parseAppleDevice } from '@src/normalize/apple/device';
import { describe, expect, it } from 'vitest';

describe('parseAppleDevice', () => {
  it('parses a full HKDevice string from an Apple Watch', () => {
    const raw =
      '<<HKDevice: 0x7760935a0>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,9, software:11.1, creation date:2024-11-05 01:52:07 +0000>';

    expect(parseAppleDevice(raw)).toEqual({
      name: 'Apple Watch',
      manufacturer: 'Apple Inc.',
      model: 'Watch',
      hardware: 'Watch7,9',
      software: '11.1'
    });
  });

  it('parses an iPhone HKDevice string', () => {
    const raw =
      '<<HKDevice: 0x600000ca7180>, name:iPhone, manufacturer:Apple Inc., model:iPhone, hardware:iPhone15,3, software:18.5>';

    expect(parseAppleDevice(raw)).toEqual({
      name: 'iPhone',
      manufacturer: 'Apple Inc.',
      model: 'iPhone',
      hardware: 'iPhone15,3',
      software: '18.5'
    });
  });

  it('returns null for empty/undefined input', () => {
    expect(parseAppleDevice(undefined)).toBeNull();
    expect(parseAppleDevice(null)).toBeNull();
    expect(parseAppleDevice('')).toBeNull();
  });

  it('returns partial fields when some are missing', () => {
    const raw = '<<HKDevice: 0x123>, name:Some Device, software:1.0>';

    expect(parseAppleDevice(raw)).toEqual({
      name: 'Some Device',
      manufacturer: null,
      model: null,
      hardware: null,
      software: '1.0'
    });
  });

  it('returns all-null when no recognizable keys are present', () => {
    expect(parseAppleDevice('<<HKDevice: 0x123>>')).toEqual({
      name: null,
      manufacturer: null,
      model: null,
      hardware: null,
      software: null
    });
  });
});
