// pnpm admin:hash <senha> — prints ADMIN_PASSWORD_HASH for .env (escaped) and for Vercel (raw).
// Next expands $VAR in .env, so an unescaped pbkdf2$100000$… is read as just "pbkdf2".
import { passwordHash } from '../lib/security.ts';

const password = process.argv[2];
if (!password) {
  console.error('Uso: pnpm admin:hash <senha>');
  process.exit(1);
}
const hash = await passwordHash('adminreparosm', password);
console.log(`.env:   ADMIN_PASSWORD_HASH=${hash.replaceAll('$', '\\$')}`);
console.log(`Vercel: ${hash}`);
