#!/usr/bin/env node
/*
 * One build: palette -> tokens, Tailwind -> .build/, postprocess -> the package.
 *
 *   npm run build
 *
 * The output is what ships: scripts/postprocess.mjs leaves no trace of Tailwind
 * in it, so the router gets an ordinary LuCI stylesheet.
 */
import { spawnSync } from 'node:child_process';
import { root, OUT, ENTRIES } from './lib/entries.mjs';

const run = (cmd, args) => {
	const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
	if (r.status !== 0) process.exit(r.status ?? 1);
};

run('node', ['scripts/tokens.mjs']);

for (const e of ENTRIES) {
	run('npx', ['tailwindcss', '-i', e.src, '-o', `.build/${e.name}`, '--minify']);
	run('node', ['scripts/postprocess.mjs', `.build/${e.name}`, `${OUT}/${e.name}`]);
}
