#!/bin/sh
# Точка входа стенда: готовим окружение под procd и применяем настройки из
# переменных окружения, затем передаём управление init'у.

# --- сеть -------------------------------------------------------------------
# netifd при старте сбрасывает состояние всех сетевых устройств, включая
# eth0, через который работает docker (адрес и default route исчезают, а
# вместе с ними и опубликованные порты). Поэтому eth0 не прячем от netifd,
# а наоборот отдаём ему же с теми параметрами, что уже выдал docker: тогда
# конфигурация переживает и boot, и Save & Apply, и restart сети из LuCI.
adopt_uplink() {
	cidr=$(ip -4 -o addr show dev eth0 2>/dev/null | awk '{print $4; exit}')
	[ -n "$cidr" ] || return 0
	gw=$(ip -4 route show default 2>/dev/null | awk '/via/ {print $3; exit}')

	uci -q set network.docker=interface
	uci -q set network.docker.device='eth0'
	uci -q set network.docker.proto='static'
	uci -q set network.docker.ipaddr="$cidr"
	[ -n "$gw" ] && uci -q set network.docker.gateway="$gw"
	uci -q commit network

	# fw4 по умолчанию режет input, а устройство вне зон попадает под
	# defaults input REJECT — без своей зоны стенд отвечал бы только внутри.
	uci -q set firewall.docker=zone
	uci -q set firewall.docker.name='docker'
	uci -q set firewall.docker.input='ACCEPT'
	uci -q set firewall.docker.output='ACCEPT'
	uci -q set firewall.docker.forward='ACCEPT'
	uci -q delete firewall.docker.network
	uci -q add_list firewall.docker.network='docker'
	uci -q commit firewall

	# DHCP-сервер на сети docker'а не нужен
	uci -q set dhcp.docker=dhcp
	uci -q set dhcp.docker.interface='docker'
	uci -q set dhcp.docker.ignore='1'
	uci -q commit dhcp
}

# Порты для br-lan/br-wan: veth есть в любом ядре (docker сам на них живёт),
# а kmod-dummy из фидов не загрузится — ядро здесь хостовое. Мост без портов
# netifd не поднимает, поэтому без этой пары страницы Network пустые.
ensure_veth() {
	ip link show "$1" >/dev/null 2>&1 || ip link add "$1" type veth peer name "$1p"
	ip link set "$1" up
	ip link set "${1}p" up
}

adopt_uplink
ensure_veth lan0
ensure_veth wan0

# --- LuCI -------------------------------------------------------------------
if [ -n "$ROOT_PASSWORD" ]; then
	printf '%s\n%s\n' "$ROOT_PASSWORD" "$ROOT_PASSWORD" | passwd root >/dev/null 2>&1
fi

# Симлинки вариантов темы — то же, что делает пакет: shadcn-dark и shadcn-light
# это тот же каталог, режим выбирается именем (см. darkpref в header.ut).
# В контейнере их создаём здесь, потому что примонтирован только сам shadcn.
for variant in light dark; do
	[ -e "/www/luci-static/shadcn-$variant" ] || \
		ln -s shadcn "/www/luci-static/shadcn-$variant"
	[ -e "/usr/share/ucode/luci/template/themes/shadcn-$variant" ] || \
		ln -s shadcn "/usr/share/ucode/luci/template/themes/shadcn-$variant"
done

# themes.<Name> — пункты в System / Language and Style / Design
uci -q set luci.themes.Shadcn='/luci-static/shadcn'
uci -q set luci.themes.ShadcnLight='/luci-static/shadcn-light'
uci -q set luci.themes.ShadcnDark='/luci-static/shadcn-dark'

if [ -n "$LUCI_THEME" ]; then
	# mediaurlbase — активная тема
	uci -q get "luci.themes.$LUCI_THEME" >/dev/null 2>&1 || \
		uci -q set "luci.themes.$LUCI_THEME=/luci-static/$LUCI_THEME"
	uci -q set "luci.main.mediaurlbase=/luci-static/$LUCI_THEME"
fi

uci -q commit luci

exec "$@"
