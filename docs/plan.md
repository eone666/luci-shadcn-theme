# luci-theme-shadcnui — work plan

A theme for LuCI (OpenWrt 25.12) in the style of shadcn/ui, base color **neutral**.

The starting point is `luci-theme-bootstrap`: its `header.ut`/`footer.ut`/`sysauth.ut`
and the menu JS are kept as they are, because they are the de facto contract with LuCI
core (the core links no CSS of its own and generates ~190 classes plus dozens of
attribute states). Only the CSS is rewritten: instead of a hand-written `cascade.css`
there is a Tailwind v4.3 build driven by `@apply`, where the component styles come from
the shadcn registry and the entire palette arrives as a **single file**,
`theme/globals.css` — any official shadcn set (verified on neutral/zinc/slate/stone/gray).

Recolouring the theme = replacing `theme/globals.css` and running `npm run build`.
No trace of Tailwind is left in the built CSS: the postprocessing removes the banner,
unwraps `@layer`, flattens `@supports(color-mix)` and renames `--tw-*`.

## Settled decisions

| | |
|---|---|
| Theme variants | Three entries, as in bootstrap: **ShadcnUi** (auto, by `prefers-color-scheme`), **ShadcnUiLight**, **ShadcnUiDark** (uci option names take no dashes). `shadcnui-light`/`shadcnui-dark` are symlinks to the `shadcn` directory. There is no switcher in the UI. |
| Dark mechanics | `header.ut` emits `<html data-darkmode="true" class="dark">`: the `class` is the shadcn contract (`.dark {…}`, `@custom-variant dark`), the attribute is the contract of the inherited rules. In the auto variant an inline script toggles both. |
| Build | On the host: `@tailwindcss/cli@4.3.3`, `npm run dev` (watch) / `npm run build` (minify). |
| Font | A system stack, no webfonts (the router has no internet). |
| Scope | All of `cascade.css` + `mobile.css`, no corners cut. |
| Package | A `Makefile` in the style of the luci feed plus `uci-defaults`; the built CSS is committed. |

## Status

**The port is complete and the theme has been brought to the shadcn look.** All 537
upstream selectors are produced from `src/**` through `@apply`; no inherited CSS is
left. `npm run audit` is green: `cascade.css` 537/537, `mobile.css` 124/124, MISSING
empty.

Done and verified on the bench:

| | |
|---|---|
| Test bench | OpenWrt 25.12.4 + full LuCI, live editing through a bind mount, three theme variants |
| Package skeleton | templates, menu JS, login view, logos, symlinks, Makefile, uci-defaults |
| Pipeline | Tailwind 4.3.3, two entry points, `source(none)`, no preflight, `@reference` for mobile |
| Postprocessing | no Tailwind traces in the artifact: no banner, no `@layer`, no `--tw-*` (the build fails if anything is left); the write is atomic |
| Palette seam | `theme/globals.css` is swapped as a single file; verified on the official neutral, zinc, slate, stone, gray; v3-format themes are rejected with a message |
| Layers | reset, scaffolding, typography, forms, dynlist, select, checkboxes, semantics, buttons, tables, tabs, header, overlays, badges, network, uci diff, file browser, dropdown widget, odds and ends, responsive |
| Look | pill-shaped buttons, sections on cards, a header not set apart from the body, large radii — modelled on the shadcn/ui site |
| Tooling | `audit` (selector diff), `shots` (pages), `shots:states` (dropdown/Save & Apply/validation/modal), `inspect` (computed styles) |

Verified: the variant matrix (`shadcn` follows the OS, `shadcnui-light`/`shadcnui-dark` pin
the mode — 6 combinations), 13 pages behind the login return 200, the static files of
all three variants are in place, the interactive parts (an open `.cbi-dropdown`, the
Save & Apply dialog with the diff, `cbi-input-invalid`, the interface edit modal), and
mobile mode with the card mode for tables.

Decisions following the owner's feedback:

- the Status → Realtime Graphs charts are left **stock** (an experimental rework into
  shadcn's Area Chart was reverted on request);
- device icons are desaturated rather than turned into silhouettes: they are filled
  `<img>` illustrations, and a silhouette comes out as a solid blob;
- dashboard: the cards got their surface back (in the light theme they were invisible),
  and the device list table is stretched to full width;
- the login screen was brought in line with shadcn's login block (a centred card, labels
  above the fields, a `bg-muted` canvas lighter than the `bg-card` card);
- narrow windows are handled by viewport-width media queries in `cascade.css`:
  `mobile.css` is linked by `max-device-width` and does not react to window resizing;
- the mobile header is centred, the device name is no longer hidden on phones, the tab
  strip on a narrow screen is a rectangular card, and the dashboard tables are taken out
  of card mode.

Done since:

- **The `.apk` builds and installs.** `npm run package` runs the OpenWrt SDK in a
  container, `scripts/package-check.sh` then installs the result into a clean
  `openwrt/rootfs` and checks the files, the symlinks, the three uci entries, the
  version stamped into the template, that the CSS was not mangled, that the page
  renders dark and that `postrm` cleans up after itself. The recipe deliberately does
  not `feeds install luci-base` — that pulls the whole dependency chain and dies on
  `liblucihttp-lua`, while a data-only theme needs nothing but `luci.mk`.
  `LUCI_MINIFY_CSS:=0` and `LUCI_MINIFY_JS:=0`: both minifiers redirect into `$src.o`
  before checking that the host tool exists.
- **`cascade.css` is 73 KB** (upstream's is 53 KB; it was 83 KB). `scripts/postprocess.mjs`
  drops variables nothing reads, rules the next rule fully overrides — which is what
  Tailwind's `color-mix()` fallbacks become once the `@supports` wrapper is flattened —
  merges neighbouring rules that share a selector and clears out the declarations that
  merging makes dead. Verified by diffing the computed style of every element across
  8 pages × 2 variants × 2 widths before and against after: the only differences are the
  widths of elements whose text changes between runs (the clock, the uptime), and the
  same differences show up when the identical CSS is measured twice.

Left for later:

- Squeezing further would mean merging rules that share a declaration block but are not
  neighbours (~4 KB): safe only with a proper cascade analysis, since anything between
  them may target the same elements.
- ~~Input fields~~ — checked against the recipe rather than against the screenshot, and
  there is nothing to fix: shadcn's Input is `h-9 rounded-md border bg-transparent px-3
  py-1 shadow-xs dark:bg-input/30`, and ours is that exactly, only with `rounded-lg` for
  the rounder look we chose. What looked "filled and borderless" on the reference is the
  dark card surface behind a `bg-input/30` field. Filling the fields in the light theme
  as well would be a deviation from shadcn, so it is not done unless asked for.
- A glyph set of our own instead of the LuCI icons (substituting the `src` through a
  `mask`) — that would mean new assets in the package, so it was not done.

## Layout

```
theme/globals.css              ← the file from ui.shadcn.com/create, kept as is, never edited
scripts/tokens.mjs             ← normalises it into src/generated/tokens.css (strips the @imports)
src/
  cascade.css                  entry point #1 → htdocs/luci-static/shadcnui/cascade.css
  mobile.css                   entry point #2 → htdocs/luci-static/shadcnui/mobile.css
  theme-map.css                tokens shadcn lacks: success/warning/fonts
  compat/bootstrap-vars.css    bootstrap variables → shadcn tokens (PERMANENT, see below)
  base/*.css                   reset, scaffolding, typography
  components/*.css             groups of @apply rules (19 files)
  mobile/screens.css           responsive rules ≤854/600/375px
luci-theme-shadcnui/             the package itself (htdocs, ucode, root, Makefile)
```

Important: a `src/` directory **inside** the package directory is reserved by `luci.mk`
for C sources (`Build/Install/Default`), which is why the CSS sources live at the
repository root.

## Entry point

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@import "./generated/tokens.css";      /* palette from /create */
@import "./theme-map.css";
@import "./compat/bootstrap-vars.css";

@import "./base/reset.css";            /* from here on: layers in upstream's cascade order */
@import "./components/forms.css";
/* … */
```

- **`source(none)` is mandatory.** The theme has no markup of its own — the classes come
  from LuCI core and all we write is `@apply`. Without it Tailwind would scan
  `README`/`compose.yaml`/`.ut` and dump junk utilities into the output, which would
  additionally sit after our rules in the cascade.
- **Preflight is not included.** In v4 it sets `img,svg,video{display:block}` (breaking
  `.ifacebadge`/`.zonebadge`, where icons sit inline with the text),
  `h1..h6{font-size:inherit}` and `ul,ol{list-style:none}` — whereas the LuCI views are
  written against upstream's reset, which does nearly the same useful work. The reset is
  carried over from bootstrap.
- **Our own rules are written outside `@layer`** — as upstream does, where there are no
  layers at all: the cascade is decided by import order, and a layered rule always loses
  to an unlayered one. So the file order equals the rule order in upstream's
  `cascade.css`.
- `mobile.css` is linked separately as `<link media="only screen and (max-device-width: 854px)">`,
  so the file must exist; it gets the palette through `@reference "./cascade.css"` and
  does not emit it a second time.

## The token seam

`theme/globals.css` is what `/create` hands out: `@import "tailwindcss"`,
`@custom-variant dark`, `:root`, `.dark`, `@theme inline`, `@layer base`. Our own
`@import`s live in `src/cascade.css`, so `scripts/tokens.mjs` strips the imports out of
the downloaded file and carries everything else over byte for byte. The file does not
touch the tokens shadcn lacks (`--success`, `--warning`, `--destructive-foreground`,
fonts) — those live in `src/theme-map.css`.

What `tokens.mjs` does beyond stripping imports:

1. Duplicates the dark selector: `.dark {…}` → `.dark, :root[data-darkmode="true"] {…}`.
   The dark palette then applies under either signal.
2. Rewrites the variant in the **prefix** form:
   `@custom-variant dark (:is(.dark, [data-darkmode="true"]) &);`.
   The form matters: shadcn ships `&:is(.dark *)`, and Tailwind expands the variant as a
   nested rule — for a selector with a pseudo-element that yields the invalid
   `::before:is(.dark *)`, and the browser discards the rule entirely. This theme is full
   of pseudo-elements (checkboxes, spinner, arrows, the card mode for tables).
3. Strips imports by allowlist (`tailwindcss`, `tw-animate-css`) and fails on an unknown
   one — an import lost silently means styles lost silently.

## The variable compatibility layer is permanent

`src/compat/bootstrap-vars.css` cannot be removed at the end: the theme variables are
relied on not only by our inherited CSS but also by third-party core views. A confirmed
consumer is `resources/view/dashboard/css/custom.css` from `luci-mod-dashboard`:

```css
.Dashboard { color: var(--text-color-high, #212529) !important }
.Dashboard hr { border-top: 1px solid var(--border-color-medium, rgba(0,0,0,.1)) }
```

Without these variables the dashboard silently falls back to its light values on a dark
theme.

H/S/L triplets (`--border-color-low-hsl` and friends) are not in the layer and cannot be:
an oklch token cannot be decomposed into HSL components. All of their uses have already
been rewritten with `color-mix()`.

## LuCI → shadcn mapping

The recipes are taken verbatim from
`https://ui.shadcn.com/r/styles/new-york-v4/<name>.json`.

| LuCI group | Reference | Key classes |
|---|---|---|
| `.btn`, `.cbi-button` | Button `outline` + `size sm`, pill shape | `inline-flex items-center justify-center gap-2 h-8 px-4 rounded-full text-sm font-medium border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30` |
| `-positive/-add/-fieldadd/-save` | outline + success | `border-success/40 text-success hover:bg-success/10` |
| `.btn.primary`, `-action/-apply/-reload/-edit` | outline + primary | `border-primary/40 text-primary hover:bg-primary/10` |
| `-negative/-reset/-remove` | outline + destructive | `border-destructive/40 text-destructive hover:bg-destructive/10` |
| the `.important` variants | Button `default`/`destructive` | `bg-primary text-primary-foreground hover:bg-primary/90` / `bg-destructive text-white dark:bg-destructive/60` |
| `input`, `textarea`, `.cbi-input-*` | Input, Textarea | `rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground dark:bg-input/30` |
| focus (the aggregate rule) | the ring recipe | `border-ring! ring-[3px] ring-ring/50`; upstream's inset shadow goes away |
| `.cbi-input-invalid`, `.cbi-value-error` | `aria-invalid` | `border-destructive text-destructive ring-destructive/20` |
| `input[type=checkbox/radio]::before` | Checkbox | `size-4 rounded-[4px] border border-input`, `:checked` → `border-primary bg-primary`; upstream's SVG mask stays |
| `.table/.tr/.th/.td` (div tables) | Table | `w-full text-sm`, cells `px-2 py-2 align-middle`, hover `bg-muted/50`, zebra `.cbi-rowstyle-2` → `bg-muted/50` |
| `.cbi-map > .cbi-section`, `.ifacebox` | Card | `rounded-xl border bg-card p-5 text-card-foreground` — sections became cards, the markup did not change |
| `.alert-message.*` | Alert | a neutral `bg-card` + a colored accent; **`transition: opacity` is mandatory** |
| `#modal_overlay > .modal` | Dialog | a `bg-black/50` overlay, `rounded-lg border bg-background p-6 shadow-lg`; upstream's positioning mechanics are preserved |
| `.tabs`, `.cbi-tabmenu` | Tabs `default` | a pill-shaped segmented control sized to its content; on a narrow screen it becomes a rectangular card (otherwise wrapping gives a shapeless blob); padding and border live on the `a`, so the click area matches the hover area |
| `header`, `.nav`, `.dropdown-menu` | DropdownMenu | a header with no border and no fill of its own (`bg-background/80` + blur, since it is sticky); items span the full height, submenus stick to the edge (`top: 100%`) |
| `.label`, `[data-indicator]` | Badge | `rounded-full border px-2 py-0.5 text-xs font-medium bg-secondary` |
| `.cbi-dropdown` | Select + DropdownMenu | trigger/content/item; **all of the state logic is carried over verbatim** |
| `.cbi-tooltip` | Tooltip | `bg-foreground text-background text-xs rounded-md px-3 py-1.5` |
| `.cbi-progressbar` | Progress | `h-2 rounded-full bg-primary/20` + `bg-primary` |
| `.spinning` | Spinner | upstream's SVG mask, painted with `var(--color-foreground)` |
| `.uci-change-list`, `ins/del/var` | — | `ins` → `bg-success/15`, `del` → `bg-destructive/15`, `var` → `bg-muted font-mono` |

Deliberate departures from upstream: the gradient banners on alerts and buttons give way
to the shadcn manner of "a neutral surface plus a colored accent", the inset focus shadows
become a ring, and the header's hardcoded colors become the `--sidebar-*` token family.
LuCI's geometry (30px field height, `.cbi-value-title` at 180px, `font-size: 13px`) is
preserved — the radius is changed right away.

## Stages

All done; the order followed upstream's cascade (`@apply` does not change specificity, so
the "aggregate" focus and `.btn` rules had to stay exactly where they were).

1. ~~Upstream references~~ (`refs/upstream-25.12/`, commit `e9ebca7`)
2. ~~Package skeleton~~ — a clone of the theme under a new name
3. ~~Pipeline and palette~~ — Tailwind, tokens, compatibility layer
4. ~~Form core~~ — reset, scaffolding, typography, fields, focus
5. ~~Buttons~~ — variants, states, action row
6. ~~Tables~~ — div tables, cbi sections, sorting
7. ~~Chrome~~ — header on `--sidebar-*`, menu, tabs, breadcrumb, footer
8. ~~Overlays~~ — modals, alerts, tooltips, file browser
9. ~~Widgets~~ — dynlist, checkboxes, select, `.cbi-dropdown`
10. ~~Network and status~~ — ifacebox/ifacebadge/zonebadge, progress, uci diff, spinner
11. ~~Responsive~~ — `src/mobile/screens.css`
12. ~~Polish~~ — audit down to zero, README, `LUCI_MINIFY_CSS:=0`

## Verification

- `npm run build`, then `docker compose up -d --wait`; the theme is chosen with
  `LUCI_THEME` (`shadcn`, `shadcnui-light`, `shadcnui-dark`).
- Smoke test with curl: log in with `-d 'luci_username=root&luci_password=openwrt'`, then
  walk `admin/{dashboard,status/overview,network/network,network/firewall,system/system}`.
  Note: curl only sees the shell, the views render on the client.
- Visually (needs a browser): Status → Overview, Network → Interfaces (tables + ifacebox),
  Firewall → Zones (`.zonebadge` with an inline color), Network → Wireless (dropdown with
  search), System → Backup (file browser), System → Startup (a long table), Dashboard (the
  variable compatibility layer), plus the scenarios: Save & Apply (indicator, diff,
  spinner), a validation error (`.cbi-input-invalid` + `[data-errors]` on a tab), the login
  modal.
- The mode matrix: three themes × `prefers-color-scheme` dark/light. Check `data-darkmode`,
  the `dark` class, and the absence of FOUC.
- Mobile mode — only through device emulation in DevTools: the media conditions use
  `max-device-width`, and simply narrowing the window does not activate them.
- Audit: upstream's selector list against our output (`MISSING` must be empty), leftover
  hardcoded colors, absence of `hsl(var(--*-hsl))`.
- Testing the recolour seam: drop another `/create` file into `theme/globals.css`, run
  `npm run build` — the theme changes colors and stays functional.

## Gotchas (confirmed)

- **`csstidy` in the SDK.** `luci.mk` runs `CssTidy --template=highest` over all of
  `htdocs/` when `CONFIG_LUCI_CSSTIDY` is set (it is on by default). This 2008-era minifier
  knows nothing of `@layer`, `@property`, `oklch()` or `color-mix()` — the breakage only
  shows up in the built package, never on the bench. The cure is `LUCI_MINIFY_CSS:=0` in
  the Makefile (done).
- **Do not write `?v=` in the templates.** `SubstituteVersion` from `luci.mk` appends
  `?v=$(PKG_VERSION)` to `{{ media }}/*.css|js` itself while building the package. On the
  bench there is no version, so review CSS changes with the cache disabled or a hard
  reload.
- **uci option names cannot contain a hyphen** — hence `luci.themes.ShadcnUiDark`, not
  `shadcnui-dark`. `uci set` with a hyphen fails silently.
- **`--zone-color-rgb` arrives as an inline `style`** from `resources/firewall.js` and
  beats any class of ours. The background of `.zonebadge[style]`/`.ifacebox-head[style]` is
  not painted at all.
- **`display:none` in CSS for `#topmenu`/`#tabmenu`/`#modemenu` is forbidden** — the theme
  emits them with an inline `style="display:none"`, and the menu JS clears it with
  `style.display=''`.
- **The `transitionend` contract**: `.alert-message` and `.cbi-tooltip` must have a
  transition on `opacity` — the core removes notifications on that event, otherwise they
  never disappear.
- **The active tab is an attribute**, not a class: `[data-tab-active="true"]`. Without
  hiding `[data-tab]:not([data-tab-active="true"])`, every tab shows at once.
- **Indicators have no classes**:
  `#indicators > span[data-indicator][data-style="active"][data-clickable]` — style them
  with attribute selectors only.
- **`.cbi-dropdown` is a state machine**, not styling: the state lives in attributes and a
  dozen `display: … !important` declarations driven by `ui.js`. Port the logic byte for
  byte and change only color/radius/shadow/spacing. Rewrite it last.
- **Div tables**: `.table/.tr/.td` are `display:table*` on `div`s — `overflow`, `rounded`
  and `gap` do not work on them, so the border model stays upstream's (border-top on the
  cells).
- **`@keyframes` are written by hand** (`flash`, `fade-in`, `fade-out`): with
  `source(none)` Tailwind will not generate them, and we do not pull in `tw-animate-css`.
- **`oklch()`/`color-mix()`** require Chrome 111+/Safari 16.4+/Firefox 113+. Acceptable for
  a router admin UI, but worth stating in the README.
- **`logo.svg` and `logo_48.png`** are referenced directly from `header.ut` — files with
  those names must be present in the theme directory.
