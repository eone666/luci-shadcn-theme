#!/bin/sh
# Сборка устанавливаемого пакета темы в официальном SDK OpenWrt.
#
# SDK существует только под Linux, поэтому берём официальный docker-образ
# openwrt/sdk нужной версии и цели. В его feeds.conf фид luci закреплён на том
# же коммите, из которого перенесена тема, так что собирается ровно то, что
# проверялось на стенде.
#
#   ./scripts/package.sh                     # 25.12.4, armsr-armv8 (aarch64_generic)
#   OPENWRT_VERSION=25.12.5 ./scripts/package.sh
#   OPENWRT_SDK_TARGET=x86-64 ./scripts/package.sh
#
# Результат: .sdk-out/luci-theme-shadcn-*.apk
set -eu

VERSION="${OPENWRT_VERSION:-25.12.4}"
TARGET="${OPENWRT_SDK_TARGET:-armsr-armv8}"
IMAGE="openwrt/sdk:${TARGET}-${VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.sdk-out"

# Пакет собирается из готового CSS, поэтому сначала пересобираем его: в SDK
# нет node, и артефакт должен быть свежим.
echo "== пересборка CSS =="
( cd "$ROOT" && npm run build >/dev/null )

mkdir -p "$OUT"
rm -f "$OUT"/*.apk "$OUT"/*.ipk 2>/dev/null || true

cat > "$OUT/.build-inside.sh" <<'INNER'
set -eu
cp -r /pkg /builder/package/luci-theme-shadcn

# luci даёт luci.mk и luci-base; packages нужен ради lua, без него не собирается
# lucihttp (зависимость luci-base) — падает на отсутствующем lua.h.
echo "== обновляю фиды =="
./scripts/feeds update packages luci >/dev/null 2>&1
./scripts/feeds install luci-base >/dev/null 2>&1

echo "== defconfig =="
make defconfig >/dev/null 2>&1

echo "== сборка =="
make package/luci-theme-shadcn/compile -j"$(nproc)" \
    || make package/luci-theme-shadcn/compile V=s

find bin -name 'luci-theme-shadcn*' -exec cp {} /out/ \;
INNER

echo "== SDK: $IMAGE =="
docker run --rm \
	-v "$ROOT/luci-theme-shadcn:/pkg:ro" \
	-v "$OUT:/out" \
	"$IMAGE" sh /out/.build-inside.sh

rm -f "$OUT/.build-inside.sh"
echo
echo "== готово =="
ls -lh "$OUT"
