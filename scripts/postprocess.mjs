#!/usr/bin/env node
/*
 * Убирает из собранного CSS следы Tailwind: готовая тема не должна выдавать,
 * чем её собрали, и не должна тащить чужую машинерию.
 *
 * Что делается:
 *   1. Снимается баннер `/*! tailwindcss ... *\/`, ставится свой заголовок.
 *   2. Удаляется `@layer properties{...}` — это фолбэк для браузеров без
 *      @property (мы требуем Chrome 111+, где он есть).
 *   3. Разворачиваются `@layer theme{...}` и `@layer base{...}`: в теме своих
 *      слоёв нет, правила должны лежать плоско, как в апстримном cascade.css.
 *   4. Сплющиваются `@supports (color: color-mix(in lab, red, red)){...}`.
 *      Внимание: внутри такого блока лежит НУЖНОЕ значение с прозрачностью
 *      (bg-input/30), а снаружи непрозрачный фолбэк — поэтому блок именно
 *      сплющивается, а не удаляется.
 *   5. Переменные `--tw-*` переименовываются в `--th-*`.
 *
 *   node scripts/postprocess.mjs <вход> <выход>
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const HEADER = (name) => `/*!
 * luci-theme-shadcn — ${name}
 * Тема LuCI в оформлении shadcn/ui. Файл собран из исходников (src/), не править.
 * Палитра: theme/globals.css. Лицензия: Apache-2.0.
 */
`;

/** Найти конец блока, открывающегося на позиции brace (индекс '{'). */
function blockEnd(css, brace) {
	let depth = 0;
	for (let i = brace; i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) return i;
	}
	return css.length - 1;
}

/** Найти начало at-правила по подстроке и вернуть [start, braceIdx, endIdx]. */
function findAtRule(css, needle, from = 0) {
	let at = from;
	for (;;) {
		const start = css.indexOf(needle, at);
		if (start < 0) return null;
		// нужен именно блок: между именем и '{' допустимы только пробелы.
		// иначе `@layer theme` совпало бы с объявлением
		// `@layer theme,base,components,utilities;` и склеило бы соседние правила
		const rest = css.slice(start + needle.length);
		const m = rest.match(/^\s*\{/);
		if (m) {
			const brace = start + needle.length + m[0].length - 1;
			return [start, brace, blockEnd(css, brace)];
		}
		at = start + needle.length;
	}
}

/** Удалить at-правило целиком (вместе с содержимым). */
function dropAtRule(css, needle) {
	let n = 0;
	for (;;) {
		const found = findAtRule(css, needle);
		if (!found) break;
		const [start, , end] = found;
		css = css.slice(0, start) + css.slice(end + 1);
		n++;
	}
	return [css, n];
}

/** Заменить at-правило его содержимым (развернуть/сплющить). */
function unwrapAtRule(css, needle) {
	let n = 0;
	let from = 0;
	for (;;) {
		const found = findAtRule(css, needle, from);
		if (!found) break;
		const [start, brace, end] = found;
		const inner = css.slice(brace + 1, end);
		css = css.slice(0, start) + inner + css.slice(end + 1);
		from = start + inner.length;
		n++;
	}
	return [css, n];
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
	console.error('нужны путь входа и путь выхода');
	process.exit(1);
}

let css = readFileSync(input, 'utf8');
const before = css.length;
const report = [];

// 1. баннер
const banner = css.match(/^\/\*![^]*?\*\/\s*/);
if (banner) {
	css = css.slice(banner[0].length);
	report.push('баннер снят');
}

// 2. фолбэк для браузеров без @property
{
	const [next, n] = dropAtRule(css, '@layer properties');
	css = next;
	if (n) report.push(`@layer properties удалён (${n})`);
}

// 3. сначала снимаем объявление порядка слоёв — оно ни на что не влияет и
//    мешает искать одноимённые блоки
css = css.replace(/@layer\s+[^;{]+;/g, () => {
	report.push('объявление @layer снято');
	return '';
});

// затем разворачиваем сами слои
for (const layer of ['@layer theme', '@layer base', '@layer components', '@layer utilities']) {
	const [next, n] = unwrapAtRule(css, layer);
	css = next;
	if (n) report.push(`${layer} развёрнут (${n})`);
}
// 4. @supports вокруг color-mix: наружу должно уехать внутреннее значение
{
	let total = 0;
	for (;;) {
		const [next, n] = unwrapAtRule(css, '@supports (color:color-mix(in lab, red, red))');
		css = next;
		if (!n) break;
		total += n;
	}
	// на случай другого форматирования того же условия
	for (;;) {
		const found = css.match(/@supports\s*\(color:\s*color-mix\([^)]*\)[^)]*\)\s*\{/);
		if (!found) break;
		const [next, n] = unwrapAtRule(css, found[0].slice(0, found[0].indexOf('{')));
		if (!n) break;
		css = next;
		total += n;
	}
	if (total) report.push(`@supports(color-mix) сплющен (${total})`);
}

// 5. внутренние переменные утилит: имя не должно называть инструмент
const twCount = (css.match(/--tw-/g) || []).length;
if (twCount) {
	css = css.replaceAll('--tw-', '--th-');
	report.push(`--tw-* -> --th-* (${twCount})`);
}

const leftovers = [];
if (/tailwind/i.test(css)) leftovers.push('слово tailwind');
if (/--tw-/.test(css)) leftovers.push('--tw-');
if (/@layer/.test(css)) leftovers.push('@layer');

const name = output.split('/').pop();
/* Пишем через временный файл: стенд отдаёт этот CSS напрямую из bind mount,
   и браузер, попавший на середину записи, получал бы обрезанную тему. */
const tmp = `${output}.tmp`;
writeFileSync(tmp, HEADER(name) + css.trimStart());
renameSync(tmp, output);

const after = HEADER(name).length + css.trimStart().length;
console.log(`postprocess ${name}: ${report.join(', ')}`);
console.log(`  ${before} -> ${after} байт` +
	(leftovers.length ? `   ОСТАЛОСЬ: ${leftovers.join(', ')}` : '   следов Tailwind нет'));
if (leftovers.length) process.exit(1);
