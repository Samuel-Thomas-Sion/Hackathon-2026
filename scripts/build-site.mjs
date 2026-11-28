// Copies only the public website files into dist/ (what Cloudflare Pages serves).
// Server code (/server, /functions), Python backend code and secrets are NOT copied.
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

const PUBLIC_FILES = [
  'indexOP.html',
  'indexOP-v2.html',
  'scanner.html',
  'presentation.html',
  'teen.html',
  'teen.js',
  'slides.html',
  'slides.js',
  'clauseguard-config.js',
  'clauseguard-api.js',
  'clauseguard-static.js',
  'upfront.js',
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of PUBLIC_FILES) {
  await cp(join(root, file), join(dist, file));
}
await cp(join(root, 'data'), join(dist, 'data'), { recursive: true });
await mkdir(join(dist, 'backend'), { recursive: true });
await cp(join(root, 'backend', 'knowledge_contract_law.json'), join(dist, 'backend', 'knowledge_contract_law.json'));

// The main address (/) shows v1, the team's original page.
// v2 (teen-first, with Teen Check) lives at /teencheck. Pages serves teen.html at /teen.
await cp(join(root, 'indexOP.html'), join(dist, 'index.html'));
await cp(join(root, 'indexOP-v2.html'), join(dist, 'teencheck.html'));

// Basic safety headers for every page.
await writeFile(
  join(dist, '_headers'),
  ['/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '  X-Frame-Options: DENY', '  Permissions-Policy: camera=(), microphone=(), geolocation=()', ''].join('\n')
);

const count = (await readdir(dist, { recursive: true })).length;
console.log(`Built dist/ with ${count} files.`);
