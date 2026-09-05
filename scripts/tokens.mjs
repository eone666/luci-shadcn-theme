#!/usr/bin/env node
/*
 * theme/globals.css — the file downloaded from https://ui.shadcn.com/create —
 * is kept in the repository as is and is never edited by hand: recolouring the
 * theme means replacing that file.
 *
 * There is exactly one problem: shadcn ships it as a ready-made application
 * entry point, i.e. with `@import "tailwindcss"` (which would drag in preflight
 * and class auto-scanning) and sometimes with `@import "tw-animate-css"` (a
 * package we do not have). Imports are managed by src/cascade.css, so they are
 * stripped here while everything else — variables, @custom-variant,
 * @theme inline, @layer base — is carried over byte for byte.
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
	console.error(`tokens: ${src} not found\n` +
		`Download a theme from https://ui.shadcn.com/create and save it as theme/globals.css`);
	process.exit(1);
}

// Only known imports are stripped: an @import lost silently means styles lost
// silently, so an unknown one is a hard error.
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

// shadcn puts the dark values in `.dark`, while LuCI switches modes with the
// data-darkmode attribute. The selector is duplicated so the palette applies
// under either signal (the class is set by header.ut, the attribute is an
// inherited contract).
let darkDuped = 0;
css = css.replace(/(^|\n)([ \t]*)\.dark(\s*\{)/, (m, pre, indent, brace) => {
	darkDuped = 1;
	return `${pre}${indent}.dark, :root[data-darkmode="true"]${brace}`;
});

// For the same reason the variant itself is widened: `dark:*` in @apply must
// also trigger on the attribute. The last @custom-variant declaration wins, but
// it is rewritten right here so the result does not depend on import order.
/* The prefix form, not shadcn's `&:is(.dark *)`: Tailwind expands the variant
   as a nested rule, and for a selector with a pseudo-element that yields the
   invalid `::before:is(.dark *)`, which browsers discard rule and all.
   `.dark &` produces a valid `.dark input::before`, and this theme is full of
   them. */
const DARK_VARIANT =
	'@custom-variant dark (:is(.dark, [data-darkmode="true"]) &);';
let variantPatched = 0;
css = css.replace(/^[ \t]*@custom-variant\s+dark\b.*$/m, () => {
	variantPatched = 1;
	return DARK_VARIANT;
});

const header =
	'/* GENERATED from theme/globals.css — do not edit (see scripts/tokens.mjs) */\n\n';

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, header + css.replace(/^\n+/, ''));

if (unknown.length) {
	console.error(`tokens: unknown @import in ${src}: ${unknown.join(', ')}\n` +
		`Imports are managed by src/cascade.css. Either add the import there by hand, ` +
		`or list it in ALLOWED_IMPORTS.`);
	process.exit(1);
}

const has = (re) => (re.test(css) ? 'yes' : 'NO');
console.log(`tokens: ${src.replace(root + '/', '')} -> ${out.replace(root + '/', '')}`);
if (dropped.length)
	console.log(`  imports stripped: ${dropped.join(', ')}`);
console.log(`  :root: ${has(/:root\s*\{/)}   ` +
	`dark palette: ${has(/\.dark,\s*:root\[data-darkmode/)}` +
	`${darkDuped ? ' (selector duplicated)' : ''}   ` +
	`@theme inline: ${has(/@theme\s+inline\s*\{/)}   ` +
	`variant dark: ${variantPatched ? 'widened to data-darkmode' : 'NO'}`);

if (!/:root\s*\{/.test(css)) {
	console.error('tokens: the file has no :root block — this does not look like a shadcn globals.css');
	process.exit(1);
}

/* Tailwind v3-era themes stored colours as triplets (`--background: 0 0% 100%`)
   and expanded them with `hsl(var(--background))`. Here the variables go straight
   into colour properties, so such a file would produce invalid colours — better
   to fail with a clear message. */
const legacyTriplet = css.match(/--(?:background|foreground|primary|border):\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/);
if (legacyTriplet) {
	console.error(
		`tokens: this looks like a Tailwind v3 theme — the colours are HSL triplets ` +
		`(${legacyTriplet[0]}).\nA Tailwind v4 file is required, where the values are ` +
		`ready-made colours: oklch(...)/hsl(...)/#rrggbb.`);
	process.exit(1);
}
if (!darkDuped)
	console.warn('tokens: WARNING — the file has no .dark block, the palette will not bring a dark theme');
/* Not a problem in itself: src/theme-map.css declares the same variant and is
   imported after the palette, so `dark:` inside @apply keeps working. Worth a
   line in the log all the same -- it says which of the two is in force. */
if (!variantPatched)
	console.log('  the palette has no @custom-variant dark of its own — ' +
		'the one from src/theme-map.css applies');
