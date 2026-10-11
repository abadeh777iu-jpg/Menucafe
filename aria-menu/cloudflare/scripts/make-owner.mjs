// Creates an owner account for one restaurant and prints SQL for `wrangler d1 execute --file`.
// Usage (password is read from stdin, never from the command line):
//   echo 'the-password' | node scripts/make-owner.mjs --restaurant aria --username aria.owner > owner.sql
//   npx wrangler d1 execute menucafe --remote --file owner.sql
//   rm owner.sql
import { readFileSync } from 'node:fs';
import { cleanUsername, SLUG_RE } from '../src/store.js';
import { hashPassword, passwordIterations, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, codePointLength } from '../src/security.js';
import { insert } from './sql.mjs';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return process.argv[index + 1];
}

const restaurant = arg('restaurant');
if (!SLUG_RE.test(restaurant)) throw new Error('bad restaurant slug');
const username = cleanUsername(arg('username'));
const password = readFileSync(0, 'utf8').split(/\r?\n/)[0];
const length = codePointLength(password);
if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
  throw new Error(`password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
}
const iterations = passwordIterations({ PASSWORD_ITERATIONS: process.env.PASSWORD_ITERATIONS });
const hash = await hashPassword(password, iterations);
const stamp = Math.floor(Date.now() / 1000);
process.stdout.write(insert('users', {
  username, password_hash: hash, restaurant_slug: restaurant, created_at: stamp,
}) + '\n');
process.stderr.write(`owner ${username} for ${restaurant} (hash uses ${iterations} iterations)\n`);
