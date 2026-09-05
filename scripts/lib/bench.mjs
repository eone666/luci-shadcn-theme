/*
 * Shared plumbing for the scripts that drive the test bench through a browser:
 * shots.mjs, states.mjs and inspect.mjs all need the same four things — find a
 * browser, log in, wait until LuCI has finished drawing, and know which page is
 * where.
 *
 * Everything is configurable through the environment, so the scripts also work
 * against a real router:
 *
 *   LUCI_URL=http://192.168.1.1 LUCI_PASS=secret node scripts/shots.mjs
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, arch } from 'node:os';

export const BASE = process.env.LUCI_URL ?? 'http://localhost:8080';
export const USER = process.env.LUCI_USER ?? 'root';
export const PASS = process.env.LUCI_PASS ?? 'openwrt';
export const CONTAINER = process.env.LUCI_CONTAINER ?? 'luci-testbed';

/* The pages worth looking at: between them they cover every widget the theme
   touches — tables, tabs, modals, dropdowns, the dashboard cards. */
export const PAGES = {
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

/* playwright-core downloads nothing, so we borrow the browser Playwright has
   already cached. The directory carries the build number, and the executable
   sits at a different path on every platform. */
export function chromePath() {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
	const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (
		platform() === 'darwin' ? join(homedir(), 'Library/Caches/ms-playwright') :
		platform() === 'win32' ? join(homedir(), 'AppData/Local/ms-playwright') :
		join(homedir(), '.cache/ms-playwright'));
	if (!existsSync(cache))
		throw new Error(`no Playwright browser cache at ${cache}\n` +
			'Install one with `npx playwright install chromium`, ' +
			'or point CHROME_PATH at a Chrome binary.');
	const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
	if (!dir) throw new Error(`no chromium in ${cache} — run \`npx playwright install chromium\``);
	const candidates = platform() === 'darwin'
		? [`chrome-mac-${arch() === 'arm64' ? 'arm64' : 'x64'}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
		   'chrome-mac/Chromium.app/Contents/MacOS/Chromium']
		: platform() === 'win32'
		? ['chrome-win/chrome.exe']
		: ['chrome-linux/chrome'];
	for (const c of candidates) {
		const p = join(cache, dir, c);
		if (existsSync(p)) return p;
	}
	throw new Error(`found ${dir} but no executable inside it`);
}

/** A browser plus a context set up the way the theme is looked at. */
export async function open({ light = false, width = 1440, height = 1000, scale = 2 } = {}) {
	const browser = await chromium.launch({ executablePath: chromePath() });
	const ctx = await browser.newContext({
		viewport: { width, height },
		deviceScaleFactor: scale,
		colorScheme: light ? 'light' : 'dark',
	});
	return { browser, ctx, page: await ctx.newPage() };
}

/** Log in. The form is a modal raised by view/shadcn/sysauth.js. */
export async function login(page, { before } = {}) {
	await page.goto(`${BASE}/cgi-bin/luci/`, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('input[name="luci_username"]', { timeout: 15000 });
	if (before) await before(page);           // the login screen itself, before it goes away
	await page.fill('input[name="luci_username"]', USER);
	await page.fill('input[name="luci_password"]', PASS);
	await page.click('button');
	await page.waitForURL(/cgi-bin\/luci/, { timeout: 15000 });
}

/*
 * Wait until the page has actually finished drawing: LuCI views render on the
 * client, and a shot taken too early catches an intermediate state — up to a
 * frame where the theme has not applied yet and the core shows its fallback.
 */
export async function settle(page, extra = 1200) {
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

/** Open a page and wait for it. */
export async function go(page, url) {
	await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
	await settle(page);
}

/*
 * Switch the bench to a theme variant. The variants force the mode themselves
 * (see darkpref in header.ut), so the browser's colour scheme does not decide
 * it — the active theme does.
 */
export function switchTheme(variant) {
	try {
		execFileSync('docker', ['exec', CONTAINER, 'sh', '-c',
			`uci set luci.main.mediaurlbase=/luci-static/${variant} && uci commit luci`],
			{ stdio: 'ignore' });
		return true;
	} catch {
		console.log(`could not switch the theme to ${variant} — using whatever is active`);
		return false;
	}
}
