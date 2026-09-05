#!/usr/bin/env node
/*
 * Test bench screenshots: logs into LuCI and captures the "detector" pages.
 *
 * This is needed because LuCI views render on the client — curl only sees the
 * theme's shell, not the tables, modals and widgets. Browsers are taken from
 * the Playwright cache (playwright-core does not download them), so the script
 * works offline.
 *
 *   node scripts/shots.mjs                     # every page, theme from the bench
 *   node scripts/shots.mjs overview firewall   # only these
 *   node scripts/shots.mjs --light             # emulate a light OS colour scheme
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const OUT = resolve(root, 'shots');
const BASE = process.env.LUCI_URL ?? 'http://localhost:8080';
const USER = process.env.LUCI_USER ?? 'root';
const PASS = process.env.LUCI_PASS ?? 'openwrt';

/* Playwright cache: the directory version changes between releases, so we look
   it up ourselves. */
function chromePath() {
	const cache = join(homedir(), 'Library/Caches/ms-playwright');
	const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
	if (!dir) throw new Error(`no chromium found in ${cache}`);
	return join(cache, dir, 'chrome-mac-arm64',
		'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

const PAGES = {
	login: { url: '/cgi-bin/luci/', auth: false },
	dashboard: { url: '/cgi-bin/luci/admin/dashboard' },
	overview: { url: '/cgi-bin/luci/admin/status/overview' },
	interfaces: { url: '/cgi-bin/luci/admin/network/network' },
	/* wireless is missing on the bench: the container has no radios, so LuCI
	   does not register the menu entry and the page returns 404 */
	zones: { url: '/cgi-bin/luci/admin/network/firewall/zones' },
	dhcp: { url: '/cgi-bin/luci/admin/network/dhcp' },
	system: { url: '/cgi-bin/luci/admin/system/system' },
	packages: { url: '/cgi-bin/luci/admin/system/package-manager' },
	startup: { url: '/cgi-bin/luci/admin/system/startup' },
	routes: { url: '/cgi-bin/luci/admin/status/routes' },
};

const args = process.argv.slice(2);
const light = args.includes('--light');
const want = args.filter((a) => !a.startsWith('--'));
const list = want.length ? want : Object.keys(PAGES);

mkdirSync(OUT, { recursive: true });

/* The theme variants force the mode themselves (see darkpref in header.ut), so
   the browser's colorScheme has no effect on them — we switch the variant on the
   bench instead. */
const variant = light ? 'shadcn-light' : 'shadcn-dark';
try {
	execFileSync('docker', ['exec', process.env.LUCI_CONTAINER ?? 'luci-testbed', 'sh', '-c',
		`uci set luci.main.mediaurlbase=/luci-static/${variant} && uci commit luci`],
		{ stdio: 'ignore' });
} catch {
	console.log(`could not switch the theme to ${variant} — capturing as is`);
}

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
	deviceScaleFactor: 2,
	colorScheme: light ? 'light' : 'dark',
});
const page = await ctx.newPage();

/* Wait until the page has actually finished drawing: LuCI views render on the
   client, and a shot taken too early catches an intermediate state — up to a
   frame where the theme has not applied yet and the core shows its fallback. */
async function settle(page, extra = 1200) {
	await page.waitForLoadState('networkidle').catch(() => {});
	await page.waitForFunction(() => !document.querySelector('#view > .spinning'),
		{ timeout: 20000 }).catch(() => {});
	await page.waitForFunction(() => {
		// the theme has applied: the background comes from a token, not the
		// default transparent one
		const bg = getComputedStyle(document.body).backgroundColor;
		return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
	}, { timeout: 10000 }).catch(() => {});
	await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded',
		{ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(extra);
}

const problems = [];
page.on('console', (m) => {
	if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on('requestfailed', (r) => problems.push(`failed: ${r.url().slice(0, 160)}`));
page.on('response', (r) => {
	if (r.status() >= 400 && !r.url().includes('/cgi-bin/luci/admin'))
		problems.push(`${r.status()}: ${r.url().slice(0, 160)}`);
});

/* Login: the form lives in a modal raised by view/shadcn/sysauth.js */
await page.goto(`${BASE}/cgi-bin/luci/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="luci_username"]', { timeout: 15000 });
if (list.includes('login')) {
	await settle(page);
	await page.screenshot({ path: join(OUT, `login${light ? '-light' : ''}.png`), fullPage: true });
	console.log('login');
}
await page.fill('input[name="luci_username"]', USER);
await page.fill('input[name="luci_password"]', PASS);
await page.click('button');
await page.waitForURL(/cgi-bin\/luci/, { timeout: 15000 });

for (const name of list) {
	if (name === 'login') continue;
	const spec = PAGES[name];
	if (!spec) {
		console.log(`${name}: no such page in the list`);
		continue;
	}
	try {
		await page.goto(BASE + spec.url, { waitUntil: 'domcontentloaded' });
		await settle(page);
		await page.screenshot({
			path: join(OUT, `${name}${light ? '-light' : ''}.png`),
			fullPage: true,
		});
		console.log(name);
	} catch (e) {
		console.log(`${name}: ${e.message.split('\n')[0]}`);
	}
}

await browser.close();

if (problems.length) {
	console.log('\nbrowser problems:');
	for (const p of [...new Set(problems)].slice(0, 25)) console.log(`  ${p}`);
}
console.log(`\nscreenshots: ${OUT}`);
