import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const records = new Map();
const db = {
  getRecord: async id => records.get(id) || null,
  listRecords: async type => [...records.values()].filter(r => !type || r.type === type),
  saveRecord: async (id, type, data) => { const r = {id, type, data}; records.set(id, r); return r; },
  deleteRecord: async id => records.delete(id),
};
function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => { if (!(name in imports)) throw Error(name); return imports[name]; }, exports);
  return exports;
}
const security = load('lib/security.ts');
process.env.ADMIN_PASSWORD_HASH=await security.passwordHash('adminreparosm','TestAdminPassword123');
const auth = load('lib/auth.ts', {'@/lib/db': db, '@/lib/security': security});
const routes = load('app/api/auth/route.ts', {'@/lib/db': db, '@/lib/auth': auth});
const accounts = load('app/api/accounts/route.ts', {'@/lib/db': db, '@/lib/auth': auth});
const request = (body, cookie = '', origin = 'https://test.local') => new Request('https://test.local/api/auth', {method: 'POST', headers: {'Content-Type': 'application/json', origin, cookie}, body: JSON.stringify(body)});
const post = (body, cookie) => routes.POST(request(body, cookie));
for(let i=0;i<7;i++)assert.equal((await post({action:'login',username:'adminreparosm',password:'wrong'})).status,401);
assert.equal((await post({action:'login',username:'admin',password:'admin'})).status,401);
let response = await post({action: 'login', username: 'adminreparosm', password: 'TestAdminPassword123'});
assert.equal(response.status, 200);
const adminCookie = response.headers.get('set-cookie').split(';')[0];
assert.equal((await response.json()).account.mustChangePassword, false);
response = await accounts.POST(request({username: 'testmerchant', name: 'Test', password: 'Testpassword123'}, adminCookie));
assert.equal(response.status, 201);
const accountId = (await response.json()).account.id;
assert.equal((await accounts.GET(request({}))).status, 403);
response = await post({action: 'forgot-password', username: 'testmerchant'});
const generic = await response.json();
assert.equal(response.status, 200);
assert.deepEqual(await (await post({action: 'forgot-password', username: 'unknown'})).json(), generic);
await post({action: 'forgot-password', username: 'testmerchant'});
assert.equal((await db.listRecords('password-request')).length, 1);
let queue = await (await accounts.GET(request({}, adminCookie))).json();
assert.equal(queue.requests.length, 1);
response = await post({action: 'login', username: 'testmerchant', password: 'Testpassword123'});
const merchantCookie = response.headers.get('set-cookie').split(';')[0];
assert.equal((await accounts.GET(request({}, merchantCookie))).status, 403);
const reset = {action: 'reset-password', id: accountId, password: 'Newpassword123'};
assert.equal((await accounts.POST(request(reset, adminCookie))).status, 400);
assert.equal((await accounts.POST(request({...reset, identityConfirmed: true}, merchantCookie))).status, 403);
assert.equal((await accounts.POST(request({...reset, identityConfirmed: true}, adminCookie))).status, 200);
assert.equal(await auth.currentAccount(request({}, merchantCookie)), null);
assert.equal((await post({action: 'login', username: 'testmerchant', password: 'Testpassword123'})).status, 401);
assert.equal((await post({action: 'login', username: 'testmerchant', password: 'Newpassword123'})).status, 200);
queue = await (await accounts.GET(request({}, adminCookie))).json();
assert.equal(queue.requests.length, 0);
assert.equal((await routes.POST(request({action: 'forgot-password', username: 'testmerchant'}, '', 'https://attacker.local'))).status, 403);
assert.equal((await post({action: 'change-password'}, adminCookie)).status, 400);
assert.equal((await accounts.POST(request({...reset, id: 'account-admin', identityConfirmed: true}, adminCookie))).status, 400);
console.log('PASS: admin login, merchant creation, private queue, deduplication, identity confirmation, password reset, session revocation, origin checks. In-memory data only.');
