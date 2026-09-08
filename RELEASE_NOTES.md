The first release of **luci-theme-shadcnui** — a theme for LuCI, the OpenWrt web
interface, in the style of [shadcn/ui](https://ui.shadcn.com). Nothing about the
markup or the workflow changes, only how it looks: every LuCI page keeps working,
because the theme does not own the markup — LuCI core generates the classes, and
the build refuses to ship if a single upstream selector went missing.

> **Not a shadcn/ui project.** Officially unaffiliated with shadcn/ui and not
> endorsed by it; it ships none of its code. It is inspired by it — the styles
> were written after the publicly documented component recipes — and it is
> compatible with shadcn/ui themes, which is the one real point of contact.

## What's in it

### The look

Cards, a segmented tab strip, bordered data tables, buttons and inputs on one
radius, and native selects carrying the shadcn chevron rather than the browser's
own arrow. The palette is `oklch()` and the translucent surfaces are
`color-mix()`.

Three variants are registered, exactly like the stock bootstrap theme: one that
follows the browser's light/dark preference, and one for each mode pinned.

### Your own colours

The entire palette is one file, and **any official shadcn theme drops into it
unchanged** — the `globals.css` written by `shadcn init`, one of the base colours,
or a theme built at [ui.shadcn.com/create](https://ui.shadcn.com/create).
`--radius` is genuinely in charge: a palette that sets it to `0` comes out square
everywhere, pills included.

### On a phone

The header is one row — a burger, the OpenWrt mark, the device name, and the poll
and unsaved-changes controls as icon buttons, the second with the change count on
its corner. The menu opens as a full-screen sheet: group labels in small caps,
rows big enough for a thumb, the page behind it locked and the sheet scrolling on
its own.

Tables stack into cards, each cell labelled by its own column heading, so a
five-column list like the package manager stays readable at 390px instead of
squeezing "Size (.apk)" into 71 pixels.

### Wide tables scroll themselves

A table too wide for the screen scrolls inside its own box rather than dragging
the whole page sideways, and shades the edge it can still be pulled from — a mark
that appears only when there is somewhere to go, and never when the table fits.
Checked across nine pages at three widths: the document never scrolls
horizontally.

### The dashboard

Flat cards on the page's own colour with a hairline around them, sized to their
content instead of a fixed 466px, with the icons redrawn from the same lucide set
as the rest of the theme so they follow the palette instead of carrying their own
colours.

## Upgrading from luci-theme-shadcn

The package was called `luci-theme-shadcn` while it was finding its shape, and
served `/luci-static/shadcn`. If you have that installed, `apk` will not see this
as an upgrade — the package name is different — so remove the old one:

```sh
apk del luci-theme-shadcn
```

Your Design selection survives: installing this package rewrites
`luci.main.mediaurlbase` if it points at one of the old paths, and clears the
stale entries out of the Design list once the old files are gone. That is the one
uci value the install otherwise leaves alone.

<!-- changelog:start -->
_First release — the whole history is in the repository._
<!-- changelog:end -->

## Installation

Requires **OpenWrt 25.12** (the `apk` era) with LuCI. The package is `noarch` — the
same file fits every target, x86_64 or aarch64 or mipsel alike. It weighs 26 KB.

### From the router's shell

```sh
cd /tmp
wget https://github.com/eone666/luci-theme-shadcnui/releases/download/v1.0.0/luci-theme-shadcnui-1.0.0-r1.apk
sha256sum luci-theme-shadcnui-1.0.0-r1.apk
# 64309fd70afc9a4bbf33b68b3bddc6e14edd3270f59751dd04f8036b12296a36

apk add --allow-untrusted /tmp/luci-theme-shadcnui-1.0.0-r1.apk
```

`--allow-untrusted` is needed because the file is not signed with an OpenWrt
repository key.

### Or copy it from your machine

```sh
scp luci-theme-shadcnui-1.0.0-r1.apk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'apk add --allow-untrusted /tmp/luci-theme-shadcnui-1.0.0-r1.apk'
```

### Or without a shell at all

**System → Software → Upload Package…**, choose the `.apk`, install.

## Switching to it

Installing only registers the theme; it does not change how LuCI looks. Go to
**System → System → Language and Style → Design** and pick one of:

| | |
|---|---|
| **ShadcnUi** | follows the browser's light/dark preference |
| **ShadcnUiLight** | always light |
| **ShadcnUiDark** | always dark |

…then **Save & Apply**. From the shell instead:

```sh
uci set luci.main.mediaurlbase=/luci-static/shadcnui-dark   # or shadcnui / shadcnui-light
uci commit luci
```

If the page comes back unstyled, that is the browser cache — reload with
Ctrl+Shift+R (Cmd+Shift+R on a Mac).

## Removing it

Switch the design back first, otherwise LuCI is left pointing at files that no
longer exist:

```sh
uci set luci.main.mediaurlbase=/luci-static/bootstrap && uci commit luci
apk del luci-theme-shadcnui
```

The package takes its own uci entries with it.

## Good to know

- The palette is `oklch()`, the translucent surfaces are `color-mix()` and some
  of the layout keys off `:has()`, so the browser has to be Chrome 111+,
  Safari 16.4+ or Firefox 121+.
- Your own colours: drop any official shadcn `globals.css` into
  `theme/globals.css` and rebuild — `--radius` included, a palette that sets it
  to `0` comes out square everywhere. See the README.
- On an older, opkg-based release this `.apk` will not install; build from source
  with that release's SDK.
