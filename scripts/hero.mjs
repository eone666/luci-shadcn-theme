#!/usr/bin/env node
/*
 * The README hero: one page shot twice, dark and light, joined along a diagonal.
 *
 *   node scripts/hero.mjs [page] [--out docs/img/hero.png] [--top .3] [--bottom .6]
 *
 * Both halves have to be the same page at the same size, so the shots are taken
 * here rather than reused: switch the bench to a variant, capture, switch back.
 * The compositing runs on a canvas inside the same browser -- no image library.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { PAGES, open, login, go, switchTheme } from './lib/bench.mjs';

const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const out = resolve(import.meta.dirname, '..',
	outArg < 0 ? 'docs/img/hero.png' : argv[outArg + 1]);
const name = argv.find((a) => !a.startsWith('--') && PAGES[a]) ?? 'zones';   // the firewall page: most widgets per screen
const width = 1440, height = 880;

const shots = {};
for (const variant of ['dark', 'light']) {
	switchTheme(`shadcnui-${variant}`);
	const { browser, page } = await open({ light: variant === 'light', width, height });
	await login(page);
	await go(page, PAGES[name].url);
	shots[variant] = await page.screenshot();     // viewport only, both identical in size
	await browser.close();
}

/* The seam: a straight line from x=SPLIT_TOP on the top edge down to
   x=SPLIT_BOTTOM on the bottom one, as fractions of the width; light takes
   everything to the right of it. The default leans right going down, so the
   seam crosses the header and the tab strip -- both then show up in both
   schemes, which a seam that starts out on the right cannot do: LuCI keeps the
   brand, the menu and the tabs on the left. */
const num = (name, fallback) => {
	const i = argv.indexOf(`--${name}`);
	return i < 0 ? fallback : Number(argv[i + 1]);
};
const SPLIT_TOP = num('top', 0.30), SPLIT_BOTTOM = num('bottom', 0.60);

const { browser, page } = await open({ width: 400, height: 300, scale: 1 });
const dataUrl = await page.evaluate(async ({ dark, light, top, bottom }) => {
	const load = (src) => new Promise((ok, err) => {
		const img = new Image();
		img.onload = () => ok(img);
		img.onerror = err;
		img.src = src;
	});
	const [d, l] = await Promise.all([load(dark), load(light)]);
	const c = document.createElement('canvas');
	c.width = d.naturalWidth;
	c.height = d.naturalHeight;
	const ctx = c.getContext('2d');
	ctx.drawImage(d, 0, 0);

	const xTop = c.width * top, xBottom = c.width * bottom;
	ctx.save();
	ctx.beginPath();
	ctx.moveTo(xTop, 0);
	ctx.lineTo(c.width, 0);
	ctx.lineTo(c.width, c.height);
	ctx.lineTo(xBottom, c.height);
	ctx.closePath();
	ctx.clip();
	ctx.drawImage(l, 0, 0);
	ctx.restore();

	// a hairline on the seam, so the join reads as deliberate
	ctx.strokeStyle = 'rgba(127,127,127,.55)';
	ctx.lineWidth = Math.max(2, c.width / 900);
	ctx.beginPath();
	ctx.moveTo(xTop, 0);
	ctx.lineTo(xBottom, c.height);
	ctx.stroke();

	return c.toDataURL('image/png');
}, {
	dark: `data:image/png;base64,${shots.dark.toString('base64')}`,
	light: `data:image/png;base64,${shots.light.toString('base64')}`,
	top: SPLIT_TOP, bottom: SPLIT_BOTTOM,
});
await browser.close();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`${name}: dark + light -> ${out.replace(process.cwd() + '/', '')}`);
