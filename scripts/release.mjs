#!/usr/bin/env node
/*
 * Cut a release: bump the version, rebuild everything, and bring
 * RELEASE_NOTES.md up to date so the file can be pasted into the GitHub
 * release as it is.
 *
 *   node scripts/release.mjs 1.0.2
 *   node scripts/release.mjs 1.0.2 --shots        # regenerate docs/img too
 *   node scripts/release.mjs 1.0.2 --no-package   # skip the SDK build
 *
 * What it touches:
 *   luci-theme-shadcn/Makefile   PKG_VERSION
 *   package.json                 version   (package.sh refuses to build if the
 *                                           two disagree)
 *   RELEASE_NOTES.md             every reference to the old version, the
 *                                sha256 of the new .apk, its size, and the
 *                                commit list between the markers
 *
 * What it deliberately does not do: commit, tag, push or create the release.
 * Those are outward-facing and are printed as the next steps instead.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const NOTES = join(root, 'RELEASE_NOTES.md');
const MAKEFILE = join(root, 'luci-theme-shadcn/Makefile');
const PKG_JSON = join(root, 'package.json');
const OUT = join(root, '.sdk-out');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const version = argv.find((a) => !a.startsWith('--'));

const die = (msg) => { console.error(`\n${msg}`); process.exit(1); };
const rel = (p) => p.replace(`${root}/`, '');
const step = (msg) => console.log(`\n== ${msg} ==`);

if (!version)
	die('usage: node scripts/release.mjs <version> [--shots] [--no-package]');
if (!/^\d+\.\d+\.\d+$/.test(version))
	die(`not a version: ${version} (expected x.y.z)`);

/* Run a command, inheriting stdio so the SDK build stays watchable. */
const run = (cmd, args, label) => {
	const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
	if (r.status !== 0) die(`${label} failed (exit ${r.status ?? 'signal'})`);
};

const git = (...args) => {
	const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	return r.status === 0 ? r.stdout.trim() : null;
};

/* --- preflight ----------------------------------------------------------- */

const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));
const oldVersion = pkg.version;
if (oldVersion === version)
	die(`package.json is already at ${version} — nothing to bump.\n` +
		'Re-running a release over itself would leave the notes pointing at a\n' +
		'tag that already exists; bump to the next version instead.');

if (git('rev-parse', '-q', '--verify', `refs/tags/v${version}`))
	die(`tag v${version} already exists`);

const makefile = readFileSync(MAKEFILE, 'utf8');
const pkgRelease = makefile.match(/^PKG_RELEASE:=(\d+)$/m)?.[1];
if (!pkgRelease) die(`no PKG_RELEASE in ${MAKEFILE}`);

if (!existsSync(NOTES)) die(`no ${NOTES}`);
let notes = readFileSync(NOTES, 'utf8');
if (!notes.includes(oldVersion) && !notes.includes('__SHA256__'))
	console.warn(`warning: RELEASE_NOTES.md mentions neither ${oldVersion} nor ` +
		'__SHA256__ — the version strings may not be updated');

const dirty = git('status', '--porcelain');
if (dirty) console.warn('\nnote: the working tree is dirty; releasing it as is');

console.log(`\nluci-theme-shadcn ${oldVersion} -> ${version} (r${pkgRelease})`);

/* --- version bump -------------------------------------------------------- */

step('version');
const bumpedMakefile = makefile.replace(/^PKG_VERSION:=.*$/m, `PKG_VERSION:=${version}`);
if (bumpedMakefile === makefile) die('PKG_VERSION not found in the Makefile');
writeFileSync(MAKEFILE, bumpedMakefile);
pkg.version = version;
writeFileSync(PKG_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Makefile PKG_VERSION and package.json version -> ${version}`);

/* --- rebuild ------------------------------------------------------------- */

step('build');
run('npm', ['run', 'build'], 'build');

step('audit');
run('npm', ['run', 'audit'], 'audit');   // exits 1 if a selector went MISSING

if (flags.has('--shots')) {
	step('screenshots');
	run('npm', ['run', 'shots', '--', '--out', 'docs/img', 'login', 'startup', 'interfaces', 'dashboard'], 'shots');
	run('npm', ['run', 'shots', '--', '--light', '--out', 'docs/img', 'system'], 'shots (light)');
	run('npm', ['run', 'shots', '--', '--width', '420', '--out', 'docs/img', '--suffix', '-mobile', 'system'], 'shots (mobile)');
	run('node', ['scripts/hero.mjs'], 'hero');
}

let apk = null;
if (!flags.has('--no-package')) {
	step('package');
	run('npm', ['run', 'package'], 'package');
	const found = existsSync(OUT)
		? readdirSync(OUT).filter((f) => f.endsWith('.apk')).sort()
		: [];
	if (!found.length) die(`the SDK produced no .apk in ${OUT}`);
	if (found.length > 1) die(`several .apk in ${OUT}: ${found.join(', ')}`);
	apk = join(OUT, found[0]);
	const expected = `luci-theme-shadcn-${version}-r${pkgRelease}.apk`;
	if (found[0] !== expected)
		die(`built ${found[0]}, expected ${expected} — the version bump did not reach the SDK`);
}

/* --- release notes ------------------------------------------------------- */

step('release notes');

/* Every package-specific mention of the old version. The strings are anchored
   on the package name and the tag prefix, so unrelated numbers in the prose
   ("OpenWrt 25.12", "Chrome 111+") are left alone. */
const before = notes;
notes = notes
	.replaceAll(`luci-theme-shadcn-${oldVersion}-r${pkgRelease}.apk`,
	            `luci-theme-shadcn-${version}-r${pkgRelease}.apk`)
	.replaceAll(`/v${oldVersion}/`, `/v${version}/`)
	/* "drops on top of <predecessor>" — that is the version we just bumped
	   away from, not the new one */
	.replace(/on top of \d+\.\d+\.\d+/, `on top of ${oldVersion}`);
if (notes === before)
	console.warn('warning: no version string in RELEASE_NOTES.md changed');

if (apk) {
	const buf = readFileSync(apk);
	const sha = createHash('sha256').update(buf).digest('hex');
	const kb = Math.round(statSync(apk).size / 1024);
	/* the hash lives in a comment under the sha256sum call: either the
	   placeholder or the previous release's hash */
	const shaLine = new RegExp('^# (?:__SHA256__|[0-9a-f]{64})$', 'm');
	if (shaLine.test(notes)) notes = notes.replace(shaLine, `# ${sha}`);
	else console.warn('warning: no "# <sha256>" line in RELEASE_NOTES.md');
	notes = notes.replace(/It weighs \d+ KB/, `It weighs ${kb} KB`);
	console.log(`${rel(apk)}  ${kb} KB\nsha256 ${sha}`);
}

/* The commit list is machine-owned: it sits between markers, inside a
   <details> so it does not bury the hand-written notes, and HTML comments do
   not render in a release body. The prose above it is never touched. */
const lastTag = git('describe', '--tags', '--abbrev=0');
if (lastTag) {
	const log = git('log', '--no-merges', '--pretty=- %s (%h)', `${lastTag}..HEAD`);
	const body = log
		? `<details>\n<summary>All commits since ${lastTag}</summary>\n\n${log}\n\n</details>`
		: `_No commits since ${lastTag}._`;
	const block = `<!-- changelog:start -->\n${body}\n<!-- changelog:end -->`;
	const markers = /<!-- changelog:start -->[\s\S]*?<!-- changelog:end -->/;
	if (markers.test(notes)) notes = notes.replace(markers, block);
	else if (notes.includes('\n## Installation'))
		notes = notes.replace('\n## Installation', `\n${block}\n\n## Installation`);
	else notes += `\n${block}\n`;
	console.log(`commit list: ${log ? log.split('\n').length : 0} entries since ${lastTag}`);
} else {
	console.log('no tag to diff against — commit list skipped');
}

writeFileSync(NOTES, notes);

/* --- what is left to do by hand ------------------------------------------ */

console.log(`
== done ==

RELEASE_NOTES.md now carries ${version}${apk ? ', the new sha256 and size' : ''}.

Still yours to do:
  1. Write the prose for this release above the commit list — the mechanical
     fields are current, the "What's new" text is not regenerated.
  2. git add -A && git commit -m "Release ${version}"
  3. git tag v${version} && git push --follow-tags
  4. Upload ${apk ? rel(apk) : 'the .apk'} to the release and paste
     RELEASE_NOTES.md as its body.
`);
