#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

# Версию задаём явно: luci.mk выводит её из git-истории фида luci, а у
# отдельного репозитория её нет — иначе SubstituteVersion подставит в шаблоны
# пустое `?v=`.
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=shadcn/ui Theme for LuCI
LUCI_DEPENDS:=+luci-base

# csstidy (luci.mk: CssTidy, --template=highest) — минификатор 2008 года, он не
# понимает @layer/@property/oklch()/color-mix() и молча покалечит собранный CSS.
# CSS уже минифицирован Tailwind'ом на хосте, второй проход не нужен.
LUCI_MINIFY_CSS:=0

PKG_LICENSE:=Apache-2.0

define Package/luci-theme-shadcn/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Shadcn
	uci -q delete luci.themes.ShadcnDark
	uci -q delete luci.themes.ShadcnLight
	uci commit luci
}
endef

# У тем в самом фиде luci стоит `include ../../luci.mk` — относительный путь
# работает только внутри дерева фида. Для отдельного репозитория берём luci.mk
# через TOPDIR, тогда пакет собирается откуда угодно: из package/, из своего
# фида или скопированным в feeds/luci/themes/.
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
