import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), root);
    for (const candidate of [`${base.href}.ts`, `${base.href}.tsx`, base.href]) {
      if (existsSync(fileURLToPath(candidate))) return next(candidate, context);
    }
  }
  return next(specifier, context);
}
