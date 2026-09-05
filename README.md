# luci-theme-shadcn

A theme for **LuCI**, the OpenWrt web interface, in the style of
[shadcn/ui](https://ui.shadcn.com): cards, pill buttons, a segmented tab strip
and an `oklch` palette. Light and dark, and every LuCI page keeps working —
nothing about the markup or the workflow changes, only how it looks.

![The dashboard, dark variant](docs/img/dashboard.png)

## More screenshots

<p align="center">
  <img src="docs/img/system-light.png" alt="System settings, light variant" width="700">
  &nbsp;
  <img src="docs/img/system-mobile.png" alt="System settings on a phone" width="180">
</p>

<p align="center">
  <img src="docs/img/login.png" alt="The login screen" width="620">
</p>

## Install

Grab `luci-theme-shadcn-*.apk` from the
[Releases page](https://github.com/eone666/luci-shadcn-theme/releases), copy it
to the router and:

```sh
apk add --allow-untrusted /tmp/luci-theme-shadcn-1.0.0-r1.apk
```

The package is built for `apk`, the package manager of OpenWrt 25.12. On an
older, opkg-based release you would have to rebuild it with that release's SDK —
see [docs/internals.md](docs/internals.md#building-the-package).

Installing does not switch the interface over. Pick the theme in
**System → System → Language and Style → Design**, or from the shell:

```sh
uci set luci.main.mediaurlbase=/luci-static/shadcn-dark && uci commit luci
```

Three variants are registered, exactly like the stock bootstrap theme:

| In the Design list | |
|---|---|
| `Shadcn` | follows the browser's `prefers-color-scheme` |
| `ShadcnLight` | always light |
| `ShadcnDark` | always dark |

(No dashes: uci option names cannot carry them, which is why the stock theme
lists `BootstrapDark` too.)

To remove it, put your old theme back first, then `apk del luci-theme-shadcn` —
the package cleans its own entries out of uci.

## Your own colours

The entire palette is one file, `theme/globals.css`, and **any official shadcn
theme drops into it unchanged** — the `globals.css` written by `shadcn init`, one
of the base colours (neutral, zinc, slate, stone, gray), or a theme built at
[ui.shadcn.com/create](https://ui.shadcn.com/create):

```sh
cp ~/Downloads/globals.css theme/globals.css
npm install && npm run build
npm run package                # .apk in .sdk-out/ (needs docker)
```

Then install that `.apk` the same way as above.

`--radius` really is in charge, pills included: a palette that sets `--radius: 0`
comes out square everywhere, and one with a large radius comes out rounder. The
theme ships with shadcn **neutral**.

## What you need

- OpenWrt 25.12 with LuCI — built and tested against `luci-base`
  26.133.20346 on OpenWrt 25.12.4.
- A browser from 2023 or later: Chrome 111+, Safari 16.4+, Firefox 113+. The
  palette is `oklch()` and the translucent surfaces are `color-mix()`.
- Very little flash: a 24 KB `.apk`, ~112 KB installed (`cascade.css` is 73 KB of
  that, `mobile.css` 8 KB).

## Building from source

```sh
git clone https://github.com/eone666/luci-shadcn-theme.git
cd luci-shadcn-theme
npm install
npm run build                  # CSS -> luci-theme-shadcn/htdocs/
npm run package                # .apk in .sdk-out/ (OpenWrt SDK in docker)
npm run package:check          # install it into a clean OpenWrt and verify
```

There is also a full test bench — OpenWrt in a container with all of LuCI and
the theme mounted live, so edits show up on F5:

```sh
npm run bench                  # starts it and prints the URL (root / openwrt)
npm run dev                    # watch build
npm run bench:down             # when you are done
```

Settings — port, password, architecture, which variant to start with — come from
`.env`; `cp .env.example .env` if you want to change any of them.

[docs/internals.md](docs/internals.md) explains the build pipeline, the scripts
and the test bench; [docs/plan.md](docs/plan.md) is the design log — what was
decided and why.

## Contributing

`npm run check` before a pull request: it builds and then diffs the selector list
against upstream's `luci-theme-bootstrap`, and `MISSING` has to stay empty. The
theme does not own the markup — LuCI core generates the classes — so a rule
dropped while restyling is invisible until somebody opens that one page, and the
audit is what catches it. Comments and docs are in English.

## Credits and licence

Built on `luci-theme-bootstrap` from [LuCI](https://github.com/openwrt/luci):
the ucode templates, `menu.js` and `sysauth.js` are its files, and the selector
list is its contract with LuCI core — which is what keeps every page working.
The styles were rewritten after the [shadcn/ui](https://ui.shadcn.com) component
recipes.

Apache-2.0, like the theme it comes from. See [LICENSE](LICENSE).
