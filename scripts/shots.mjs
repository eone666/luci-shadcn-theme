#!/usr/bin/env node
/*
 * Скриншоты стенда: логинится в LuCI и снимает страницы-«детекторы».
 *
 * Нужно потому, что вью LuCI рендерятся на клиенте — curl видит только каркас
 * темы, а не таблицы, модалки и виджеты. Браузеры берём из кэша Playwright
 * (playwright-core их не скачивает), поэтому скрипт работает офлайн.
 *
 *   node scripts/shots.mjs                     # все страницы, тема из стенда
 *   node scripts/shots.mjs overview firewall   # только эти
 *   node scripts/shots.mjs --light             # эмулировать светлую схему ОС
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

/* Кэш Playwright: версия каталога меняется между релизами, поэтому ищем сами. */
function chromePath() {
	const cache = join(homedir(), 'Library/Caches/ms-playwright');
	const dir = readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().pop();
	if (!dir) throw new Error(`не найден chromium в ${cache}`);
	return join(cache, dir, 'chrome-mac-arm64',
		'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
}

const PAGES = {
	login: { url: '/cgi-bin/luci/', auth: false },
	dashboard: { url: '/cgi-bin/luci/admin/dashboard' },
	overview: { url: '/cgi-bin/luci/admin/status/overview' },
	interfaces: { url: '/cgi-bin/luci/admin/network/network' },
	/* wireless на стенде отсутствует: в контейнере нет радио, LuCI не
	   регистрирует пункт меню — страница отдаёт 404 */
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

/* Варианты темы форсируют режим сами (см. darkpref в header.ut), поэтому
   colorScheme браузера на них не влияет — переключаем вариант в стенде. */
const variant = light ? 'shadcn-light' : 'shadcn-dark';
try {
	execFileSync('docker', ['exec', process.env.LUCI_CONTAINER ?? 'luci-testbed', 'sh', '-c',
		`uci set luci.main.mediaurlbase=/luci-static/${variant} && uci commit luci`],
		{ stdio: 'ignore' });
} catch {
	console.log(`не удалось переключить тему на ${variant} — снимаю как есть`);
}

const browser = await chromium.launch({ executablePath: chromePath() });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
	deviceScaleFactor: 2,
	colorScheme: light ? 'light' : 'dark',
});
const page = await ctx.newPage();

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

const problems = [];
page.on('console', (m) => {
	if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`);
});
page.on('requestfailed', (r) => problems.push(`failed: ${r.url().slice(0, 160)}`));
page.on('response', (r) => {
	if (r.status() >= 400 && !r.url().includes('/cgi-bin/luci/admin'))
		problems.push(`${r.status()}: ${r.url().slice(0, 160)}`);
});

/* Логин: форма живёт в модалке, которую поднимает view/shadcn/sysauth.js */
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
		console.log(`${name}: нет такой страницы в списке`);
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
	console.log('\nпроблемы в браузере:');
	for (const p of [...new Set(problems)].slice(0, 25)) console.log(`  ${p}`);
}
console.log(`\nскриншоты: ${OUT}`);
