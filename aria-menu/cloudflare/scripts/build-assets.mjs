// Copies exactly the public files of aria-menu/ into cloudflare/public/.
// Nothing else (server.py, backend/, data/, tests/) is ever published.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..');        // aria-menu/
const target = join(here, '..', 'public');    // cloudflare/public/

const FILES = [
  'index.html', 'admin.html', 'admin.js', 'admin.css', 'super.html', 'super.js', 'app.js', 'menu-data.js',
  'styles.css', 'themes.css', 'themes.js', 'seasonal.css', 'seasonal-art.js',
  'winter.css', 'winter-art.js', 'winter-effects.js',
  'atmosphere.css', 'atmosphere-art.js', 'atmosphere-effects.js',
];
const DIRECTORIES = ['assets'];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of FILES) {
  await stat(join(source, file)); // throws if a required file is missing
  await cp(join(source, file), join(target, file));
}
for (const dir of DIRECTORIES) {
  await cp(join(source, dir), join(target, dir), { recursive: true });
}
console.log(`public assets: ${FILES.length} files and ${DIRECTORIES.join(', ')}/ -> ${target}`);
