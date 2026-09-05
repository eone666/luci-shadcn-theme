#!/usr/bin/env node
/*
 * Сверка селекторов: что было в luci-theme-bootstrap против того, что собралось у нас.
 *
 * Тема не контролирует разметку — классы генерирует ядро LuCI. Значит единственный
 * способ поймать правило, потерянное при переносе на @apply, это сравнить списки
 * селекторов с апстримом. MISSING должен быть пуст (кроме осознанных исключений).
 *
 *   node scripts/audit-selectors.mjs            # cascade.css + mobile.css
 *   node scripts/audit-selectors.mjs --verbose  # ещё и EXTRA
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const verbose = process.argv.includes('--verbose');

/* Селекторы, которых у нас осознанно нет: механика апстрима, заменённая на
   токены/утилиты. Каждая строка — с причиной. */
const EXPECTED_MISSING = new Map([
	[':root', 'палитра приходит из theme/globals.css'],
	[':root[data-darkmode="true"]', 'тёмная палитра там же, селектор дублирует tokens.mjs'],
	['input[type="search"]::-webkit-search-decoration', 'вендорный префикс, вырезается минификатором'],
]);

function selectors(css) {
	const out = new Set();
	let i = 0, selStart = 0;
	const n = css.length;
	while (i < n) {
		if (css[i] === '/' && css[i + 1] === '*') {
			const j = css.indexOf('*/', i);
			i = j < 0 ? n : j + 2;
			continue;
		}
		if (css[i] === '{') {
			// комментарий может стоять прямо перед селектором — вычищаем его из текста
			const raw = css.slice(selStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
			// @media/@layer/@supports — обёртки, внутрь заходим; @keyframes и
			// @property учитываем как единицу
			if (/^@(media|supports|layer|container)\b/.test(raw)) {
				i++;
				selStart = i;
				continue;
			}
			let depth = 0, j = i;
			while (j < n) {
				if (css[j] === '/' && css[j + 1] === '*') {
					const k = css.indexOf('*/', j);
					j = k < 0 ? n : k + 2;
					continue;
				}
				if (css[j] === '{') depth++;
				else if (css[j] === '}' && --depth === 0) break;
				j++;
			}
			if (raw && !raw.startsWith('@')) {
				// нормализация: каждый селектор из списка отдельно, пробелы сжаты,
				// кавычки в атрибутах приведены к двойным
				for (const one of raw.split(',')) {
					const s = one
						.replace(/\s+/g, ' ')
						.replace(/\s*([>+~])\s*/g, '$1')
						.replace(/=([^"'\]]+)\]/g, '="$1"]')
						.trim();
					if (s) out.add(s);
				}
			} else if (raw.startsWith('@keyframes')) {
				out.add(raw.replace(/\s+/g, ' '));
			}
			i = j + 1;
			selStart = i;
			continue;
		}
		if (css[i] === '}') {
			i++;
			selStart = i;
			continue;
		}
		i++;
	}
	return out;
}

function report(name, upstreamPath, entry) {
	const upstream = selectors(readFileSync(resolve(root, upstreamPath), 'utf8'));
	// Собираем БЕЗ минификации и прогоняем через ту же постобработку, что и
	// релизный артефакт: минификатор переписывает селекторы (снимает кавычки в
	// атрибутах, склеивает правила), и сравнивать с апстримом было бы нечестно,
	// а постобработку проверить надо — она режет @layer и @supports.
	const raw = `.build/audit-${name}`;
	const done = `.build/audit-${name}.out.css`;
	execFileSync('npx', ['tailwindcss', '-i', entry, '-o', raw],
		{ cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
	execFileSync('node', ['scripts/postprocess.mjs', raw, done],
		{ cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
	const built = selectors(readFileSync(resolve(root, done), 'utf8'));

	const missing = [...upstream].filter((s) => !built.has(s));
	const extra = [...built].filter((s) => !upstream.has(s));
	const unexplained = missing.filter((s) => !EXPECTED_MISSING.has(s));

	console.log(`\n=== ${name} ===`);
	console.log(`  апстрим: ${upstream.size}   собрано: ${built.size}   ` +
		`совпало: ${upstream.size - missing.length}`);
	if (unexplained.length) {
		console.log(`  MISSING (${unexplained.length}) — потерянные правила:`);
		for (const s of unexplained) console.log(`    ${s}`);
	} else {
		console.log('  MISSING: нет');
	}
	const explained = missing.filter((s) => EXPECTED_MISSING.has(s));
	if (explained.length)
		console.log(`  осознанно отсутствуют: ${explained.length}`);
	if (verbose && extra.length) {
		console.log(`  EXTRA (${extra.length}):`);
		for (const s of extra) console.log(`    ${s}`);
	} else {
		console.log(`  EXTRA: ${extra.length} (--verbose чтобы посмотреть)`);
	}
	return unexplained.length;
}

let bad = 0;
bad += report('cascade.css', 'refs/upstream-25.12/cascade.css', 'src/cascade.css');
bad += report('mobile.css', 'refs/upstream-25.12/mobile.css', 'src/mobile.css');
console.log('');
process.exit(bad ? 1 : 0);
