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
 *   6. Shrinks the result: drops variables nobody reads and rules the next rule
 *      fully overrides, merges neighbours that share a selector, and clears out
 *      the declarations that merging leaves dead. See shrink() for why each of
 *      those is safe -- around 9 KB on cascade.css, with not one computed style
 *      changed.
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

/* --- size pass ------------------------------------------------------------
 * The theme ships to a router, where every kilobyte sits in flash and goes
 * over the wire uncompressed (uhttpd does not gzip). Tailwind's output is
 * written for a bundler that is expected to do this pass; we do it ourselves.
 */

/** Split CSS into top-level rules, respecting quoted strings (data: URIs in
 *  this file carry both braces and semicolons). */
function parseRules(css) {
	const out = [];
	let start = 0, depth = 0, brace = -1, quote = null;
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (quote) {
			if (c === '\\') i++;
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'") quote = c;
		else if (c === '{') { if (depth++ === 0) brace = i; }
		else if (c === '}' && --depth === 0) {
			out.push({
				prelude: css.slice(start, brace).trim(),
				body: css.slice(brace + 1, i),
			});
			start = i + 1;
			brace = -1;
		}
	}
	const tail = css.slice(start).trim();
	if (tail) out.push({ prelude: tail, body: null });
	return out;
}

const render = (rules) => rules
	.map((r) => (r.body === null ? r.prelude : `${r.prelude}{${r.body}}`))
	.join('');

/** Split a declaration list on top-level semicolons. */
function splitDecls(body) {
	const out = [];
	let start = 0, depth = 0, quote = null;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (quote) {
			if (c === '\\') i++;
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'") quote = c;
		else if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ';' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
	}
	if (body.slice(start).trim()) out.push(body.slice(start));
	return out;
}

const propOf = (decl) => {
	const i = decl.indexOf(':');
	return i < 0 ? null : decl.slice(0, i).trim();
};

const NESTED = /^@(media|supports|container|scope)\b/;

function shrink(css, stats) {
	/* Which --th-* variables does anything actually read? Tailwind emits the
	   definition and the use inside the same rule, so a name never read in this
	   file is not read anywhere -- and where a read does cross files it carries
	   an inline fallback (mobile.css reads var(--th-leading, <computed>)), so
	   the worst case is the fallback rather than a broken declaration. */
	const used = new Set();
	for (const m of css.matchAll(/var\(\s*(--th-[a-z0-9-]+)/g)) used.add(m[1]);

	const pass = (rules) => {
		const out = [];
		for (const rule of rules) {
			if (rule.body === null) { out.push(rule); continue; }

			/* 1. an @property for a variable nobody reads describes nothing */
			const prop = rule.prelude.match(/^@property\s+(--th-[a-z0-9-]+)/);
			if (prop && !used.has(prop[1])) { stats.deadVars++; continue; }

			if (NESTED.test(rule.prelude)) {
				rule.body = render(pass(parseRules(rule.body)));
				if (!rule.body.trim()) continue;
				out.push(rule);
				continue;
			}

			/* 2. and neither does its declaration */
			const decls = splitDecls(rule.body).filter((d) => {
				const p = propOf(d);
				if (p && p.startsWith('--th-') && !used.has(p)) { stats.deadVars++; return false; }
				return true;
			});
			if (!decls.length) { stats.emptied++; continue; }
			rule.body = decls.join(';');
			rule.props = new Set(decls.map(propOf).filter(Boolean));
			rule.important = /!important/.test(rule.body);
			out.push(rule);
		}

		/* 3. a rule the very next one overrides in full, same selector and so
		   same specificity, is unreachable. This is what Tailwind's color-mix()
		   fallbacks are once the @supports wrapper is flattened away -- and they
		   only ever mattered to browsers without color-mix(), which cannot run
		   this file anyway: dropping @layer properties above already requires
		   @property, which landed later than color-mix() everywhere. */
		const kept = [];
		for (let i = 0; i < out.length; i++) {
			const a = out[i], b = out[i + 1];
			if (a.body !== null && b && b.body !== null && a.prelude === b.prelude &&
			    !a.important && a.props && b.props &&
			    [...a.props].every((p) => b.props.has(p))) {
				stats.shadowed++;
				continue;
			}
			kept.push(a);
		}

		/* 4. neighbours with the same selector become one rule: identical
		   declarations in identical order, minus a selector and two braces */
		const merged = [];
		for (const rule of kept) {
			const prev = merged[merged.length - 1];
			if (prev && rule.body !== null && prev.body !== null &&
			    prev.prelude === rule.prelude && !NESTED.test(rule.prelude) &&
			    !rule.prelude.startsWith('@')) {
				prev.body += ';' + rule.body;
				if (rule.props) for (const p of rule.props) prev.props.add(p);
				prev.merged = true;
				stats.merged++;
				continue;
			}
			merged.push(rule);
		}

		/* 5. inside one block only the last declaration of a property counts,
		   so the earlier ones are dead -- mostly the color-mix() fallbacks that
		   step 4 has just moved in next to their replacements. An !important
		   earlier on would outrank what follows, so those stay. */
		for (const rule of merged) {
			if (!rule.merged || rule.body === null) continue;
			const decls = splitDecls(rule.body);
			const lastAt = new Map();
			decls.forEach((d, i) => { const p = propOf(d); if (p) lastAt.set(p, i); });
			const keep = decls.filter((d, i) => {
				const p = propOf(d);
				if (!p || lastAt.get(p) === i || /!important/.test(d)) return true;
				stats.dupes++;
				return false;
			});
			rule.body = keep.join(';');
		}
		return merged;
	};

	return render(pass(parseRules(css)));
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

// 6. shrink
{
	const stats = { deadVars: 0, shadowed: 0, emptied: 0, merged: 0, dupes: 0 };
	const wasSize = css.length;
	css = shrink(css, stats);
	report.push(`shrunk by ${wasSize - css.length} bytes ` +
		`(dead vars ${stats.deadVars}, overridden rules ${stats.shadowed}, ` +
		`merged ${stats.merged}, dead declarations ${stats.dupes})`);
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
