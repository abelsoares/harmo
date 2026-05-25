import { HarmoClient } from '@harmo/api-client';

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4001';

export const client = new HarmoClient({ baseUrl });
export const SUBJECT_ID = 'default';
