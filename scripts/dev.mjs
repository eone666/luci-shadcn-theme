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
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import { root, OUT, ENTRIES } from './lib/entries.mjs';

// the palette has to be normalised once before the watchers start, or the very
// first Tailwind pass builds against a stale (or missing) tokens.css
spawnSync('node', ['scripts/tokens.mjs'], { cwd: root, stdio: 'inherit' });

const children = [];
const run = (cmd, args, opts = {}) => {
	const c = spawn(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
	children.push(c);
	return c;
};

/* A watcher that dies has to say so: the failure mode this guards against is a
   dev.mjs that keeps printing "watch: …" while nothing is rebuilding. */
const supervise = (label, child) => {
	child.on('exit', (code, signal) => {
		if (signal) return;   // our own kill() on Ctrl+C
		console.error(`\n${label} exited (code ${code}) — nothing is watching any more.` +
			'\nRestart `npm run dev`.');
	});
	return child;
};

// Tailwind's plain --watch stops the moment stdin is not a TTY: it prints its
// banner and exits, leaving dev.mjs alive and apparently fine. That makes
// `npm run dev` a no-op whenever it is not driven from a terminal — under nohup,
// an IDE run configuration, CI, or a wrapper script. --watch=always keeps
// watching regardless of stdin.
for (const e of ENTRIES)
	supervise(`tailwindcss (${e.name})`,
		run('npx', ['tailwindcss', '-i', e.src, '-o', `.build/${e.name}`, '--minify', '--watch=always']));

/* Watch the directory rather than the files inside it: on a clean tree (after
   `npm run clean`) Tailwind has not written them yet, and fs.watch throws
   ENOENT on a missing path — which used to take dev.mjs down with it. */
mkdirSync(resolve(root, '.build'), { recursive: true });

const timers = new Map();
watch(resolve(root, '.build'), (_event, file) => {
	const e = ENTRIES.find((x) => x.name === file);
	if (!e) return;
	// Tailwind writes the file in several passes — wait until it settles
	clearTimeout(timers.get(file));
	timers.set(file, setTimeout(() => {
		run('node', ['scripts/postprocess.mjs', `.build/${e.name}`, `${OUT}/${e.name}`]);
	}, 120));
});

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
