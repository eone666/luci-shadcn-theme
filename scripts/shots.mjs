#!/usr/bin/env node
/*
 * Test bench screenshots: logs into LuCI and captures the pages worth looking
 * at. Needed because LuCI views render on the client — curl only sees the
 * theme's shell, not the tables, modals and widgets.
 *
 *   node scripts/shots.mjs                     # every page, dark variant
 *   node scripts/shots.mjs system dashboard    # only these
 *   node scripts/shots.mjs --light             # the light variant
 *   node scripts/shots.mjs --out docs/img      # somewhere other than shots/
 *   node scripts/shots.mjs --width 420 system  # a phone-sized viewport
 *   node scripts/shots.mjs --viewport system   # crop to the viewport, no full page
 */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { PAGES, open, login, settle, go, switchTheme } from './lib/bench.mjs';

const root = resolve(import.meta.dirname, '..');

const argv = process.argv.slice(2);
let light = false, width = 1440, height = 1000, dir = 'shots', suffix = null;
let fullPage = true;
const want = [];
for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	if (a === '--light') light = true;
	else if (a === '--viewport') fullPage = false;
	else if (a === '--width') width = Number(argv[++i]);
	else if (a === '--height') height = Number(argv[++i]);
	else if (a === '--out') dir = argv[++i];
	else if (a === '--suffix') suffix = argv[++i];
	else if (a.startsWith('--')) {
		console.error(`unknown option ${a}`);
		process.exit(1);
	} else want.push(a);
}
if (suffix === null) suffix = light ? '-light' : '';
const out = resolve(root, dir);
const list = want.length ? want : Object.keys(PAGES);

mkdirSync(out, { recursive: true });
switchTheme(light ? 'shadcnui-light' : 'shadcnui-dark');

const { browser, page } = await open({ light, width, height });

/* Anything the browser complains about is worth seeing -- except the 403 LuCI
   answers an unauthenticated request with, which is how it serves the login
   page in the first place. */
const problems = [];
const expected = (url, status) => status === 403 && /\/cgi-bin\/luci\/?$/.test(url);
page.on('console', (m) => {
	if (m.type() === 'error' && !/403/.test(m.text()))
		problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on('requestfailed', (r) => problems.push(`failed: ${r.url().slice(0, 160)}`));
page.on('response', (r) => {
	if (r.status() >= 400 && !expected(r.url(), r.status()) &&
	    !r.url().includes('/cgi-bin/luci/admin'))
		problems.push(`${r.status()}: ${r.url().slice(0, 160)}`);
});

const shoot = async (name) => {
	await page.screenshot({ path: join(out, `${name}${suffix}.png`), fullPage });
	console.log(name);
};

await login(page, {
	// the login screen only exists before we log in
	before: list.includes('login') ? async (p) => { await settle(p); await shoot('login'); } : null,
});

for (const name of list) {
	if (name === 'login') continue;
	const spec = PAGES[name];
	if (!spec) { console.log(`${name}: no such page`); continue; }
	try {
		await go(page, spec.url);
		await shoot(name);
	} catch (e) {
		console.log(`${name}: ${e.message.split('\n')[0]}`);
	}
}

await browser.close();

if (problems.length) {
	console.log('\nbrowser problems:');
	for (const p of [...new Set(problems)].slice(0, 25)) console.log(`  ${p}`);
}
console.log(`\nscreenshots: ${out}`);
