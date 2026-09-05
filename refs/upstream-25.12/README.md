# Upstream reference

`cascade.css` and `mobile.css` from `luci-theme-bootstrap`, commit `e9ebca7`
(= package version `luci-theme-bootstrap-26.133.20346~e9ebca7` in OpenWrt
25.12.4), branch `openwrt-25.12`, unminified.

They are needed by `npm run audit`: comparing upstream's selector list with our
output catches rules lost while porting to `@apply`. They are not shipped in
the package.

Updating:

```sh
curl -sO https://raw.githubusercontent.com/openwrt/luci/<commit>/themes/luci-theme-bootstrap/htdocs/luci-static/bootstrap/cascade.css
```
