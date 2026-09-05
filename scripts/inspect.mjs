#!/usr/bin/env node
/*
 * Inspect computed styles on a live page of the test bench — so there is no
 * guessing about which rule won the cascade.
 *
 *   node scripts/inspect.mjs <page> <selector> [more selectors...]
 *   node scripts/inspect.mjs system 'input[type=checkbox]' '.tabs > li'
 *   node scripts/inspect.mjs system '.cbi-value input' --shot   # + element shot
 *
 * Page names are the ones in scripts/lib/bench.mjs.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGES, open, login, go } from './lib/bench.mjs';

const root = resolve(import.meta.dirname, '..');

/* The properties that usually turn out to be the culprits. */
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
	console.error('a page and at least one selector are required\n' +
		`pages: ${Object.keys(PAGES).join(', ')}`);
	process.exit(1);
}
if (!PAGES[pageName]) {
	console.error(`no such page: ${pageName}\npages: ${Object.keys(PAGES).join(', ')}`);
	process.exit(1);
}

const { browser, page } = await open({ scale: 1 });
await login(page);
if (pageName !== 'login') await go(page, PAGES[pageName].url);

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
		// pseudo-elements matter too: LuCI draws check marks and arrows with them
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
		console.log('  not found on the page');
		continue;
	}
	console.log(`  <${data.tag}> class="${data.classes}"  box ${data.box}`);
	for (const [k, v] of Object.entries(data.styles))
		if (v && v !== 'none' && v !== 'auto' && v !== 'normal') console.log(`  ${k}: ${v}`);
	for (const pseudo of ['::before', '::after'])
		if (data[pseudo]) console.log(`  ${pseudo}: ${JSON.stringify(data[pseudo])}`);

	if (shot) {
		mkdirSync(resolve(root, 'shots'), { recursive: true });
		const name = sel.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
		await page.locator(sel).first().screenshot({
			path: resolve(root, 'shots', `el-${name}.png`),
		}).catch((e) => console.log(`  screenshot failed: ${e.message.split('\n')[0]}`));
	}
}

await browser.close();
