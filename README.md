# luci-theme-shadcn

A theme for LuCI (OpenWrt 25.12) in the style of [shadcn/ui](https://ui.shadcn.com),
base color **neutral**. Three variants, just like the stock bootstrap theme:
`Shadcn` (follows `prefers-color-scheme`), `Shadcn-Light`, `Shadcn-Dark`.

The selectors and the markup are inherited from `luci-theme-bootstrap` — that is
the contract with LuCI core. The rules were rewritten with `@apply` after the
shadcn component recipes, and the entire palette lives in a single file,
`theme/globals.css`.

The built CSS carries no trace of Tailwind: no banner, no `@layer`, no `--tw-*`
(see "Build" below) — what ships to the router is an ordinary LuCI theme.

## Changing the palette — one file

Replace `theme/globals.css` and run `npm run build`. That is all.

**Any official shadcn set** works — the `globals.css` from `shadcn init`, one of
the ready-made base colors (neutral, zinc, slate, stone, gray), or a theme built
at https://ui.shadcn.com/create. The file is dropped in as is and never edited by
hand. Verified by building against the official neutral/zinc/slate/stone/gray.

Three things make that compatibility work:

- `src/theme-defaults.css` comes **before** the palette and only sets defaults
  (fonts, radius, `--success`/`--warning`, which shadcn does not have at all).
  Anything the theme defines itself overrides them.
- `src/theme-map.css` comes **after** and maps the tokens onto the utilities in
  full through `var(--x, <default>)` — so an incomplete set of variables in a
  theme does not break the build, and an `@theme inline` block inside the theme
  itself simply duplicates ours.
- `scripts/tokens.mjs` strips the `@import`s out of the file (they are managed by
  `src/cascade.css`), duplicates the dark-palette selector as
  `.dark, :root[data-darkmode="true"]` and widens the `dark:` variant to cover
  both signals. Everything else — variables, `@theme inline`, `@layer base` — is
  carried over byte for byte.

The only limitation: the file must be in the Tailwind v4 format, where variable
values are ready-made colors (`oklch(...)`, `hsl(...)`, `#rrggbb`). A v3-era theme
with HSL triplets (`--background: 0 0% 100%`) is rejected by the build with a
clear message.

### `--radius` really controls the geometry

The whole radius scale in `src/theme-map.css` is derived from `--radius` by
multiplication (`xs .2` / `sm .6` / `md .8` / `lg 1` / `xl 1.4` / `2xl 1.6`,
plus `pill 100` for buttons, tabs and badges). At shadcn's default
`--radius: 0.625rem` that reproduces its own scale to the pixel, and a palette
with `--radius: 0` comes out square everywhere — including the pills, which a
hardcoded `rounded-full` could never do. The only deliberate exception is the
radio button, which stays a circle.

One catch worth remembering: `luci-mod-dashboard` ships its own `custom.css`
that pins `border-radius: 16px` on `.dashboard-bg`, and the core's CSS is loaded
**after** the theme. Our rule repeats the class to win on specificity — the same
trick as for `.devices-info`. If a new core module starts overriding geometry,
`--radius: 0` is the quickest way to spot it.

## Development

```sh
cp .env.example .env
docker compose up -d --wait      # test bench: OpenWrt 25.12.4 + full LuCI
npm install
npm run dev                      # watch build for cascade.css and mobile.css
open http://localhost:8080       # root / openwrt
```

Edits under `src/**` show up on F5 — the CSS is mounted into the container
directly. Caching: on the bench the files carry no `?v=`, so keep DevTools open
with "Disable cache" or press Cmd+Shift+R (in the built package the version is
substituted by `SubstituteVersion` from `luci.mk`).

The theme variant is selected with the `LUCI_THEME` variable:

```sh
LUCI_THEME=shadcn-light docker compose up -d --force-recreate --wait
```

### Scripts

| | |
|---|---|
| `npm run build` | build `cascade.css` + `mobile.css` (minify + strip Tailwind traces) |
| `npm run dev` | the same in watch mode, including a token rebuild when the palette changes |
| `npm run tokens` | rebuild `src/generated/tokens.css` from `theme/globals.css` |
| `npm run audit` | diff the selectors against upstream: `MISSING` must be empty |
| `npm run shots` | screenshots of the bench pages (`shots/`); `-- --light` switches the bench to the light variant |
| `npm run shots:states` | screenshots of interactive states: dropdown, Save & Apply dialog, validation error, modal |
| `npm run inspect` | computed styles of an element on a live page: `npm run inspect -- system 'input[type=checkbox]'` |

Screenshots are needed because LuCI views render on the client — `curl` only sees
the theme's shell. The browser comes from the Playwright cache; `playwright-core`
downloads nothing.

`npm run audit` is the main safety net: the theme does not control the markup, the
classes come from LuCI core, so the only way to catch a rule lost during the port
is to compare the selector list against upstream in `refs/upstream-25.12/`.

## Layout

```
theme/globals.css          the active palette, shadcn neutral (never edited)
src/
  cascade.css              entry point -> htdocs/luci-static/shadcn/cascade.css
  mobile.css               entry point -> htdocs/luci-static/shadcn/mobile.css
  theme-map.css            tokens shadcn lacks: success/warning/fonts
  compat/bootstrap-vars.css  bootstrap variables -> shadcn tokens (permanent)
  base/                    reset, scaffolding, typography
  components/              buttons, forms, tables, tabs, header, modals, badges,
                           dropdown widget, uci diff, file browser
  mobile/screens.css       responsive rules (≤854/600/375px)
luci-theme-shadcn/         the package itself: htdocs, ucode templates, uci-defaults, Makefile
refs/upstream-25.12/       upstream reference for npm run audit
```

The built CSS is committed: the OpenWrt SDK has no node, so the package is built
from a ready artifact. The `src/` directory sits at the repository root rather
than inside `luci-theme-shadcn/` — there `luci.mk` would treat `src/` as a
directory of C sources.

## Build

`src/**` → Tailwind (`.build/`) → `scripts/postprocess.mjs` → `htdocs/luci-static/shadcn/`.

The postprocessing turns the output into an ordinary LuCI theme:

- removes the `/*! tailwindcss … */` banner and puts our own header there;
- unwraps `@layer theme` and `@layer base` — the theme has no layers of its own,
  the rules sit flat as in upstream's `cascade.css`;
- drops `@layer properties` (a fallback for browsers without `@property`);
- **flattens** `@supports (color: color-mix(…))`: the value we want, the one with
  transparency, lives inside such a block while the opaque fallback is outside,
  which is why the block is flattened rather than dropped;
- renames the internal `--tw-*` to `--th-*`;
- shrinks what is left: variables nothing reads (Tailwind emits a definition and
  its use in the same rule, so an unread name is dead everywhere), rules the very
  next rule overrides in full — which is exactly what those `color-mix()`
  fallbacks become once the wrapper is flattened — neighbouring rules that share
  a selector, and the declarations that merging leaves dead. Roughly 9 KB, and
  none of it changes a single computed style.

At the end the script checks that neither the word `tailwind`, nor `--tw-`, nor
`@layer` is left in the output — otherwise it fails. `npm run audit` works off the
same postprocessed file, so it catches cleanup errors too.

## What is inherited from the bootstrap theme

`header.ut`, `footer.ut`, `sysauth.ut`, `menu-shadcn.js` and
`view/shadcn/sysauth.js` are copies from upstream (Apache-2.0, commit `e9ebca7`).
Only the theme names changed, plus one line in `header.ut`: the dark variant gets
`class="dark"` alongside `data-darkmode="true"`, so that a downloaded
`globals.css` works verbatim.

## Visual design decisions

The reference is the shadcn/ui site itself: large radii, pill-shaped buttons,
content on cards, a header that is not set apart.

- **Buttons are pills** (`rounded-full`), the base being the `outline` variant in
  size `sm`: they live inside table rows, where a filled button on every row is
  far too loud. Fills are reserved for genuinely primary actions: `Save & Apply`
  (primary), the `Save` next to it (secondary), `Delete`/`Reset` (destructive
  outline).
- **Sections are cards.** `.cbi-section` is an existing LuCI container and the
  markup was left alone: it just gets a `bg-card` background, a border and
  `rounded-xl`. The action bar below them is the same kind of card.
- **The header is not separated from the body**: no border, no fill of its own.
  Since it is `sticky`, it has a translucent blurred background underneath — only
  so that content does not show through. Menu items span its full height (that is
  the hover area), and the highlight is a pill with some margin; the brand has no
  hover plate.
- **Submenus stick to the edge of their item** (`top: 100%`) instead of hanging at
  a fixed 40px as upstream did: otherwise a gap was left between the item and the
  menu, and the cursor lost hover before reaching the contents.
- **The geometry is shadcn's.** Fields are `h-9`, radii come from the `--radius`
  token, the base text size is `text-sm`. The two-column `.cbi-value` layout
  (180px title) is preserved — the views' layout depends on it.
- **Gradients and inset shadows are gone.** Focus is `ring-[3px] ring-ring/50`.
- **Tabs** are a pill-shaped segmented control sized to its content rather than an
  underline: LuCI tab strips wrap onto several lines, and an underline breaks once
  it wraps.
- **Alerts** are a neutral card with a colored accent instead of yellow-red
  banners. `.ifacebox-head.active` uses `accent`, not `primary`: in the neutral
  palette primary is a white block.
- **The dashboard** is drawn by the core's own CSS (`luci-mod-dashboard`), which
  paints the cards `--background-color-medium` with no border and sets
  `width: auto` on its tables. In a light palette that produced invisible
  surfaces, and the device list huddled at the left edge. The theme brings
  `.dashboard-bg` in line with the same cards the sections use and stretches the
  device table only — the small key/value tables need width to follow their
  content. The tag in the selector is deliberate: the core's `custom.css` loads
  after the theme and would win on equal specificity.
- **Dashboard icons** (`.svgmonotone`) are `<img>` elements with `stroke="#000"`
  baked in; they cannot be recolored, so in the dark theme they are inverted with
  a filter. The stock LuCI themes do not do this at all. Colored status icons are
  left alone: there the color carries meaning.
- **The login screen** follows shadcn's login block: a card centred on screen,
  labels above the fields, full-width fields and button, and the rule before the
  button hidden. The page canvas is `bg-muted` and the card is `bg-card`, i.e. the
  background is lighter than the card (which is how shadcn does it, not the other
  way round). There is no dimming scrim: nothing sits behind the modal on this
  page. The `sysauth.ut` markup was not touched — only the layout.
- **Narrow windows and phones are two different mechanisms.** The template links
  `mobile.css` by `max-device-width`, so it reacts to the device's physical screen
  and never fires when a desktop window is resized. That is why the header and tab
  layout for narrow windows is duplicated in `cascade.css` with viewport-width
  media queries (`max-width: 860px` and `720px`). On a phone both mechanisms mean
  the same thing, so there is no conflict.
- **Mobile mode.** The header is centred: the device name on the first line
  (upstream hid it on phones), the menu below it, wrapped items stay centred as
  well, and the indicators move to their own row underneath — pushing them right
  would eat into the width and break the centring. On a narrow screen the tab
  strip becomes a rectangular card, because a pill that wraps onto several lines
  turns into a shapeless blob. The dashboard tables are taken out of card mode:
  they carry no `data-title` labels, and the mode only breaks them.
- **Links are monochrome.** In the neutral palette `--primary` is nearly black in
  the light theme and nearly white in the dark one — that is shadcn's intent. If
  you want a colored accent, take a palette with non-zero chroma; no code changes
  needed.
- **`--success` and `--warning`** are not defined by shadcn, but LuCI cannot live
  without them (`.cbi-button-save`, `.alert-message.warning`, the uci diff) — they
  are declared in `src/theme-defaults.css` and survive a palette swap.

## Limitations

- `oklch()` and `color-mix()` require Chrome 111+, Safari 16.4+, Firefox 113+.
- The built `cascade.css` is ~73 KB against upstream's ~53 KB: `@apply` expands
  utilities into declarations, and the palette itself is another 3 KB. The size
  pass in `postprocess.mjs` takes off ~9 KB of that; what is left would need
  rules that share a declaration block but are not neighbours to be merged, which
  is only safe with a proper cascade analysis.
- The background of `.zonebadge[style]` and `.ifacebox-head[style]` arrives as an
  inline style from `resources/firewall.js`, and inline beats any class — the
  theme does not paint these elements.

## Test bench

Inside the container runs a full OpenWrt: procd, netifd, firewall4/nftables,
dnsmasq, odhcpd, uhttpd and all of LuCI from the release image plus
`luci-mod-dashboard`. Interfaces: `docker` (eth0, the link to the host), `lan`
(br-lan + veth, 192.168.1.1/24 with DHCP), `wan` (veth, 10.10.10.2/24) — so that
the Network pages and the firewall zones are not empty.

Three things shape the bench the way it is:

- **`platform: linux/aarch64_generic`.** The `openwrt/rootfs` images carry the
  OpenWrt target name in their manifest instead of `linux/arm64`, and without an
  explicit platform docker answers `no matching manifest`. For Intel/AMD use
  `x86_64` in `.env`.
- **A custom `/etc/config/network` in the image.** Otherwise the first boot calls
  `config_generate`, which wraps `eth0` into `br-lan`, and the container loses its
  docker address along with the published ports.
- **`eth0` is handed to netifd** (the `docker` interface plus an fw4 zone of the
  same name with `input ACCEPT`). netifd resets the state of every device on
  start, so hiding the uplink from it is pointless: `entrypoint.sh` moves the
  address and gateway assigned by docker into uci before init starts. That way the
  configuration survives boot, Save & Apply and a network restart from LuCI.

`privileged: true` is required by netifd, nftables and ujail (which dnsmasq and
ntpd run under). The bench is local and disposable; `docker compose down` wipes
its state.

The variant symlinks (`shadcn-light`, `shadcn-dark` → `shadcn`) are created inside
the container by `entrypoint.sh` — in the package they are real symlinks in git,
as upstream does it.

## Building the package

```sh
npm run package        # .apk in .sdk-out/
sh scripts/package-check.sh   # install it into a clean OpenWrt and verify
```

`scripts/package.sh` builds the package in the official OpenWrt SDK. The SDK only
exists for Linux, so the `openwrt/sdk:<target>-<version>` docker image is used; in
its `feeds.conf` the luci feed is pinned to the same `e9ebca7` commit the theme
was ported from, so what gets built is exactly what was tested on the bench. The
version and the target can be overridden:

```sh
OPENWRT_VERSION=25.12.5 OPENWRT_SDK_TARGET=x86-64 npm run package
```

Before building, the script rebuilds the CSS: the SDK has no node and the package
is built from a ready artifact — which is why the built CSS is committed to the
repository. A build from scratch (fresh container, feed update, compile) takes
about two minutes on an arm64 Mac, where the amd64 SDK image runs under emulation.

`scripts/package-check.sh` installs the resulting `.apk` into a fresh container
with a bare OpenWrt (not into the bench: there the theme is mounted from the host
and the symlinks are created by `entrypoint.sh`, so a real installation cannot be
verified) and checks that all files and symlinks are in place, that the minifiers
left no junk behind, that `uci-defaults` registered the three themes, that
`SubstituteVersion` substituted `?v=` into the template, that `csstidy` did not
mangle the CSS, and that LuCI serves a page with the theme linked in. It then
removes the package and verifies that `postrm` cleaned the entries out of uci.
Any mismatch makes the script exit non-zero.

Things worth knowing about the build:

- `include $(TOPDIR)/feeds/luci/luci.mk` instead of upstream's `../../luci.mk`:
  the relative path only works inside the feed tree, whereas this way the package
  builds from anywhere.
- `PKG_VERSION` is set explicitly: `luci.mk` derives the version from the git
  history of the luci feed, a standalone repository has none, and an empty `?v=`
  would end up in the templates.
- Only the `luci` feed is updated, and **nothing is installed** from it — all we
  need is `luci.mk`. `./scripts/feeds install luci-base` would drag its whole
  dependency chain (ucode, rpcd, lucihttp, …) into the build tree and buildroot
  would compile all of it before our package: two more feed clones (`base`,
  `packages`) and a failure in `liblucihttp-lua`, which needs `lua.h`. With
  `luci-base` absent from the tree, `package-metadata.pl` prints
  `WARNING: ... has a dependency on 'luci-base', which does not exist` and simply
  drops the build-order edge. The dependency still ends up in the package
  metadata (`depends: libc luci-base`), which is the only place it matters: the
  theme is pure data and compiles nothing.
- `LUCI_MINIFY_CSS:=0`: `csstidy`, which `luci.mk` uses to minify `htdocs/**.css`,
  does not understand `@layer`, `@property`, `oklch()` or `color-mix()` and would
  silently mangle the CSS — a breakage that only shows up in the built package,
  never on the bench.
- `LUCI_MINIFY_JS:=0`: `jsmin` lives in `luci-base/host`, which is not in the
  tree. `JsMin` in `luci.mk` redirects into `"$src.o"` **before** checking whether
  `jsmin` exists, so without it the package would ship empty `*.js.o` files.

Installing the theme does not switch the interface: `uci-defaults` only registers
the three variants in `luci.themes`, and the choice stays with
System → Language and Style → Design.
