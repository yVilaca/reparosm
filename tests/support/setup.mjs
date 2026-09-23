// Loaded with `node --import`: lets tests import app code that uses the `@/` path alias.
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
