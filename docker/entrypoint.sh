#!/bin/sh
# Bench entry point: prepare the environment for procd, apply the settings from
# the environment variables, then hand control over to init.

# --- network ----------------------------------------------------------------
# On start netifd resets the state of every network device, eth0 included —
# the very one docker works through (its address and default route disappear,
# and the published ports along with them). So instead of hiding eth0 from
# netifd we hand it over to netifd with the parameters docker already assigned:
# that way the configuration survives boot, Save & Apply and a network restart
# from LuCI.
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

	# fw4 blocks input by default, and a device outside every zone falls under
	# defaults input REJECT — without its own zone the bench would only answer
	# from inside.
	uci -q set firewall.docker=zone
	uci -q set firewall.docker.name='docker'
	uci -q set firewall.docker.input='ACCEPT'
	uci -q set firewall.docker.output='ACCEPT'
	uci -q set firewall.docker.forward='ACCEPT'
	uci -q delete firewall.docker.network
	uci -q add_list firewall.docker.network='docker'
	uci -q commit firewall

	# no DHCP server is needed on the docker network
	uci -q set dhcp.docker=dhcp
	uci -q set dhcp.docker.interface='docker'
	uci -q set dhcp.docker.ignore='1'
	uci -q commit dhcp
}

# Ports for br-lan/br-wan: veth exists in every kernel (docker itself runs on
# it), whereas kmod-dummy from the feeds would not load — the kernel here is
# the host's. netifd does not bring up a bridge with no ports, so without this
# pair the Network pages are empty.
ensure_veth() {
	ip link show "$1" >/dev/null 2>&1 || ip link add "$1" type veth peer name "$1p"
	ip link set "$1" up
	ip link set "${1}p" up
}

adopt_uplink
ensure_veth lan0
ensure_veth wan0

# --- LuCI -------------------------------------------------------------------
# Board model. On real hardware this file is written at boot from the device
# tree; in a container nothing writes it, and the dashboard then shows
# "Model: undefined", which looks like a theme bug rather than a missing file.
mkdir -p /tmp/sysinfo
[ -s /tmp/sysinfo/model ] || echo "${BOARD_MODEL:-OpenWrt Test Bench}" > /tmp/sysinfo/model

if [ -n "$ROOT_PASSWORD" ]; then
	printf '%s\n%s\n' "$ROOT_PASSWORD" "$ROOT_PASSWORD" | passwd root >/dev/null 2>&1
fi

# Theme variant symlinks — the same thing the package does: shadcn-dark and
# shadcn-light are the same directory, the mode is picked by the name (see
# darkpref in header.ut). In the container they are created here, because only
# shadcn itself is mounted.
for variant in light dark; do
	[ -e "/www/luci-static/shadcn-$variant" ] || \
		ln -s shadcn "/www/luci-static/shadcn-$variant"
	[ -e "/usr/share/ucode/luci/template/themes/shadcn-$variant" ] || \
		ln -s shadcn "/usr/share/ucode/luci/template/themes/shadcn-$variant"
done

# themes.<Name> — the entries under System / Language and Style / Design
uci -q set luci.themes.Shadcn='/luci-static/shadcn'
uci -q set luci.themes.ShadcnLight='/luci-static/shadcn-light'
uci -q set luci.themes.ShadcnDark='/luci-static/shadcn-dark'

if [ -n "$LUCI_THEME" ]; then
	# mediaurlbase — the active theme
	uci -q get "luci.themes.$LUCI_THEME" >/dev/null 2>&1 || \
		uci -q set "luci.themes.$LUCI_THEME=/luci-static/$LUCI_THEME"
	uci -q set "luci.main.mediaurlbase=/luci-static/$LUCI_THEME"
fi

uci -q commit luci

exec "$@"
