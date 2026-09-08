#!/bin/sh
# Build the installable theme package with the official OpenWrt SDK.
#
# The SDK only exists for Linux, so we use the official openwrt/sdk docker image
# for the wanted version and target. Its feeds.conf pins the luci feed to the
# very commit the theme was ported from, so what is built is exactly what was
# tested on the testbed.
#
#   ./scripts/package.sh                     # 25.12.4, armsr-armv8 (aarch64_generic)
#   OPENWRT_VERSION=25.12.5 ./scripts/package.sh
#   OPENWRT_SDK_TARGET=x86-64 ./scripts/package.sh
#
# Result: .sdk-out/luci-theme-shadcnui-*.apk
set -eu

VERSION="${OPENWRT_VERSION:-25.12.4}"
TARGET="${OPENWRT_SDK_TARGET:-armsr-armv8}"
IMAGE="openwrt/sdk:${TARGET}-${VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.sdk-out"

# Two files carry a version -- the Makefile's PKG_VERSION is what ships, and
# package.json's is what a contributor is likely to bump. Drifting apart is
# silent and confusing, so they have to agree.
PKG_VER=$(sed -n 's/^PKG_VERSION:=//p' "$ROOT/luci-theme-shadcnui/Makefile")
NPM_VER=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1)
if [ "$PKG_VER" != "$NPM_VER" ]; then
	echo "version mismatch: Makefile PKG_VERSION=$PKG_VER, package.json=$NPM_VER" >&2
	exit 1
fi

# The package ships prebuilt CSS (there is no node inside the SDK), so rebuild it
# first to make sure the artifact is current.
echo "== rebuilding CSS =="
( cd "$ROOT" && npm run build >/dev/null )

mkdir -p "$OUT"
rm -f "$OUT"/*.apk "$OUT"/*.ipk 2>/dev/null || true

# The build recipe, fed to the container over stdin so nothing is left on disk.
#
# Only the luci feed is updated, and nothing is installed from it: luci.mk is all
# we need. Do NOT `feeds install luci-base` -- that would put luci-base and its
# whole dependency chain (ucode, rpcd, lucihttp, ...) into the build tree, and
# buildroot would then compile all of it before our package. That chain also
# needs the base and packages feeds (two more git clones) and fails on
# liblucihttp-lua unless lua is installed as well.
#
# With luci-base absent from the tree, scripts/package-metadata.pl prints
#   WARNING: Makefile '...' has a dependency on 'luci-base', which does not exist
# and simply drops the build-order edge. The dependency itself still lands in the
# package metadata (apk mkpkg --info "depends:libc luci-base"), which is the only
# place it matters: the theme is pure data and compiles nothing.
echo "== SDK: $IMAGE =="
docker run --rm -i \
	--platform linux/amd64 \
	-v "$ROOT/luci-theme-shadcnui:/pkg:ro" \
	-v "$OUT:/out" \
	"$IMAGE" sh -s <<'INNER'
set -eu
cd /builder

echo "== updating the luci feed (luci.mk) =="
./scripts/feeds update luci >/dev/null 2>&1

# cp -a keeps the theme-variant symlinks (shadcnui-dark/shadcnui-light -> shadcnui) as
# symlinks; the package is expected to install them as such.
rm -rf package/luci-theme-shadcnui
cp -a /pkg package/luci-theme-shadcnui

# Select the package. `make package/<name>/compile` alone would build it, but the
# .apk is only emitted for packages enabled in .config.
echo "== defconfig =="
grep -q '^CONFIG_PACKAGE_luci-theme-shadcnui=' .config 2>/dev/null \
	|| echo CONFIG_PACKAGE_luci-theme-shadcnui=y >> .config
make defconfig >/dev/null 2>&1

echo "== building =="
make package/luci-theme-shadcnui/compile -j"$(nproc)" >/tmp/build.log 2>&1 || {
	echo "-- build failed, last 60 lines --"
	tail -60 /tmp/build.log
	exit 1
}

found=$(find bin -name 'luci-theme-shadcnui*.apk' -o -name 'luci-theme-shadcnui*.ipk')
[ -n "$found" ] || { echo "SDK produced no package"; tail -40 /tmp/build.log; exit 1; }
for f in $found; do cp "$f" /out/; done
INNER

echo
echo "== done =="
ls -lh "$OUT"
