// Starts a fresh local Worker (new D1 database), creates test owners, runs test/api.test.mjs, and stops it.
// Nothing here touches Cloudflare's network; everything runs in this machine's workerd + SQLite.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'owner-pass-123';
const persist = mkdtempSync(join(tmpdir(), 'menucafe-d1-'));
const port = await new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const { port: free } = server.address();
    server.close(() => resolve(free));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

let worker = null;
function stopWorker() {
  if (worker && !worker.killed) worker.kill('SIGTERM');
}

async function waitForWorker(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/restaurants/aria/menu`);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('worker did not start in time');
}

let exitCode = 1;
try {
  run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'menucafe', '--local', '--persist-to', persist]);
  for (const [restaurant, username] of [['aria', 'aria.owner'], ['bahar', 'bahar.owner']]) {
    const sql = run('node', ['scripts/make-owner.mjs', '--restaurant', restaurant, '--username', username],
      { input: `${PASSWORD}\n` });
    const file = join(persist, `${username}.sql`);
    writeFileSync(file, sql, 'utf8');
    run('npx', ['wrangler', 'd1', 'execute', 'menucafe', '--local', '--persist-to', persist, '--file', file]);
  }
  worker = spawn('npx', ['wrangler', 'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--persist-to', persist], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  worker.stdout.on('data', () => {});
  worker.stderr.on('data', () => {});
  await waitForWorker();
  const tests = spawnSync(process.execPath, ['--test', 'test/api.test.mjs'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, BASE_URL: baseUrl, OWNER_PASSWORD: PASSWORD },
  });
  exitCode = tests.status ?? 1;
} catch (error) {
  console.error(error.message);
} finally {
  stopWorker();
  rmSync(persist, { recursive: true, force: true });
}
process.exit(exitCode);
