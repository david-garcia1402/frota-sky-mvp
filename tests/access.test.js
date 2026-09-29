import test from 'node:test';
import assert from 'node:assert/strict';
import {
  andIn,
  assertUsername,
  isOperator,
  loginIdentifier,
  normalizeUsername,
  operatorEmail,
  publicEmail,
  sqlIn,
} from '../worker/lib/access.js';

test('normaliza usuário para minúsculas sem espaços', () => {
  assert.equal(normalizeUsername('  Zeca.Silva '), 'zeca.silva');
});

test('aceita usuário curto e rejeita e-mail ou símbolo', () => {
  assert.equal(assertUsername('zeca'), 'zeca');
  assert.equal(assertUsername('joao_01'), 'joao_01');
  assert.throws(() => assertUsername('ab'), /3 a 32/);
  assert.throws(() => assertUsername('zeca@frota.com'), /3 a 32/);
  assert.throws(() => assertUsername('.zeca'), /3 a 32/);
});

test('e-mail interno do operador não aparece na conta', () => {
  assert.equal(publicEmail(operatorEmail('zeca')), null);
  assert.equal(publicEmail('joao@empresa.com'), 'joao@empresa.com');
  assert.equal(publicEmail(null), null);
});

test('login aceita e-mail, usuário ou campo login', () => {
  assert.equal(loginIdentifier({ email: ' Joao@Empresa.com ' }), 'joao@empresa.com');
  assert.equal(loginIdentifier({ username: 'Zeca' }), 'zeca');
  assert.equal(loginIdentifier({ login: 'motorista' }), 'motorista');
  assert.equal(loginIdentifier({ username: 'zeca', email: 'outro@empresa.com' }), 'zeca');
});

test('só o papel driver é operador', () => {
  assert.equal(isOperator({ role: 'driver' }), true);
  assert.equal(isOperator({ role: 'manager' }), false);
  assert.equal(isOperator(null), false);
});

test('filtro de veículos do operador não vaza a frota', () => {
  assert.deepEqual(andIn('v.id', null), { sql: '', binds: [] });
  assert.deepEqual(andIn('v.id', []), { sql: ' AND 0', binds: [] });
  assert.deepEqual(sqlIn('v.id', ['veh_a', 'veh_b']), {
    sql: 'v.id IN (?,?)',
    binds: ['veh_a', 'veh_b'],
  });
});
