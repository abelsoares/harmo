// Parses Apple's HKDevice attribute, which looks like:
//   <<HKDevice: 0x7760935a0>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,9, software:11.1, creation date:2024-11-05 01:52:07 +0000>
// Field values can contain commas ("Watch7,9") and spaces, so we extract each key with a lazy
// match that stops at the next known key (rather than naively splitting on commas).

export type AppleDevice = {
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  hardware: string | null;
  software: string | null;
};

const KNOWN_KEYS = ['name', 'manufacturer', 'model', 'hardware', 'software', 'creation date'] as const;
type DeviceKey = (typeof KNOWN_KEYS)[number];
const KNOWN_KEYS_ALTERNATION = KNOWN_KEYS.map(k => k.replace(/ /g, '\\s')).join('|');

function pickField(input: string, key: DeviceKey): string | null {
  const pattern = new RegExp(`${key}:(.*?)(?=,\\s*(?:${KNOWN_KEYS_ALTERNATION}):|>\\s*$)`);
  const match = pattern.exec(input);

  return match ? match[1].trim() : null;
}

export function parseAppleDevice(input: string | undefined | null): AppleDevice | null {
  if (!input) {
    return null;
  }

  return {
    name: pickField(input, 'name'),
    manufacturer: pickField(input, 'manufacturer'),
    model: pickField(input, 'model'),
    hardware: pickField(input, 'hardware'),
    software: pickField(input, 'software')
  };
}
