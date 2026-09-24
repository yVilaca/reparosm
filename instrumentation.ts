import { validateEnv } from '@/lib/env';

export function register() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  validateEnv();
}
