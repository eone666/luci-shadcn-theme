#!/usr/bin/env node
/*
 * Watch-сборка: Tailwind следит за src/**, а после каждой пересборки из вывода
 * убираются следы Tailwind (scripts/postprocess.mjs) — чтобы то, что видно на
 * стенде, побайтово совпадало с тем, что уедет в пакет.
 *
 * theme/globals.css в графе импортов Tailwind не участвует (в него смотрит
 * tokens.mjs), поэтому за ним следим отдельно.
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
		// Tailwind пишет файл в несколько приёмов — ждём, пока успокоится
		clearTimeout(timer);
		timer = setTimeout(() => {
			run('node', ['scripts/postprocess.mjs', `.build/${e.name}`, `${OUT}/${e.name}`]);
		}, 120);
	});
}

// палитра лежит вне графа импортов: правка requires пересборку tokens.css
watch(resolve(root, 'theme/globals.css'), () => {
	console.log('theme/globals.css изменился — пересобираю токены');
	run('node', ['scripts/tokens.mjs']);
});

const stop = () => {
	for (const c of children) c.kill();
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('watch: src/** -> .build -> ' + OUT + '\nCtrl+C чтобы остановить');
