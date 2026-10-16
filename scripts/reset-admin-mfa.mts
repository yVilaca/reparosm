import { fileURLToPath } from 'node:url';
import type { Query } from '../lib/db.ts';
import { clearUserMfa } from '../lib/repos/auth-security.ts';
import { closeMigrationDatabase, migrationTransaction } from './migration-db.mjs';

const ADMIN_USER_ID = 'user-adminreparosm';

export function adminMfaResetTarget(args: string[]) {
  return args.length === 4 &&
    args[0] === '--user' &&
    args[1] === ADMIN_USER_ID &&
    args[2] === '--confirm' &&
    args[3] === ADMIN_USER_ID
    ? ADMIN_USER_ID
    : null;
}

async function main() {
  const target = adminMfaResetTarget(process.argv.slice(2));
  if (!target) {
    throw new Error(
      `Confirmação inválida. Use --user ${ADMIN_USER_ID} --confirm ${ADMIN_USER_ID}.`,
    );
  }
  await migrationTransaction(async (run: Query) => {
    const [admin] = await run(
      `SELECT id FROM users
       WHERE id = $1 AND username = 'adminreparosm' AND account_id = 'account-admin'`,
      [target],
    );
    if (!admin) throw new Error('Administrador protegido não encontrado.');
    await clearUserMfa(target, run);
  });
  console.log('MFA do administrador removido; todas as sessões foram encerradas.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Falha ao remover o MFA.');
      process.exitCode = 1;
    })
    .finally(closeMigrationDatabase);
}
