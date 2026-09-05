# syntax=docker/dockerfile:1

# The official OpenWrt rootfs images. Their manifest carries a non-standard
# platform string (linux/aarch64_generic instead of linux/arm64), so compose
# must pass platform: through — otherwise docker will not find the manifest.
ARG OPENWRT_ARCH=aarch64_generic
ARG OPENWRT_VERSION=25.12.4
FROM openwrt/rootfs:${OPENWRT_ARCH}-${OPENWRT_VERSION}

# Bench configuration. The important one is /etc/config/network: the image has
# none, so on first boot procd calls config_generate, which pushes eth0 into
# br-lan. After that the container loses its docker address and the published
# ports stop responding.
COPY rootfs/ /
COPY --chmod=0755 entrypoint.sh /entrypoint.sh

# LuCI is already part of the release rootfs (luci, mod-network/status/system,
# app-firewall, theme-bootstrap). Only what is needed to debug the theme is
# added here.
ARG EXTRA_PACKAGES="luci-mod-dashboard luci-theme-openwrt-2020"
RUN set -eux; \
    if [ -n "$EXTRA_PACKAGES" ]; then \
        apk update; \
        apk add --no-cache $EXTRA_PACKAGES; \
        rm -rf /var/cache/apk/*; \
    fi

EXPOSE 22 80 443
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/sbin/init"]
