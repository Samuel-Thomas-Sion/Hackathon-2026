// Locks the presentation with a password, for the /slides page.
//
//   npm run lock-deck            (asks for the password, hidden while you type)
//
// It reads the slide pictures + speaker notes from ../deck-source (OUTSIDE this
// repository, so the readable slides never go to GitHub), encrypts them with
// AES-256-GCM using a key made from your password (PBKDF2, 310,000 rounds), and
// writes data/locked-deck.json. Only someone with the password can open it.
// The password itself is never saved anywhere. To change it, run this again.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = process.argv[2] || join(root, '..', 'deck-source');
const outFile = join(root, 'data', 'locked-deck.json');
const ITERATIONS = 310000;

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(1);
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
      } else {
        value += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

let password = process.env.DECK_PASSWORD;
if (!password) {
  password = await askHidden('Choose a password for the presentation: ');
  const again = await askHidden('Type it again: ');
  if (password !== again) {
    console.error('The two passwords are different. Nothing was changed.');
    process.exit(1);
  }
}
if (password.length < 8) {
  console.error('Please use at least 8 characters (longer is safer). Nothing was changed.');
  process.exit(1);
}

const files = (await readdir(sourceDir)).filter((f) => /^slide\d+\.(png|jpe?g|webp)$/i.test(f)).sort();
if (!files.length) {
  console.error(`No slide pictures found in ${sourceDir}`);
  process.exit(1);
}
let notes = [];
let title = 'Presentation';
try {
  const meta = JSON.parse(await readFile(join(sourceDir, 'notes.json'), 'utf8'));
  notes = meta.notes || [];
  title = meta.title || title;
} catch {
  /* notes are optional */
}

const slides = [];
for (const [i, f] of files.entries()) {
  const type = f.toLowerCase().endsWith('.png') ? 'image/png' : f.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  slides.push({ img: `data:${type};base64,${b64(await readFile(join(sourceDir, f)))}`, notes: notes[i] || '' });
}
const plain = new TextEncoder().encode(JSON.stringify({ title, slides }));

const { subtle } = globalThis.crypto;
const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
const baseKey = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));

await writeFile(outFile, JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }));
console.log(`Locked ${slides.length} slides into data/locked-deck.json (${Math.round(data.length / 1024)} KB).`);
