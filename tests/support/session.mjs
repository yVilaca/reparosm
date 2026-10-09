// Abre uma sessão para uma loja criada direto no banco do teste. Quem entra é
// um usuário dela (Dono, por padrão), criado aqui se ainda não existir.
export async function sessionCookie(db, username, accountId, role = 'owner') {
  const { createSession } = await import('../../lib/repos/sessions.ts');
  const userId = `user-${username}`;
  await db.migrationQuery(
    `INSERT INTO users (id, account_id, username, name, role, password_hash)
     VALUES ($1, $2, $3, $3, $4, 'unused')
     ON CONFLICT (id) DO NOTHING`,
    [userId, accountId, username, role],
  );
  const token = await createSession(
    username,
    { id: userId, accountId },
    { userAgent: 'test', ip: 'test' },
  );
  return `reparosm_session=${token}`;
}
