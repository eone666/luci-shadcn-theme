# syntax=docker/dockerfile:1

# Официальные rootfs-образы OpenWrt. В манифесте у них нестандартная строка
# платформы (linux/aarch64_generic вместо linux/arm64), поэтому compose
# обязан пробрасывать platform: — иначе docker не найдёт manifest.
ARG OPENWRT_ARCH=aarch64_generic
ARG OPENWRT_VERSION=25.12.4
FROM openwrt/rootfs:${OPENWRT_ARCH}-${OPENWRT_VERSION}

# Конфиги стенда. Главное здесь — /etc/config/network: в образе его нет, и
# на первом бутe procd зовёт config_generate, который засовывает eth0 в
# br-lan. После этого контейнер теряет адрес docker'а и опубликованные
# порты перестают отвечать.
COPY rootfs/ /
COPY --chmod=0755 entrypoint.sh /entrypoint.sh

# LuCI уже входит в release-rootfs (luci, mod-network/status/system,
# app-firewall, theme-bootstrap). Здесь докидываем только то, что нужно
# для отладки темы.
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
