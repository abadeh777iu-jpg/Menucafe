// Creates the seller's super-admin account and prints SQL for `wrangler d1 execute --file`.
// The password is read from stdin, never from the command line.
// Usage:
//   echo 'the-password' | node scripts/make-superadmin.mjs --username seller > super.sql
//   npx wrangler d1 execute menucafe --remote --file super.sql
//   rm super.sql
import { readFileSync } from 'node:fs';
import { cleanUsername } from '../src/store.js';
import { hashPassword, passwordIterations, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, codePointLength } from '../src/security.js';
import { insert } from './sql.mjs';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return process.argv[index + 1];
}

const username = cleanUsername(arg('username'));
const password = readFileSync(0, 'utf8').split(/\r?\n/)[0];
const length = codePointLength(password);
if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
  throw new Error(`password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
}
const iterations = passwordIterations({ PASSWORD_ITERATIONS: process.env.PASSWORD_ITERATIONS });
const hash = await hashPassword(password, iterations);
process.stdout.write(insert('super_admins', {
  username, password_hash: hash, created_at: Math.floor(Date.now() / 1000),
}) + '\n');
process.stderr.write(`super admin ${username} created (hash uses ${iterations} iterations)\n`);
