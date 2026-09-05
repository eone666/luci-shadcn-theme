#!/usr/bin/env node
/*
 * Watch build: Tailwind watches src/**, and after every rebuild its
 * fingerprints are stripped from the output (scripts/postprocess.mjs) — so that
 * what the test bench shows matches, byte for byte, what ends up in the
 * package.
 *
 * theme/globals.css is not part of Tailwind's import graph (tokens.mjs is what
 * reads it), so it is watched separately.
 */
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const OUT = 'luci-theme-shadcn/htdocs/luci-static/shadcn';

const ENTRIES = [
	{ name: 'cascade.css', src: 'src/cascade.css' },
	{ name: 'mobile.css', src: 'src/mobile.css' },
];

const children = [];
const run = (cmd, args, opts = {}) => {
	const c = spawn(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
	children.push(c);
	return c;
};

for (const e of ENTRIES) {
	run('npx', ['tailwindcss', '-i', e.src, '-o', `.build/${e.name}`, '--minify', '--watch']);

	let timer = null;
	watch(resolve(root, '.build', e.name), () => {
		// Tailwind writes the file in several passes — wait until it settles
		clearTimeout(timer);
		timer = setTimeout(() => {
			run('node', ['scripts/postprocess.mjs', `.build/${e.name}`, `${OUT}/${e.name}`]);
		}, 120);
	});
}

// the palette sits outside the import graph: editing it requires rebuilding
// tokens.css
watch(resolve(root, 'theme/globals.css'), () => {
	console.log('theme/globals.css changed — rebuilding tokens');
	run('node', ['scripts/tokens.mjs']);
});

const stop = () => {
	for (const c of children) c.kill();
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('watch: src/** -> .build -> ' + OUT + '\nCtrl+C to stop');
