#!/bin/sh
# Проверка собранного пакета на чистой системе.
#
# Ставит .apk из .sdk-out в свежий контейнер с голым OpenWrt (не в стенд!):
# в стенде тема примонтирована с хоста и симлинки вариантов создаёт entrypoint,
# поэтому там пакет проверить нельзя — не видно, что он реально кладёт.
#
#   ./scripts/package-check.sh
set -eu

VERSION="${OPENWRT_VERSION:-25.12.4}"
ARCH="${OPENWRT_ARCH:-aarch64_generic}"
IMAGE="openwrt/rootfs:${ARCH}-${VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="luci-theme-shadcn-pkgcheck"

APK=$(ls "$ROOT"/.sdk-out/luci-theme-shadcn*.apk 2>/dev/null | head -1 || true)
[ -n "$APK" ] || { echo "нет пакета в .sdk-out — сначала ./scripts/package.sh"; exit 1; }
echo "== проверяю $(basename "$APK") =="

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --platform "linux/${ARCH}" --privileged "$IMAGE" /sbin/init >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

# ждём procd
i=0
until docker exec "$NAME" test -S /var/run/ubus/ubus.sock 2>/dev/null; do
	i=$((i + 1)); [ "$i" -gt 60 ] && { echo "контейнер не поднялся"; exit 1; }
	sleep 1
done

docker cp "$APK" "$NAME:/tmp/theme.apk" >/dev/null
echo "== установка =="
docker exec "$NAME" apk add --allow-untrusted /tmp/theme.apk 2>&1 | tail -3

echo "== что положил пакет =="
docker exec "$NAME" sh -c '
	fail=0
	for f in /www/luci-static/shadcn/cascade.css /www/luci-static/shadcn/mobile.css \
	         /www/luci-static/shadcn/logo.svg /www/luci-static/shadcn/logo_48.png \
	         /www/luci-static/resources/menu-shadcn.js \
	         /www/luci-static/resources/view/shadcn/sysauth.js \
	         /usr/share/ucode/luci/template/themes/shadcn/header.ut \
	         /usr/share/ucode/luci/template/themes/shadcn/footer.ut \
	         /usr/share/ucode/luci/template/themes/shadcn/sysauth.ut; do
		[ -f "$f" ] || { echo "  НЕТ: $f"; fail=1; }
	done
	for l in /www/luci-static/shadcn-dark /www/luci-static/shadcn-light \
	         /usr/share/ucode/luci/template/themes/shadcn-dark \
	         /usr/share/ucode/luci/template/themes/shadcn-light; do
		[ -L "$l" ] || { echo "  НЕ СИМЛИНК: $l"; fail=1; }
	done
	[ "$fail" = 0 ] && echo "  все файлы и симлинки на месте"

	echo "== регистрация в uci (uci-defaults отрабатывают при установке) =="
	uci show luci.themes | grep -i shadcn | sed "s/^/  /" || echo "  НЕ ЗАРЕГИСТРИРОВАНА"

	echo "== версия в шаблоне (SubstituteVersion) =="
	grep -o "cascade.css?v=[^\"]*" /usr/share/ucode/luci/template/themes/shadcn/header.ut | sed "s/^/  /"

	echo "== csstidy не тронул CSS (LUCI_MINIFY_CSS:=0) =="
	head -c 60 /www/luci-static/shadcn/cascade.css | sed "s/^/  /"; echo
	grep -c "oklch" /www/luci-static/shadcn/cascade.css | sed "s/^/  oklch-цветов: /"

	echo "== тема отдаётся веб-сервером =="
	uci set luci.main.mediaurlbase=/luci-static/shadcn-dark && uci commit luci
	wget -q -O /tmp/page http://127.0.0.1/cgi-bin/luci/ 2>/dev/null || true
	grep -o "<html[^>]*>" /tmp/page | sed "s/^/  /"
	grep -o "luci-static/shadcn-dark/cascade.css" /tmp/page | head -1 | sed "s/^/  подключён: /"
	wget -q --spider http://127.0.0.1/luci-static/shadcn-dark/cascade.css && echo "  CSS отдаётся: 200"
'

echo
echo "== удаление пакета =="
docker exec "$NAME" sh -c 'apk del luci-theme-shadcn 2>&1 | tail -2
	echo "  темы в uci после удаления:"; uci show luci.themes | grep -ci shadcn | sed "s/^/    осталось записей: /"
	ls /www/luci-static/ | grep -c shadcn | sed "s/^/    файлов shadcn: /"'
