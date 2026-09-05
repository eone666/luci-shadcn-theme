#!/bin/sh
# Verify the built package on a clean system.
#
# Installs the .apk from .sdk-out into a fresh bare-OpenWrt container (NOT the
# testbed!): on the testbed the theme is bind-mounted from the host and the
# variant symlinks are created by entrypoint.sh, so nothing there would show what
# the package itself actually installs.
#
#   ./scripts/package-check.sh
set -eu

VERSION="${OPENWRT_VERSION:-25.12.4}"
ARCH="${OPENWRT_ARCH:-aarch64_generic}"
IMAGE="openwrt/rootfs:${ARCH}-${VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="luci-theme-shadcn-pkgcheck"

APK=$(ls "$ROOT"/.sdk-out/luci-theme-shadcn*.apk 2>/dev/null | head -1 || true)
[ -n "$APK" ] || { echo "no package in .sdk-out -- run ./scripts/package.sh first"; exit 1; }
echo "== checking $(basename "$APK") =="

docker rm -f "$NAME" >/dev/null 2>&1 || true
# openwrt/rootfs images carry the OpenWrt target name as the manifest
# architecture (linux/aarch64_generic, not linux/arm64), hence --platform.
docker run -d --name "$NAME" --platform "linux/${ARCH}" --privileged "$IMAGE" /sbin/init >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

# Wait for procd and then for uhttpd: the ubus socket shows up a few seconds
# before port 80 is bound, and the HTTP checks below would race it.
i=0
until docker exec "$NAME" test -S /var/run/ubus/ubus.sock 2>/dev/null; do
	i=$((i + 1)); [ "$i" -gt 60 ] && { echo "container did not come up"; exit 1; }
	sleep 1
done
i=0
until docker exec "$NAME" wget -q --spider http://127.0.0.1/luci-static/resources/luci.js 2>/dev/null; do
	i=$((i + 1)); [ "$i" -gt 60 ] && { echo "uhttpd did not come up"; exit 1; }
	sleep 1
done

# Not /tmp: that is a tmpfs mounted at boot, and `docker cp` writes into the
# image layer underneath the mount, so the file would be invisible to apk --
# which then reports the path as "no such package".
docker cp "$APK" "$NAME:/root/theme.apk" >/dev/null

echo "== install =="
# --no-network: the container has no route out, and without it apk spends a
# minute timing out on downloads.openwrt.org before installing the local file.
docker exec "$NAME" apk add --allow-untrusted --no-network /root/theme.apk 2>&1 \
	| grep -v '^WARNING: opening from cache' | tail -3

docker exec -i "$NAME" sh -s <<'INNER' || { echo; echo "== FAILED =="; exit 1; }
fail=0

echo "== what the package installed =="
for f in /www/luci-static/shadcn/cascade.css /www/luci-static/shadcn/mobile.css \
         /www/luci-static/shadcn/logo.svg /www/luci-static/shadcn/logo_48.png \
         /www/luci-static/resources/menu-shadcn.js \
         /www/luci-static/resources/view/shadcn/sysauth.js \
         /usr/share/ucode/luci/template/themes/shadcn/header.ut \
         /usr/share/ucode/luci/template/themes/shadcn/footer.ut \
         /usr/share/ucode/luci/template/themes/shadcn/sysauth.ut; do
	[ -s "$f" ] || { echo "  MISSING OR EMPTY: $f"; fail=1; }
done
for l in /www/luci-static/shadcn-dark /www/luci-static/shadcn-light \
         /usr/share/ucode/luci/template/themes/shadcn-dark \
         /usr/share/ucode/luci/template/themes/shadcn-light; do
	[ -L "$l" ] || { echo "  NOT A SYMLINK: $l"; fail=1; }
done
# luci.mk's JsMin/CssTidy redirect into "$src.o" before checking whether the host
# minifier exists, so a missing one leaves empty *.o files behind and ships them.
# Both passes are off in the Makefile, so nothing like that may show up here.
junk=$(find /www/luci-static /usr/share/ucode/luci/template -name '*.o' 2>/dev/null)
[ -z "$junk" ] || { echo "  LEFTOVER MINIFIER FILES: $junk"; fail=1; }
[ "$fail" = 0 ] && echo "  all files and symlinks in place, no leftovers"

echo "== uci registration (uci-defaults run on install) =="
themes=$(uci show luci.themes 2>/dev/null | grep -i shadcn || true)
[ "$(echo "$themes" | grep -ci .)" = 3 ] || { echo "  EXPECTED 3 THEMES"; fail=1; }
echo "$themes" | sed 's/^/  /'

echo "== version stamped into the template (SubstituteVersion) =="
ver=$(grep -o 'cascade\.css?v=[0-9][^"]*' \
	/usr/share/ucode/luci/template/themes/shadcn/header.ut | head -1)
[ -n "$ver" ] || { echo "  NO VERSION IN header.ut"; fail=1; }
echo "  $ver"

echo "== csstidy left the CSS alone (LUCI_MINIFY_CSS:=0) =="
head -c 60 /www/luci-static/shadcn/cascade.css | sed 's/^/  /'; echo
n=$(grep -o oklch /www/luci-static/shadcn/cascade.css | wc -l)
echo "  oklch() occurrences: $n"
[ "$n" -gt 0 ] || { echo "  CSS WAS MANGLED"; fail=1; }

echo "== the web server serves the theme =="
prev=$(uci -q get luci.main.mediaurlbase || true)
uci set luci.main.mediaurlbase=/luci-static/shadcn-dark && uci commit luci
# LuCI answers an unauthenticated request with the login page under HTTP 403, and
# busybox wget throws the body away on an error status -- hence a raw request.
# stdin has to stay open while the CGI runs, or nc closes the socket too early.
{ printf 'GET /cgi-bin/luci/ HTTP/1.0\r\n\r\n'; sleep 3; } | nc 127.0.0.1 80 > /root/resp
head -1 /root/resp | sed 's/^/  /'
grep -q 'x-luci-login-required: yes' /root/resp || { echo "  NO LOGIN PAGE"; fail=1; }
html=$(grep -o '<html[^>]*>' /root/resp || true)
echo "  $html"
echo "$html" | grep -q 'class="dark"' || { echo "  THEME DID NOT RENDER DARK"; fail=1; }
link=$(grep -o 'luci-static/shadcn-dark/cascade\.css?v=[0-9.]*' /root/resp | head -1 || true)
[ -n "$link" ] || { echo "  THEME CSS NOT LINKED IN THE PAGE"; fail=1; }
echo "  linked: $link"
wget -q --spider http://127.0.0.1/luci-static/shadcn-dark/cascade.css \
	&& echo "  CSS served: 200" || { echo "  CSS NOT SERVED"; fail=1; }

echo "== removing the package =="
# Put the active theme back first: mediaurlbase is an admin choice, postrm has no
# business touching it, and leaving it dangling would only confuse the check.
uci set luci.main.mediaurlbase="${prev:-/luci-static/bootstrap}" && uci commit luci
apk del --no-network luci-theme-shadcn 2>&1 | grep -v '^WARNING: opening from cache' | tail -2
left=$(uci show luci.themes 2>/dev/null | grep -ci shadcn || true)
files=$(ls /www/luci-static/ 2>/dev/null | grep -c shadcn || true)
echo "  uci entries left: $left, files left: $files"
[ "$left" = 0 ] || { echo "  POSTRM DID NOT CLEAN UCI"; fail=1; }
[ "$files" = 0 ] || { echo "  FILES LEFT BEHIND"; fail=1; }

exit $fail
INNER

echo
echo "== OK =="
