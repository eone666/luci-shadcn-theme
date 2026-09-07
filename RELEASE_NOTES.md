A visual release: the markup, the workflow and the uci contract are untouched, so
it drops straight on top of 1.0.0. Every page keeps working — only the look moves
closer to shadcn/ui.

## What's new

### Selects finally look like the recipe

The theme styled a wrapper class that LuCI 25.12 never emits, so every plain
`<select>` on the firewall, system and zone pages kept the browser's own arrow —
full-contrast, glued to the edge, and different on every platform. Selects now
carry the shadcn chevron: 16px, muted, 12px in from the edge, and it follows
whatever palette sits in `theme/globals.css`. LuCI's own dropdown widget uses the
same chevron, so the two read alike.

The open list is offset 4px from its trigger, and the current value is marked
with a check on the right instead of a background tint one shade away from the
hover colour — previously the selected row and the row under the cursor were hard
to tell apart.

### Buttons, tabs and tables

- Buttons take the same radius as the input fields instead of being pills, and
  tabs follow the buttons, with the strip around them one step up the scale.
- An input with a button butted against it is a proper button group: one shared
  edge, matching heights, and a single divider between two buttons. Before, the
  button overlapped the input by ~3px, over the input's own rounded corner, at a
  different height.
- Tables follow shadcn's data table — an outlined, rounded block with a divider
  under every row. The old header fill and zebra striping are gone; a hover tint
  marks the row under the pointer, on every table rather than just the editable
  ones. Dashboard panels are already framed, so tables there keep the dividers
  without a second outline.

### Spacing and alignment

Several places where things sat flush against each other:

- The page heading had no margin at all, so its description touched it and the
  whole block sat 8px from the first card.
- Status-page headings (with their Hide toggle) sat directly on their table.
- Field hints sat 4px under their field, and the `?` icon was slightly high.
- In the package manager the gap between control groups was 7px and the labels
  had none at all.
- A field holding two controls — Local Time and its Sync buttons — had them
  touching.
- Notifications, the firmware-upgrade notice among them, were 8px from the
  content below.

Form labels also line up with their controls now. Checkbox rows sat 2.5px low
because of how a flex box reports its baseline; checkbox, radio, text input,
select and the dropdown widget are now within a quarter-pixel of each other.

### Other

- The favicon is redrawn monochrome — white marks on a near-black rounded plate,
  in the theme's own tones, inset so nothing touches the edge.
- `npm run dev` actually watches again. Tailwind was started in a mode that quits
  as soon as stdin is not a terminal, so under `nohup`, an IDE run configuration
  or CI the watcher exited on startup and nothing rebuilt, silently. It also
  crashed on a clean tree. Only affects development, not the shipped theme.

<!-- changelog:start -->
_No commits since v1.0.0._
<!-- changelog:end -->

## Installation

Requires **OpenWrt 25.12** (the `apk` era) with LuCI. The package is `noarch` — the
same file fits every target, x86_64 or aarch64 or mipsel alike. It weighs 21 KB.

### From the router's shell

```sh
cd /tmp
wget https://github.com/eone666/luci-shadcn-theme/releases/download/v1.0.1/luci-theme-shadcn-1.0.1-r1.apk
sha256sum luci-theme-shadcn-1.0.1-r1.apk
# 06a6567a3b46b8b7a7d676560f8d93921ac95c51f7818dad2f67464dfb17c799

apk add --allow-untrusted /tmp/luci-theme-shadcn-1.0.1-r1.apk
```

`--allow-untrusted` is needed because the file is not signed with an OpenWrt
repository key.

### Or copy it from your machine

```sh
scp luci-theme-shadcn-1.0.1-r1.apk root@192.168.1.1:/tmp/
ssh root@192.168.1.1 'apk add --allow-untrusted /tmp/luci-theme-shadcn-1.0.1-r1.apk'
```

### Or without a shell at all

**System → Software → Upload Package…**, choose the `.apk`, install.

## Switching to it

Installing only registers the theme; it does not change how LuCI looks. Go to
**System → System → Language and Style → Design** and pick one of:

| | |
|---|---|
| **Shadcn** | follows the browser's light/dark preference |
| **ShadcnLight** | always light |
| **ShadcnDark** | always dark |

…then **Save & Apply**. From the shell instead:

```sh
uci set luci.main.mediaurlbase=/luci-static/shadcn-dark   # or shadcn / shadcn-light
uci commit luci
```

If the page comes back unstyled, that is the browser cache — reload with
Ctrl+Shift+R (Cmd+Shift+R on a Mac).

## Removing it

Switch the design back first, otherwise LuCI is left pointing at files that no
longer exist:

```sh
uci set luci.main.mediaurlbase=/luci-static/bootstrap && uci commit luci
apk del luci-theme-shadcn
```

The package takes its own uci entries with it.

## Good to know

- The palette is `oklch()` and the translucent surfaces are `color-mix()`, so the
  browser has to be Chrome 111+, Safari 16.4+ or Firefox 113+.
- Your own colours: drop any official shadcn `globals.css` into
  `theme/globals.css` and rebuild — `--radius` included, a palette that sets it
  to `0` comes out square everywhere. See the README.
- On an older, opkg-based release this `.apk` will not install; build from source
  with that release's SDK.
