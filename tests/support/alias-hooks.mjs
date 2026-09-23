import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const isFile = (url) => statSync(fileURLToPath(url), { throwIfNoEntry: false })?.isFile();

// Resolves `@/x` like Next.js does: x.ts, x.tsx, x/index.ts, or x itself.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), root).href;
    const found = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find(isFile);
    if (found) return next(found, context);
  }
  return next(specifier, context);
}
