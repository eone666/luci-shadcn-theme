#!/usr/bin/env node
/*
 * Скриншоты интерактивных состояний — того, что на статичной странице не видно
 * и что при переносе темы ломается первым: раскрытый .cbi-dropdown, диалог
 * Save & Apply с диффом uci, ошибка валидации, тултип, модалка.
 *
 *   node scripts/states.mjs            # все состояния
 *   node scripts/states.mjs dropdown   # только одно
 *   node scripts/states.mjs --light
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const OUT = resolve(root, 'shots');
const BASE = process.env.LUCI_URL ?? 'http://localhost:8080';

function chromePath() {
	const cache = join(homedir(), 'Library/Caches/ms-playwright');
	const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
	return join(cache, dir, 'chrome-mac-arm64',
		'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

const args = process.argv.slice(2);
const light = args.includes('--light');
const want = args.filter((a) => !a.startsWith('--'));
const suffix = light ? '-light' : '';

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
	colorScheme: light ? 'light' : 'dark',
});
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: join(OUT, `state-${name}${suffix}.png`) });

await page.goto(`${BASE}/cgi-bin/luci/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[name="luci_username"]');
await page.fill('input[name="luci_username"]', 'root');
await page.fill('input[name="luci_password"]', process.env.LUCI_PASS ?? 'openwrt');
await page.click('button');
await page.waitForURL(/cgi-bin\/luci/);

/* Дождаться, пока страница реально дорисуется: вью LuCI рендерятся на клиенте,
   и снимок «слишком рано» ловит промежуточное состояние — вплоть до кадра, где
   тема ещё не применилась и ядро показывает свой фолбэк. */
async function settle(page, extra = 1200) {
	await page.waitForLoadState('networkidle').catch(() => {});
	await page.waitForFunction(() => !document.querySelector('#view > .spinning'),
		{ timeout: 20000 }).catch(() => {});
	await page.waitForFunction(() => {
		// тема применилась: фон взят из токена, а не дефолтный прозрачный
		const bg = getComputedStyle(document.body).backgroundColor;
		return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
	}, { timeout: 10000 }).catch(() => {});
	await page.waitForFunction(() => !document.fonts || document.fonts.status === 'loaded',
		{ timeout: 5000 }).catch(() => {});
	await page.waitForTimeout(extra);
}

const go = async (url) => {
	await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
	await settle(page);
};

const run = (name) => !want.length || want.includes(name);

/* Одна осечка не должна валить весь прогон. */
async function step(name, fn) {
	if (!run(name)) return;
	try {
		await fn();
	} catch (e) {
		console.log(`${name}: ${e.message.split('\n')[0]}`);
	}
}

/* 1. Раскрытый .cbi-dropdown внутри модалки — конечный автомат на атрибутах,
      самый хрупкий узел темы. Берём модалку правки интерфейса: там select-виджеты
      есть всегда, в отличие от вкладок DHCP, где нужный таб может быть скрыт. */
await step('dropdown', async () => {
	await go('/cgi-bin/luci/admin/network/network');
	const edit = page.locator('.cbi-button-edit').first();
	if (!await edit.count()) {
		console.log('dropdown: кнопки Edit на странице нет');
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
		console.log('dropdown: в модалке нет видимого select-виджета');
		await page.keyboard.press('Escape');
		return;
	}
	const dd = page.locator('.modal .cbi-dropdown:not(.btn):not(.cbi-button)').nth(idx);
	await dd.scrollIntoViewIfNeeded();
	await dd.evaluate((el) => el.click());
	await page.waitForTimeout(500);
	await shot('dropdown');
	console.log('dropdown', await dd.getAttribute('open') !== null ? '(open)' : '(НЕ раскрылся)');
	await page.keyboard.press('Escape');
});

/* 2. Ошибка валидации: недопустимое значение в поле + счётчик ошибок на табе */
await step('invalid', async () => {
	await go('/cgi-bin/luci/admin/system/system');
	const host = page.locator('input[id*="hostname"]:visible').first();
	await host.fill('плохое имя!!');
	await host.blur();
	await page.waitForTimeout(400);
	await shot('invalid');
	const cls = await host.getAttribute('class');
	console.log(`invalid: class="${cls}"`);
});

/* 3. Диалог Save & Apply с диффом uci */
await step('apply', async () => {
	await go('/cgi-bin/luci/admin/system/system');
	const desc = page.locator('input[id*="description"]').first();
	await desc.fill('shadcn theme test ' + Date.now() % 1000);
	await page.waitForTimeout(200);
	await page.locator('.cbi-page-actions .cbi-button-save').click();
	await page.waitForTimeout(1200);
	await shot('apply-saved');
	// индикатор «Unsaved Changes» в шапке
	const ind = page.locator('#indicators [data-indicator="uci-changes"]');
	if (await ind.count()) {
		await ind.click();
		await page.waitForTimeout(800);
		await shot('apply-dialog');
		console.log('apply: диалог изменений показан');
		// откатываем, чтобы стенд остался чистым
		const revert = page.locator('.modal .btn', { hasText: /Revert|Отмен/ }).first();
		if (await revert.count()) {
			await revert.click();
			await page.waitForTimeout(1500);
		} else {
			await page.keyboard.press('Escape');
		}
	} else {
		console.log('apply: индикатора изменений нет');
	}
});

/* 4. Тултип по значку помощи/значению */
await step('tooltip', async () => {
	await go('/cgi-bin/luci/admin/network/network');
	const tip = page.locator('.cbi-tooltip-container').first();
	if (await tip.count()) {
		await tip.hover();
		await page.waitForTimeout(600);
		await shot('tooltip');
	} else {
		console.log('tooltip: контейнеров с подсказкой на странице нет');
	}
});

/* 5. Модальное окно редактирования интерфейса */
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
console.log(`\nскриншоты состояний: ${OUT}`);
