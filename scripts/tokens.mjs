#!/usr/bin/env node
/*
 * theme/globals.css — файл, скачанный с https://ui.shadcn.com/create, лежит в
 * репозитории как есть и руками не правится: перекраска темы = замена этого файла.
 *
 * Проблема одна: shadcn отдаёт его как готовую точку входа приложения, то есть с
 * `@import "tailwindcss"` (это притащило бы preflight и автосканирование классов) и
 * иногда с `@import "tw-animate-css"` (такого пакета у нас нет). Импортами управляет
 * src/cascade.css, поэтому здесь мы их вырезаем, а остальное — переменные,
 * @custom-variant, @theme inline, @layer base — переносим байт-в-байт.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'theme/globals.css');
const out = resolve(root, 'src/generated/tokens.css');

let css;
try {
	css = readFileSync(src, 'utf8');
} catch {
	console.error(`tokens: не найден ${src}\n` +
		`Скачайте тему с https://ui.shadcn.com/create и положите файл как theme/globals.css`);
	process.exit(1);
}

// Вырезаем только известные импорты: молча потерянный @import — это молча
// потерянные стили, поэтому на незнакомом падаем.
const ALLOWED_IMPORTS = ['tailwindcss', 'tw-animate-css'];
const dropped = [];
const unknown = [];
css = css.replace(/^[ \t]*@import\s+([^;]+);[ \t]*\r?\n?/gm, (m, spec) => {
	const name = spec.trim().replace(/^["']|["'].*$/g, '');
	if (!ALLOWED_IMPORTS.includes(name)) {
		unknown.push(spec.trim());
		return m;
	}
	dropped.push(name);
	return '';
});

// shadcn кладёт тёмные значения в `.dark`, LuCI переключает режим атрибутом
// data-darkmode. Дублируем селектор, чтобы палитра приезжала по любому из двух
// признаков (класс ставит header.ut, атрибут — унаследованный контракт).
let darkDuped = 0;
css = css.replace(/(^|\n)([ \t]*)\.dark(\s*\{)/, (m, pre, indent, brace) => {
	darkDuped = 1;
	return `${pre}${indent}.dark, :root[data-darkmode="true"]${brace}`;
});

// По той же причине расширяем сам вариант: `dark:*` в @apply должен срабатывать
// и по атрибуту. Последнее объявление @custom-variant побеждает, но переписываем
// прямо здесь — так результат не зависит от порядка импортов.
/* Префиксная форма, а не shadcn-овская `&:is(.dark *)`: Tailwind разворачивает
   вариант вложенным правилом, и для селектора с псевдоэлементом получается
   невалидный `::before:is(.dark *)` — браузер выбрасывает такое правило целиком.
   `.dark &` даёт валидный `.dark input::before`, а тема ими насыщена. */
const DARK_VARIANT =
	'@custom-variant dark (:is(.dark, [data-darkmode="true"]) &);';
let variantPatched = 0;
css = css.replace(/^[ \t]*@custom-variant\s+dark\b.*$/m, () => {
	variantPatched = 1;
	return DARK_VARIANT;
});

const header =
	'/* СГЕНЕРИРОВАНО из theme/globals.css — не редактировать (см. scripts/tokens.mjs) */\n\n';

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, header + css.replace(/^\n+/, ''));

if (unknown.length) {
	console.error(`tokens: незнакомый @import в ${src}: ${unknown.join(', ')}\n` +
		`Импортами управляет src/cascade.css. Либо добавьте импорт туда вручную, ` +
		`либо внесите его в ALLOWED_IMPORTS.`);
	process.exit(1);
}

const has = (re) => (re.test(css) ? 'да' : 'НЕТ');
console.log(`tokens: ${src.replace(root + '/', '')} -> ${out.replace(root + '/', '')}`);
if (dropped.length)
	console.log(`  вырезаны импорты: ${dropped.join(', ')}`);
console.log(`  :root: ${has(/:root\s*\{/)}   ` +
	`тёмная палитра: ${has(/\.dark,\s*:root\[data-darkmode/)}` +
	`${darkDuped ? ' (селектор продублирован)' : ''}   ` +
	`@theme inline: ${has(/@theme\s+inline\s*\{/)}   ` +
	`variant dark: ${variantPatched ? 'расширен на data-darkmode' : 'НЕТ'}`);

if (!/:root\s*\{/.test(css)) {
	console.error('tokens: в файле нет блока :root — это не похоже на globals.css из shadcn');
	process.exit(1);
}

/* Тема эпохи Tailwind v3 хранила цвета триплетами (`--background: 0 0% 100%`) и
   разворачивала их через `hsl(var(--background))`. У нас переменные идут в
   цветовые свойства напрямую, поэтому такой файл дал бы невалидные цвета —
   лучше упасть с понятным сообщением. */
const legacyTriplet = css.match(/--(?:background|foreground|primary|border):\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/);
if (legacyTriplet) {
	console.error(
		`tokens: похоже на тему для Tailwind v3 — цвета заданы HSL-триплетами ` +
		`(${legacyTriplet[0]}).\nНужен файл для Tailwind v4, где значения — готовые ` +
		`цвета: oklch(...)/hsl(...)/#rrggbb.`);
	process.exit(1);
}
if (!darkDuped)
	console.warn('tokens: ВНИМАНИЕ — в файле нет блока .dark, тёмная тема из палитры не приедет');
if (!variantPatched)
	console.warn(`tokens: ВНИМАНИЕ — нет @custom-variant dark; добавьте в src/theme-map.css:\n  ${DARK_VARIANT}`);
