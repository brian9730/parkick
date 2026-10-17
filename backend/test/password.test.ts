import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { it } from 'node:test';
import { hashPassword, verifyPassword } from '../src/services/admin/password.js';

it('uses salted scrypt and rejects the wrong password', async () => {
  const password = randomBytes(24).toString('base64url');
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
});
