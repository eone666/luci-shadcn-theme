#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

# Version is pinned explicitly: luci.mk derives it from the git history of the
# luci feed, which a standalone repository does not have -- otherwise
# SubstituteVersion would stamp an empty `?v=` into the templates.
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

LUCI_TITLE:=shadcn/ui Theme for LuCI
LUCI_DEPENDS:=+luci-base

# csstidy (luci.mk: CssTidy, --template=highest) is a 2008-era minifier: it does
# not understand @layer/@property/oklch()/color-mix() and silently mangles the
# stylesheet. The CSS is already minified by Tailwind on the host, so a second
# pass buys nothing.
LUCI_MINIFY_CSS:=0

# jsmin comes from luci-base/host, which is not built here (see scripts/package.sh:
# the recipe deliberately keeps luci-base out of the build tree). luci.mk's JsMin
# redirects into "$src.o" before checking whether jsmin exists, so a missing jsmin
# leaves empty *.js.o files behind and ships them inside the package. The JS is
# hand-written and small, so turn the pass off instead.
LUCI_MINIFY_JS:=0

PKG_LICENSE:=Apache-2.0

define Package/luci-theme-shadcnui/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.ShadcnUi
	uci -q delete luci.themes.ShadcnUiDark
	uci -q delete luci.themes.ShadcnUiLight
	uci commit luci
}
endef

# Themes inside the luci feed use `include ../../luci.mk` -- a relative path that
# only resolves within the feed tree. A standalone repository pulls luci.mk in
# through TOPDIR instead, so the package builds from anywhere: from package/, from
# its own feed, or copied into feeds/luci/themes/.
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
