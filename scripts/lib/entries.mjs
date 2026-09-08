/*
 * The CSS entry points, in one place: scripts/build.mjs and scripts/dev.mjs
 * both need to know what is built and where it lands, and the package Makefile
 * ships whatever ends up in OUT.
 */
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..', '..');

/** Where the built stylesheets go — inside the package, as it ships. */
export const OUT = 'luci-theme-shadcnui/htdocs/luci-static/shadcnui';

/** Tailwind builds one file per entry; postprocess.mjs then strips it down. */
export const ENTRIES = [
	{ name: 'cascade.css', src: 'src/cascade.css' },
	{ name: 'mobile.css', src: 'src/mobile.css' },
];
