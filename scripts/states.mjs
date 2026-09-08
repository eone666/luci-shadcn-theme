#!/usr/bin/env node
/*
 * Screenshots of interactive states — the things a static page never shows and
 * the first things to break when porting a theme: an open .cbi-dropdown, the
 * Save & Apply dialog with the uci diff, a validation error, a tooltip, a modal.
 *
 *   node scripts/states.mjs            # every state
 *   node scripts/states.mjs dropdown   # just one
 *   node scripts/states.mjs --light
 *   node scripts/states.mjs --out docs/img menu    # somewhere other than shots/
 *
 * A couple of these states are the theme's own behaviour rather than the core's
 * — the mobile menu sheet, a table scrolling inside itself — so they set their
 * own viewport and are the ones worth keeping in docs/img.
 */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { open, login, go as goTo, switchTheme } from './lib/bench.mjs';

const root = resolve(import.meta.dirname, '..');

const argv = process.argv.slice(2);
const light = argv.includes('--light');
let dir = 'shots';
const want = [];
for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	if (a === '--out') dir = argv[++i];
	else if (!a.startsWith('--')) want.push(a);
}
const OUT = resolve(root, dir);
const suffix = light ? '-light' : '';

mkdirSync(OUT, { recursive: true });
switchTheme(light ? 'shadcn-light' : 'shadcn-dark');

const { browser, page } = await open({ light, height: 900 });
const shot = (name, opts) => page.screenshot({ path: join(OUT, `state-${name}${suffix}.png`), ...opts });
const go = (url) => goTo(page, url);

await login(page);

const run = (name) => !want.length || want.includes(name);

/* One misfire must not bring down the whole run. */
async function step(name, fn) {
	if (!run(name)) return;
	try {
		await fn();
	} catch (e) {
		console.log(`${name}: ${e.message.split('\n')[0]}`);
	}
}

/* 1. An open .cbi-dropdown inside a modal — an attribute-driven state machine
      and the most fragile part of the theme. We use the interface edit modal: it
      always has select widgets, unlike the DHCP tabs, where the tab we need may be
      hidden. */
await step('dropdown', async () => {
	await go('/cgi-bin/luci/admin/network/network');
	const edit = page.locator('.cbi-button-edit').first();
	if (!await edit.count()) {
		console.log('dropdown: no Edit button on the page');
		return;
	}
	await edit.evaluate((el) => el.click());
	await page.waitForTimeout(1500);

	const idx = await page.evaluate(() => {
		const all = [...document.querySelectorAll('.modal .cbi-dropdown:not(.btn):not(.cbi-button)')];
		return all.findIndex((el) => {
			const tab = el.closest('[data-tab]');
			return el.getBoundingClientRect().height > 0 &&
				(!tab || tab.getAttribute('data-tab-active') === 'true');
		});
	});
	if (idx < 0) {
		console.log('dropdown: no visible select widget in the modal');
		await page.keyboard.press('Escape');
		return;
	}
	const dd = page.locator('.modal .cbi-dropdown:not(.btn):not(.cbi-button)').nth(idx);
	await dd.scrollIntoViewIfNeeded();
	await dd.evaluate((el) => el.click());
	await page.waitForTimeout(500);
	await shot('dropdown');
	console.log('dropdown', await dd.getAttribute('open') !== null ? '(open)' : '(did NOT open)');
	await page.keyboard.press('Escape');
});

/* 2. Validation error: an invalid value in a field + the error count on a tab */
await step('invalid', async () => {
	await go('/cgi-bin/luci/admin/system/system');
	const host = page.locator('input[id*="hostname"]:visible').first();
	await host.fill('bad name!!');
	await host.blur();
	await page.waitForTimeout(400);
	await shot('invalid');
	const cls = await host.getAttribute('class');
	console.log(`invalid: class="${cls}"`);
});

/* 3. The Save & Apply dialog with the uci diff */
await step('apply', async () => {
	await go('/cgi-bin/luci/admin/system/system');
	const desc = page.locator('input[id*="description"]').first();
	await desc.fill('shadcn theme test ' + Date.now() % 1000);
	await page.waitForTimeout(200);
	await page.locator('.cbi-page-actions .cbi-button-save').click();
	await page.waitForTimeout(1200);
	await shot('apply-saved');
	// the "Unsaved Changes" indicator in the header
	const ind = page.locator('#indicators [data-indicator="uci-changes"]');
	if (await ind.count()) {
		await ind.click();
		await page.waitForTimeout(800);
		await shot('apply-dialog');
		console.log('apply: change dialog shown');
		// revert, so the bench stays clean. Selected by class, not by label:
		// ui.js renders it as .cbi-button-reset, and matching /Revert/ would
		// miss the button under any non-English locale and silently leave the
		// change pending.
		const revert = page.locator('.modal .cbi-button-reset').first();
		if (await revert.count()) {
			await revert.click();
			await page.waitForTimeout(1500);
		} else {
			await page.keyboard.press('Escape');
		}
	} else {
		console.log('apply: no change indicator present');
	}
});

/* 4. Tooltip on a help icon / value */
await step('tooltip', async () => {
	await go('/cgi-bin/luci/admin/network/network');
	const tip = page.locator('.cbi-tooltip-container').first();
	if (await tip.count()) {
		await tip.hover();
		await page.waitForTimeout(600);
		await shot('tooltip');
	} else {
		console.log('tooltip: no tooltip containers on the page');
	}
});

/* 5. The interface edit modal */
await step('modal', async () => {
	await go('/cgi-bin/luci/admin/network/network');
	const edit = page.locator('.cbi-button-edit').first();
	if (await edit.count()) {
		await edit.click();
		await page.waitForTimeout(1500);
		await shot('modal');
		await page.keyboard.press('Escape');
	}
});

/*
 * 6. The mobile menu sheet. This one is the theme's, not the core's: header.ut
 *    puts a checkbox in front of #topmenu and the sheet is that checkbox's
 *    :checked state, so there is nothing to drive but a click on the label.
 */
await step('menu', async () => {
	await page.setViewportSize({ width: 420, height: 900 });
	await go('/cgi-bin/luci/admin/status/overview');
	const trigger = page.locator('.menu-trigger');
	if (!await trigger.count()) {
		console.log('menu: no trigger — is the viewport wide enough to hide it?');
		return;
	}
	await trigger.click();
	await page.waitForTimeout(500);
	const open = await page.evaluate(() =>
		getComputedStyle(document.querySelector('#topmenu')).position === 'fixed');
	await shot('menu');
	console.log(`menu: sheet ${open ? 'open' : 'did NOT open'}`);
	await trigger.click();
	await page.setViewportSize({ width: 1440, height: 900 });
});

/*
 * 7. A table wider than its container, scrolled off its left edge so the shade
 *    marking there is more to the side shows. Firewall > Zones is the widest
 *    table the bench has; 760px is narrow enough to make it overflow and wide
 *    enough to stay out of the card layout, which takes over below 600px and
 *    has nothing to scroll.
 */
await step('table-scroll', async () => {
	await page.setViewportSize({ width: 760, height: 900 });
	await go('/cgi-bin/luci/admin/network/firewall/zones');
	const box = page.locator('.table-scroller').first();
	if (!await box.count()) {
		console.log('table-scroll: no scroll box — menu-shadcn.js did not wrap');
		return;
	}
	const scrolls = await box.evaluate((el) => {
		el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2);
		return el.scrollWidth > el.clientWidth + 1;
	});
	await page.waitForTimeout(300);
	await box.scrollIntoViewIfNeeded();
	/* cropped to the table plus its heading: the point of the shot is the two
	   shades at the edges, which a whole-page frame buries */
	const b = await box.boundingBox();
	await shot('table-scroll', { clip: { x: Math.max(b.x - 24, 0), y: Math.max(b.y - 56, 0),
	                                     width: Math.min(b.width + 48, 760), height: b.height + 80 } });
	console.log(`table-scroll: ${scrolls ? 'scrolls' : 'fits, nothing to show'}`);
	await page.setViewportSize({ width: 1440, height: 900 });
});

await browser.close();
console.log(`\nstate screenshots: ${OUT}`);
