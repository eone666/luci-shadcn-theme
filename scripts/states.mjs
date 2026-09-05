#!/usr/bin/env node
/*
 * Screenshots of interactive states — the things a static page never shows and
 * the first things to break when porting a theme: an open .cbi-dropdown, the
 * Save & Apply dialog with the uci diff, a validation error, a tooltip, a modal.
 *
 *   node scripts/states.mjs            # every state
 *   node scripts/states.mjs dropdown   # just one
 *   node scripts/states.mjs --light
 */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { open, login, go as goTo, switchTheme } from './lib/bench.mjs';

const OUT = resolve(import.meta.dirname, '..', 'shots');

const argv = process.argv.slice(2);
const light = argv.includes('--light');
const want = argv.filter((a) => !a.startsWith('--'));
const suffix = light ? '-light' : '';

mkdirSync(OUT, { recursive: true });
switchTheme(light ? 'shadcn-light' : 'shadcn-dark');

const { browser, page } = await open({ light, height: 900 });
const shot = (name) => page.screenshot({ path: join(OUT, `state-${name}${suffix}.png`) });
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

await browser.close();
console.log(`\nstate screenshots: ${OUT}`);
