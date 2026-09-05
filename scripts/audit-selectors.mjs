#!/usr/bin/env node
/*
 * Selector diff: what luci-theme-bootstrap had versus what our build produces.
 *
 * The theme does not control the markup — the classes come from LuCI core. So
 * the only way to catch a rule lost while porting to @apply is to compare the
 * selector lists against upstream. MISSING must stay empty (apart from the
 * deliberate exceptions).
 *
 *   node scripts/audit-selectors.mjs            # cascade.css + mobile.css
 *   node scripts/audit-selectors.mjs --verbose  # EXTRA as well
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const verbose = process.argv.includes('--verbose');

/* Selectors we deliberately do not have: upstream mechanics replaced by tokens
   or utilities. Every entry carries its reason. */
const EXPECTED_MISSING = new Map([
	[':root', 'the palette comes from theme/globals.css'],
	[':root[data-darkmode="true"]', 'dark palette lives there too, selector duplicated by tokens.mjs'],
	['input[type="search"]::-webkit-search-decoration', 'vendor prefix, stripped by the minifier'],
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
			// a comment may sit right before the selector — strip it out of the text
			const raw = css.slice(selStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
			// @media/@layer/@supports are wrappers, so we descend into them; @keyframes
			// and @property count as a single unit
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
				// normalisation: every selector in the list separately, whitespace collapsed,
				// attribute quotes normalised to double quotes
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
	// Build WITHOUT minification and run the same postprocessing as the release
	// artifact: the minifier rewrites selectors (drops quotes in attributes, merges
	// rules), which would make the comparison against upstream unfair — while the
	// postprocessing does need checking, since it cuts @layer and @supports.
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
	console.log(`  upstream: ${upstream.size}   built: ${built.size}   ` +
		`matched: ${upstream.size - missing.length}`);
	if (unexplained.length) {
		console.log(`  MISSING (${unexplained.length}) — lost rules:`);
		for (const s of unexplained) console.log(`    ${s}`);
	} else {
		console.log('  MISSING: none');
	}
	const explained = missing.filter((s) => EXPECTED_MISSING.has(s));
	if (explained.length)
		console.log(`  deliberately absent: ${explained.length}`);
	if (verbose && extra.length) {
		console.log(`  EXTRA (${extra.length}):`);
		for (const s of extra) console.log(`    ${s}`);
	} else {
		console.log(`  EXTRA: ${extra.length} (--verbose to list them)`);
	}
	return unexplained.length;
}

let bad = 0;
bad += report('cascade.css', 'refs/upstream-25.12/cascade.css', 'src/cascade.css');
bad += report('mobile.css', 'refs/upstream-25.12/mobile.css', 'src/mobile.css');
console.log('');
process.exit(bad ? 1 : 0);
