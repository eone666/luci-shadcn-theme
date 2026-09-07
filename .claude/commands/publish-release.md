---
description: Publish a release — bump the version, rebuild, write the changelog into RELEASE_NOTES.md, publish it with gh
argument-hint: <version, e.g. 1.0.2>
---

Publish release **$1** of luci-theme-shadcn.

`RELEASE_NOTES.md` is the body of the GitHub release, uploaded verbatim — so it
has to be correct and readable on its own, not a dump of commit subjects.

## 1. Preflight

- If `$1` is missing or is not `x.y.z`, stop and ask for it. Suggest the bump
  that fits what actually changed (patch for fixes, minor once the visual
  language moves) rather than guessing silently.
- `git status --porcelain` — the release should be cut from a committed tree.
  If it is dirty, say so and ask whether to commit first or release as is.
- `gh auth status` — if it is not authenticated, stop and tell the user to run
  `! gh auth login` in the prompt; do not try to log in.
- `git log --oneline $(git describe --tags --abbrev=0)..HEAD` and
  `git diff --stat $(git describe --tags --abbrev=0)..HEAD` — this is the
  material for the changelog. Read it before writing anything.

## 2. Mechanical part

```
npm run release -- $1
```

`scripts/release.mjs` bumps `PKG_VERSION` in `luci-theme-shadcn/Makefile` and
`version` in `package.json` (they must match or `package.sh` refuses), runs the
build and the selector audit, builds the `.apk` in the OpenWrt SDK, then updates
`RELEASE_NOTES.md`: the version in the download URL and the filenames, the
`sha256`, the package size, and the commit list between the
`<!-- changelog:start -->` markers.

Add `--shots` when the look changed, to regenerate `docs/img/`. The SDK build
needs docker (`npm run bench` shows whether it is up) and runs under emulation,
so give it a few minutes.

If the audit reports anything under `MISSING`, stop — a selector was lost and
the release should not go out.

## 3. The prose — this is the part only you can do

The script does not touch the text above the commit list. Rewrite the
`## What's new` section for this release from the diff you read in step 1:

- Lead with what a user of the theme will notice, not with file names. "Selects
  finally look like the recipe", not "rewrote select-native.css".
- Group into a few short subsections; keep the `### Other` bucket for tooling
  and packaging.
- Say what was wrong before when that is what makes the change legible — the
  previous notes do this ("the button overlapped the input by ~3px, over the
  input's own rounded corner, at a different height").
- Only claim what the diff supports. If a measurement is quoted, it must be one
  actually taken, not an estimate.
- Update the opening line: whether this is a drop-in replacement, and anything
  that changes the install or the browser requirements.
- Leave the `## Installation`, `## Switching to it`, `## Removing it` and
  `## Good to know` sections alone unless they actually changed — the script
  keeps their version strings current.

Then read the whole file top to bottom as the user will see it on the release
page, and fix anything stale.

## 4. Check before publishing

- `git diff RELEASE_NOTES.md package.json luci-theme-shadcn/Makefile`
- the built artifact is `.sdk-out/luci-theme-shadcn-$1-r<PKG_RELEASE>.apk`;
  confirm the `sha256` in the notes matches `shasum -a 256` on that file
- optionally `npm run package:check` — installs the `.apk` into a clean OpenWrt
  and verifies it

## 5. Publish

Publishing is outward-facing and hard to take back, so **show the user the final
`RELEASE_NOTES.md` and the exact `gh` command, and wait for them to confirm.**
Do not publish on your own initiative.

After they confirm:

```
git add -A && git commit -m "Release $1"
git tag -a v$1 -m "v$1" && git push --follow-tags
gh release create v$1 .sdk-out/luci-theme-shadcn-$1-r<PKG_RELEASE>.apk \
  --title "v$1" --notes-file RELEASE_NOTES.md
```

The `-a` matters: `--follow-tags` pushes annotated tags and silently skips
lightweight ones, so a plain `git tag v$1` sends `main` up on its own and leaves
the tag behind. Annotated also matches the existing tags. Check the push output
names the tag before creating the release; if it does not, `git push origin v$1`.

Then report the release URL `gh` prints.
