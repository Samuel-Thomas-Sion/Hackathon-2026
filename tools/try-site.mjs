// Try the terms reader on real websites, without using any AI.
// Usage:  node tools/try-site.mjs instagram.com discord.com roblox
import { readFile } from 'node:fs/promises';
import { fetchSiteTerms } from '../server/terms.js';

const popular = JSON.parse(await readFile(new URL('../data/popular-sites.json', import.meta.url), 'utf8'));
const sites = process.argv.slice(2);
if (!sites.length) {
  console.log('Usage: node tools/try-site.mjs <site> [<site> ...]');
  process.exit(1);
}

for (const site of sites) {
  const started = Date.now();
  try {
    const result = await fetchSiteTerms(site, popular);
    const summary = result.pages.map((p) => `${p.kind}: ${p.text.length} chars from ${p.url}`).join('\n    ') || 'NOTHING READABLE (would fall back to saved copy or "paste the terms")';
    console.log(`${site} -> ${result.host} (${((Date.now() - started) / 1000).toFixed(1)}s)\n    ${summary}`);
  } catch (error) {
    console.log(`${site} -> REJECTED: ${error.detail || error.message}`);
  }
}
