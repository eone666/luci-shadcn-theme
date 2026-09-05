#!/usr/bin/env node
/*
 * Осмотр вычисленных стилей на живой странице стенда — чтобы не гадать,
 * какое правило победило в каскаде.
 *
 *   node scripts/inspect.mjs <страница> <селектор> [ещё селекторы...]
 *   node scripts/inspect.mjs system 'input[type=checkbox]' '.tabs > li'
 *   node scripts/inspect.mjs system '.cbi-value input' --shot   # + скриншот элемента
 *
 * Имена страниц — как в scripts/shots.mjs.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const BASE = process.env.LUCI_URL ?? 'http://localhost:8080';

const PAGES = {
	login: '/cgi-bin/luci/',
	dashboard: '/cgi-bin/luci/admin/dashboard',
	overview: '/cgi-bin/luci/admin/status/overview',
	interfaces: '/cgi-bin/luci/admin/network/network',
	wireless: '/cgi-bin/luci/admin/network/wireless',
	zones: '/cgi-bin/luci/admin/network/firewall/zones',
	dhcp: '/cgi-bin/luci/admin/network/dhcp',
	system: '/cgi-bin/luci/admin/system/system',
	packages: '/cgi-bin/luci/admin/system/package-manager',
	startup: '/cgi-bin/luci/admin/system/startup',
	routes: '/cgi-bin/luci/admin/status/routes',
};

/* Свойства, из-за которых обычно всё и ломается. */
const PROPS = [
	'display', 'width', 'height', 'padding', 'margin', 'border', 'border-radius',
	'background-color', 'background-image', 'color', 'box-shadow', 'font-size',
	'line-height', 'appearance', 'flex', 'position', 'opacity', 'visibility',
];

function chromePath() {
	const cache = join(homedir(), 'Library/Caches/ms-playwright');
	const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
	return join(cache, dir, 'chrome-mac-arm64',
		'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

const args = process.argv.slice(2);
const shot = args.includes('--shot');
const [pageName, ...selectors] = args.filter((a) => !a.startsWith('--'));
if (!pageName || !selectors.length) {
	console.error('нужны страница и хотя бы один селектор');
	process.exit(1);
}

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
	colorScheme: 'dark',
});
const page = await ctx.newPage();

await page.goto(`${BASE}/cgi-bin/luci/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="luci_username"]', { timeout: 15000 });
await page.fill('input[name="luci_username"]', process.env.LUCI_USER ?? 'root');
await page.fill('input[name="luci_password"]', process.env.LUCI_PASS ?? 'openwrt');
await page.click('button');
await page.waitForURL(/cgi-bin\/luci/, { timeout: 15000 });

if (pageName !== 'login') {
	await page.goto(BASE + PAGES[pageName], { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => !document.querySelector('#view > .spinning'),
		{ timeout: 15000 }).catch(() => {});
	await page.waitForTimeout(600);
}

for (const sel of selectors) {
	const data = await page.evaluate(({ sel, props }) => {
		const el = document.querySelector(sel);
		if (!el) return null;
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		const out = { box: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`, styles: {} };
		for (const p of props) out.styles[p] = cs.getPropertyValue(p);
		out.classes = el.className;
		out.tag = el.tagName.toLowerCase();
		// псевдоэлементы тоже интересны: LuCI рисует ими галочки и стрелки
		for (const pseudo of ['::before', '::after']) {
			const ps = getComputedStyle(el, pseudo);
			if (ps.content && ps.content !== 'none') {
				out[pseudo] = {
					content: ps.content,
					box: `${ps.width}x${ps.height}`,
					background: ps.backgroundColor,
					mask: ps.maskImage?.slice(0, 40),
				};
			}
		}
		return out;
	}, { sel, props: PROPS });

	console.log(`\n=== ${sel} ===`);
	if (!data) {
		console.log('  не найден на странице');
		continue;
	}
	console.log(`  <${data.tag}> class="${data.classes}"  бокс ${data.box}`);
	for (const [k, v] of Object.entries(data.styles))
		if (v && v !== 'none' && v !== 'auto' && v !== 'normal') console.log(`  ${k}: ${v}`);
	for (const pseudo of ['::before', '::after'])
		if (data[pseudo]) console.log(`  ${pseudo}: ${JSON.stringify(data[pseudo])}`);

	if (shot) {
		mkdirSync(resolve(root, 'shots'), { recursive: true });
		const name = sel.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
		await page.locator(sel).first().screenshot({
			path: resolve(root, 'shots', `el-${name}.png`),
		}).catch((e) => console.log(`  скриншот не вышел: ${e.message.split('\n')[0]}`));
	}
}

await browser.close();
