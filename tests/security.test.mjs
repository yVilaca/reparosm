import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyPasswordHash, passwordHash, passwordProblem, verifyPassword } from '../lib/security.ts';

test('passwords use a salted PBKDF2 hash',async()=>{
  const one=await passwordHash('loja','MinhaSenha123'),two=await passwordHash('loja','MinhaSenha123');
  assert.match(one,/^pbkdf2\$100000\$/);assert.notEqual(one,two);
  assert.equal((await verifyPassword('loja','MinhaSenha123',one)).valid,true);
  assert.equal((await verifyPassword('loja','senha-errada',one)).valid,false);
});

test('legacy hashes remain valid only for safe migration',async()=>{
  const old=await legacyPasswordHash('admin','admin');const result=await verifyPassword('admin','admin',old);
  assert.deepEqual(result,{valid:true,legacy:true});
});

test('weak passwords are rejected',()=>{
  assert.ok(passwordProblem('curta1'));assert.ok(passwordProblem('abcdefghij'));assert.ok(passwordProblem('1234567890'));assert.equal(passwordProblem('ReparoSeguro2026'),'');
});
