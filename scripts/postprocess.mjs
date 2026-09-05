#!/usr/bin/env node
/*
 * Strips Tailwind's fingerprints from the built CSS: a finished theme should
 * not advertise what it was built with, nor drag along foreign machinery.
 *
 * What it does:
 *   1. Removes the `/*! tailwindcss ... *\/` banner and puts our own header
 *      in its place.
 *   2. Drops `@layer properties{...}` — a fallback for browsers without
 *      @property (we require Chrome 111+, which has it).
 *   3. Unwraps `@layer theme{...}` and `@layer base{...}`: the theme has no
 *      layers of its own, the rules must sit flat as in upstream's
 *      cascade.css.
 *   4. Flattens `@supports (color: color-mix(in lab, red, red)){...}`.
 *      Note: the value WE WANT, the one with transparency (bg-input/30),
 *      lives inside such a block while the opaque fallback is outside — which
 *      is why the block is flattened rather than dropped.
 *   5. Renames the `--tw-*` variables to `--th-*`.
 *
 *   node scripts/postprocess.mjs <input> <output>
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const HEADER = (name) => `/*!
 * luci-theme-shadcn — ${name}
 * A shadcn/ui-styled theme for LuCI. Built from sources (src/), do not edit.
 * Palette: theme/globals.css. License: Apache-2.0.
 */
`;

/** Find the end of the block that opens at position brace (the '{' index). */
function blockEnd(css, brace) {
	let depth = 0;
	for (let i = brace; i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) return i;
	}
	return css.length - 1;
}

/** Locate an at-rule by substring and return [start, braceIdx, endIdx]. */
function findAtRule(css, needle, from = 0) {
	let at = from;
	for (;;) {
		const start = css.indexOf(needle, at);
		if (start < 0) return null;
		// it must be a block: only whitespace may sit between the name and '{'.
		// otherwise `@layer theme` would match the declaration
		// `@layer theme,base,components,utilities;` and glue neighbouring rules
		const rest = css.slice(start + needle.length);
		const m = rest.match(/^\s*\{/);
		if (m) {
			const brace = start + needle.length + m[0].length - 1;
			return [start, brace, blockEnd(css, brace)];
		}
		at = start + needle.length;
	}
}

/** Remove an at-rule entirely, contents included. */
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

/** Replace an at-rule with its contents (unwrap/flatten). */
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
	console.error('an input path and an output path are required');
	process.exit(1);
}

let css = readFileSync(input, 'utf8');
const before = css.length;
const report = [];

// 1. banner
const banner = css.match(/^\/\*![^]*?\*\/\s*/);
if (banner) {
	css = css.slice(banner[0].length);
	report.push('banner removed');
}

// 2. fallback for browsers without @property
{
	const [next, n] = dropAtRule(css, '@layer properties');
	css = next;
	if (n) report.push(`@layer properties dropped (${n})`);
}

// 3. first remove the layer-order declaration — it has no effect and gets in
//    the way when searching for blocks of the same name
css = css.replace(/@layer\s+[^;{]+;/g, () => {
	report.push('@layer declaration removed');
	return '';
});

// then unwrap the layers themselves
for (const layer of ['@layer theme', '@layer base', '@layer components', '@layer utilities']) {
	const [next, n] = unwrapAtRule(css, layer);
	css = next;
	if (n) report.push(`${layer} unwrapped (${n})`);
}
// 4. @supports around color-mix: the inner value is what must come out
{
	let total = 0;
	for (;;) {
		const [next, n] = unwrapAtRule(css, '@supports (color:color-mix(in lab, red, red))');
		css = next;
		if (!n) break;
		total += n;
	}
	// in case the same condition is formatted differently
	for (;;) {
		const found = css.match(/@supports\s*\(color:\s*color-mix\([^)]*\)[^)]*\)\s*\{/);
		if (!found) break;
		const [next, n] = unwrapAtRule(css, found[0].slice(0, found[0].indexOf('{')));
		if (!n) break;
		css = next;
		total += n;
	}
	if (total) report.push(`@supports(color-mix) flattened (${total})`);
}

// 5. internal utility variables: the name must not spell out the tool
const twCount = (css.match(/--tw-/g) || []).length;
if (twCount) {
	css = css.replaceAll('--tw-', '--th-');
	report.push(`--tw-* -> --th-* (${twCount})`);
}

const leftovers = [];
if (/tailwind/i.test(css)) leftovers.push('the word tailwind');
if (/--tw-/.test(css)) leftovers.push('--tw-');
if (/@layer/.test(css)) leftovers.push('@layer');

const name = output.split('/').pop();
/* Write through a temporary file: the test bench serves this CSS straight
   from a bind mount, and a browser hitting a partial write would get a
   truncated theme. */
const tmp = `${output}.tmp`;
writeFileSync(tmp, HEADER(name) + css.trimStart());
renameSync(tmp, output);

const after = HEADER(name).length + css.trimStart().length;
console.log(`postprocess ${name}: ${report.join(', ')}`);
console.log(`  ${before} -> ${after} bytes` +
	(leftovers.length ? `   LEFTOVERS: ${leftovers.join(', ')}` : '   no Tailwind traces'));
if (leftovers.length) process.exit(1);
