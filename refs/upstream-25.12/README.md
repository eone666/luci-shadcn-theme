# Референс апстрима

`cascade.css` и `mobile.css` из `luci-theme-bootstrap`, коммит `e9ebca7`
(= версия пакета `luci-theme-bootstrap-26.133.20346~e9ebca7` в OpenWrt 25.12.4),
ветка `openwrt-25.12`, не минифицированные.

Нужны для `npm run audit`: сверка списка селекторов апстрима с нашим выводом
ловит правила, потерянные при переносе на `@apply`. В пакет не попадают.

Обновление:

```sh
curl -sO https://raw.githubusercontent.com/openwrt/luci/<commit>/themes/luci-theme-bootstrap/htdocs/luci-static/bootstrap/cascade.css
```
