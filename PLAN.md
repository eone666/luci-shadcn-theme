# luci-theme-shadcn — план работ

Тема для LuCI (OpenWrt 25.12) в виде shadcn/ui, base color **neutral**.

Основа — `luci-theme-bootstrap`: его `header.ut`/`footer.ut`/`sysauth.ut` и menu-JS
сохраняются как есть, потому что это фактический контракт с ядром LuCI (ядро само не
подключает ни одного CSS и генерирует ~190 классов плюс десятки атрибутных состояний).
Переписывается только CSS: вместо рукописного `cascade.css` — сборка Tailwind v4.3 через
`@apply`, где стили компонентов взяты из реестра shadcn, а вся палитра приходит **одним
файлом** `theme/globals.css` — любым официальным набором shadcn (проверено на
neutral/zinc/slate/stone/gray).

Перекрасить тему = заменить `theme/globals.css` и выполнить `npm run build`.
В собранном CSS следов Tailwind не остаётся: постобработка снимает баннер,
разворачивает `@layer`, сплющивает `@supports(color-mix)` и переименовывает `--tw-*`.

## Зафиксированные решения

| | |
|---|---|
| Варианты темы | Три пункта как у bootstrap: **Shadcn** (авто по `prefers-color-scheme`), **Shadcn-Light**, **Shadcn-Dark**. `shadcn-light`/`shadcn-dark` — симлинки на каталог `shadcn`. Переключателя в UI нет. |
| Механика dark | `header.ut` ставит `<html data-darkmode="true" class="dark">`: `class` — контракт shadcn (`.dark {…}`, `@custom-variant dark`), атрибут — контракт унаследованных правил. В авто-варианте инлайн-скрипт переключает и то, и другое. |
| Сборка | На хосте: `@tailwindcss/cli@4.3.3`, `npm run dev` (watch) / `npm run build` (minify). |
| Шрифт | Системный стек, без webfont'ов (роутер без интернета). |
| Объём | Весь `cascade.css` + `mobile.css`, без срезанных углов. |
| Пакет | `Makefile` в стиле фида luci + `uci-defaults`, собранный CSS коммитится. |

## Состояние

**Перенос завершён, тема доведена до вида shadcn.** Все 537 селекторов апстрима
собираются из `src/**` через `@apply`, унаследованного CSS не осталось.
`npm run audit` зелёный: `cascade.css` 537/537, `mobile.css` 124/124, MISSING пуст.

Сделано и проверено на стенде:

| | |
|---|---|
| Стенд | OpenWrt 25.12.4 + полный LuCI, живая правка через bind mount, три варианта темы |
| Скелет пакета | шаблоны, menu-JS, вьюха логина, логотипы, симлинки, Makefile, uci-defaults |
| Пайплайн | Tailwind 4.3.3, две точки входа, `source(none)`, без preflight, `@reference` для mobile |
| Постобработка | в артефакте нет следов Tailwind: ни баннера, ни `@layer`, ни `--tw-*` (сборка падает, если что-то осталось); запись атомарная |
| Шов палитры | `theme/globals.css` меняется одним файлом; проверено на официальных neutral, zinc, slate, stone, gray; темы формата v3 отклоняются с сообщением |
| Слои | reset, каркас, типографика, формы, dynlist, select, чекбоксы, семантика, кнопки, таблицы, табы, шапка, оверлеи, бейджи, сеть, uci-дифф, файлбраузер, dropdown-виджет, мелочи, адаптив |
| Внешний вид | кнопки-пилюли, секции на карточках, шапка без отделения от тела, крупные скругления — ориентир на сайт shadcn/ui |
| Инструменты | `audit` (сверка селекторов), `shots` (страницы), `shots:states` (дропдаун/Save & Apply/валидация/модалка), `inspect` (вычисленные стили) |

Проверено: матрица вариантов (`shadcn` следует ОС, `shadcn-light`/`shadcn-dark`
фиксируют режим — 6 сочетаний), 13 страниц под логином отдают 200, статика всех
трёх вариантов на месте, интерактив (раскрытый `.cbi-dropdown`, диалог
Save & Apply с диффом, `cbi-input-invalid`, модалка правки интерфейса),
мобильный режим с карточным режимом таблиц.

Решения по обратной связи владельца:

- графики Status → Realtime Graphs оставлены **стоковыми** (пробная переделка под
  Area Chart из shadcn откачена по просьбе);
- иконки устройств обесцвечены, а не превращены в силуэт: это заливные картинки
  `<img>`, силуэт из них выходит сплошным пятном;
- дашборд: карточкам возвращена подложка (в светлой теме их не было видно),
  таблица списка устройств растянута на всю ширину;
- экран авторизации приведён к блоку login из shadcn (карточка по центру,
  подписи над полями, полотно `bg-muted` светлее карточки `bg-card`);
- узкие окна обслуживаются медиазапросами по ширине вьюпорта в `cascade.css`:
  `mobile.css` подключён по `max-device-width` и на ресайз окна не реагирует;
- мобильная шапка центрирована, имя устройства на телефоне больше не прячется,
  полоса табов на узком экране — прямоугольная карточка, таблицы дашборда
  выведены из карточного режима.

Осталось на потом:

- Размер `cascade.css` — 80 КБ против 44 КБ у апстрима (`@apply` + `@supports`
  под `color-mix()`). Приемлемо, но можно поджать.
- Сборка `.apk` в OpenWrt SDK не проверялась (нужен сам SDK), `LUCI_MINIFY_CSS:=0`
  выставлен заранее.
- Поля ввода: на референсе они залиты и почти без рамки, у нас прозрачные с
  рамкой; плотность у нас плотнее шадсновской. Ждёт решения владельца.
- Свой набор глифов вместо иконок LuCI (подмена по `src` через `mask`) — это
  новые ассеты в пакете, поэтому не делалось.

## Раскладка

```
theme/globals.css              ← файл с ui.shadcn.com/create, лежит как есть, руками не правится
scripts/tokens.mjs             ← нормализует его в src/generated/tokens.css (вырезает @import-ы)
src/
  cascade.css                  точка входа №1 → htdocs/luci-static/shadcn/cascade.css
  mobile.css                   точка входа №2 → htdocs/luci-static/shadcn/mobile.css
  theme-map.css                токены, которых у shadcn нет: success/warning/шрифты
  compat/bootstrap-vars.css    переменные bootstrap → токены shadcn (ПОСТОЯННЫЙ, см. ниже)
  base/*.css                   reset, каркас, типографика
  components/*.css             группы правил на @apply (19 файлов)
  mobile/screens.css           адаптив ≤854/600/375px
luci-theme-shadcn/             сам пакет (htdocs, ucode, root, Makefile)
```

Важно: каталог `src/` **внутри** каталога пакета зарезервирован `luci.mk` под C-исходники
(`Build/Install/Default`), поэтому CSS-исходники живут в корне репозитория.

## Точка входа

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);

@import "./generated/tokens.css";      /* палитра из /create */
@import "./theme-map.css";
@import "./compat/bootstrap-vars.css";

@import "./base/reset.css";            /* дальше — слои в порядке каскада апстрима */
@import "./components/forms.css";
/* … */
```

- **`source(none)` обязателен.** Своей разметки у темы нет — классы генерирует ядро LuCI,
  мы пишем только `@apply`. Без этого Tailwind просканирует `README`/`compose.yaml`/`.ut`
  и насыпет в вывод мусорных утилит, которые вдобавок стоят в каскаде после наших правил.
- **Preflight не подключаем.** В v4 он ставит `img,svg,video{display:block}` (ломает
  `.ifacebadge`/`.zonebadge`, где иконки идут инлайн с текстом), `h1..h6{font-size:inherit}`
  и `ul,ol{list-style:none}` — а вьюхи LuCI написаны под reset апстрима, который делает
  почти то же полезное. Reset переносим из bootstrap.
- **Свои правила пишем вне `@layer`** — как в апстриме, где слоёв нет вовсе: каскад
  решается порядком импортов, а правило в слое заведомо проигрывает не-слоёному.
  Поэтому порядок файлов = порядок правил в апстримном `cascade.css`.
- `mobile.css` подключается отдельным `<link media="only screen and (max-device-width: 854px)">`,
  файл обязан существовать; палитру он получает через `@reference "./cascade.css"` и не
  печатает её повторно.

## Шов токенов

`theme/globals.css` — то, что отдаёт `/create`: `@import "tailwindcss"`, `@custom-variant dark`,
`:root`, `.dark`, `@theme inline`, `@layer base`. Свои `@import`-ы у нас в `src/cascade.css`,
поэтому `scripts/tokens.mjs` вырезает импорты из скачанного файла, а всё остальное переносит
байт-в-байт. Токенов, которых у shadcn нет (`--success`, `--warning`, `--destructive-foreground`,
шрифты), файл не касается — они в `src/theme-map.css`.

Что делает `tokens.mjs` помимо вырезания импортов:

1. Дублирует dark-селектор: `.dark {…}` → `.dark, :root[data-darkmode="true"] {…}`.
   Тогда тёмная палитра приезжает по любому из двух признаков.
2. Переписывает вариант в **префиксной** форме:
   `@custom-variant dark (:is(.dark, [data-darkmode="true"]) &);`.
   Форма важна: shadcn отдаёт `&:is(.dark *)`, а Tailwind разворачивает вариант
   вложенным правилом — для селектора с псевдоэлементом получается невалидный
   `::before:is(.dark *)`, и браузер выбрасывает правило целиком. Тема псевдоэлементами
   насыщена (чекбоксы, спиннер, стрелки, карточный режим таблиц).
3. Вырезает импорты по белому списку (`tailwindcss`, `tw-animate-css`) и падает на
   незнакомом — молча потерянный импорт это молча потерянные стили.

## Слой совместимости переменных — постоянный

`src/compat/bootstrap-vars.css` нельзя удалить в конце: на переменные темы опирается не только
наш унаследованный CSS, но и сторонние вьюхи ядра. Проверенный потребитель —
`resources/view/dashboard/css/custom.css` из `luci-mod-dashboard`:

```css
.Dashboard { color: var(--text-color-high, #212529) !important }
.Dashboard hr { border-top: 1px solid var(--border-color-medium, rgba(0,0,0,.1)) }
```

Без этих переменных дашборд молча уедет в светлые фолбэки на тёмной теме.

H/S/L-триплетов (`--border-color-low-hsl` и т.п.) в слое нет и быть не может: oklch-токен
не разложить в компоненты HSL. Все их использования уже переписаны на `color-mix()`.

## Соответствие LuCI → shadcn

Рецепты берутся вербатим из `https://ui.shadcn.com/r/styles/new-york-v4/<name>.json`.

| Группа LuCI | Образец | Ключевые классы |
|---|---|---|
| `.btn`, `.cbi-button` | Button `outline` + `size sm`, форма-пилюля | `inline-flex items-center justify-center gap-2 h-8 px-4 rounded-full text-sm font-medium border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30` |
| `-positive/-add/-fieldadd/-save` | outline + success | `border-success/40 text-success hover:bg-success/10` |
| `.btn.primary`, `-action/-apply/-reload/-edit` | outline + primary | `border-primary/40 text-primary hover:bg-primary/10` |
| `-negative/-reset/-remove` | outline + destructive | `border-destructive/40 text-destructive hover:bg-destructive/10` |
| `.important`-варианты | Button `default`/`destructive` | `bg-primary text-primary-foreground hover:bg-primary/90` / `bg-destructive text-white dark:bg-destructive/60` |
| `input`, `textarea`, `.cbi-input-*` | Input, Textarea | `rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground dark:bg-input/30` |
| фокус (сборное правило) | ring-рецепт | `border-ring! ring-[3px] ring-ring/50`, инсет-тень апстрима уходит |
| `.cbi-input-invalid`, `.cbi-value-error` | `aria-invalid` | `border-destructive text-destructive ring-destructive/20` |
| `input[type=checkbox/radio]::before` | Checkbox | `size-4 rounded-[4px] border border-input`, `:checked` → `border-primary bg-primary`, маска-SVG апстрима остаётся |
| `.table/.tr/.th/.td` (div-таблицы) | Table | `w-full text-sm`, ячейки `px-2 py-2 align-middle`, hover `bg-muted/50`, зебра `.cbi-rowstyle-2` → `bg-muted/50` |
| `.cbi-map > .cbi-section`, `.ifacebox` | Card | `rounded-xl border bg-card p-5 text-card-foreground` — секции стали карточками, разметка не менялась |
| `.alert-message.*` | Alert | нейтральный `bg-card` + цветной акцент; **обязателен `transition: opacity`** |
| `#modal_overlay > .modal` | Dialog | `bg-black/50` оверлей, `rounded-lg border bg-background p-6 shadow-lg`; механика позиционирования апстрима сохраняется |
| `.tabs`, `.cbi-tabmenu` | Tabs `default` | сегмент-контрол-пилюля по ширине содержимого; на узком экране становится прямоугольной карточкой (иначе перенос строк даёт бесформенное пятно); отступы и рамка на `a`, чтобы зона клика совпадала с зоной наведения |
| `header`, `.nav`, `.dropdown-menu` | DropdownMenu | шапка без рамки и своей заливки (`bg-background/80` + blur, т.к. sticky); пункты тянутся на всю высоту, подменю прилипает к кромке (`top: 100%`) |
| `.label`, `[data-indicator]` | Badge | `rounded-full border px-2 py-0.5 text-xs font-medium bg-secondary` |
| `.cbi-dropdown` | Select + DropdownMenu | trigger/content/item; **вся логика состояний переносится дословно** |
| `.cbi-tooltip` | Tooltip | `bg-foreground text-background text-xs rounded-md px-3 py-1.5` |
| `.cbi-progressbar` | Progress | `h-2 rounded-full bg-primary/20` + `bg-primary` |
| `.spinning` | Spinner | маска-SVG апстрима, краска `var(--color-foreground)` |
| `.uci-change-list`, `ins/del/var` | — | `ins` → `bg-success/15`, `del` → `bg-destructive/15`, `var` → `bg-muted font-mono` |

Сознательные расхождения с апстримом: градиентные плашки алертов/кнопок заменяются на
shadcn-манеру «нейтральная поверхность + цветной акцент», инсет-тени фокуса — на ring,
хардкод-цвета хедера — на семейство токенов `--sidebar-*`. Геометрию LuCI (высота полей 30px,
`.cbi-value-title` 180px, `font-size: 13px`) сохраняем — радиус меняем сразу.

## Этапы

Все выполнены; порядок был обусловлен каскадом апстрима (`@apply` не меняет
специфичность, поэтому «сборные» правила фокуса и `.btn` обязаны стоять там же,
где стояли).

1. ~~Референсы апстрима~~ (`refs/upstream-25.12/`, коммит `e9ebca7`)
2. ~~Скелет пакета~~ — тема-клон под новым именем
3. ~~Пайплайн и палитра~~ — Tailwind, токены, слой совместимости
4. ~~Ядро формы~~ — reset, каркас, типографика, поля, фокус
5. ~~Кнопки~~ — варианты, состояния, ряд действий
6. ~~Таблицы~~ — div-таблицы, cbi-секции, сортировка
7. ~~Хром~~ — шапка на `--sidebar-*`, меню, табы, breadcrumb, футер
8. ~~Оверлеи~~ — модалки, алерты, тултипы, файлбраузер
9. ~~Виджеты~~ — dynlist, чекбоксы, select, `.cbi-dropdown`
10. ~~Сеть и статус~~ — ifacebox/ifacebadge/zonebadge, прогресс, uci-дифф, спиннер
11. ~~Адаптив~~ — `src/mobile/screens.css`
12. ~~Полировка~~ — аудит в ноль, README, `LUCI_MINIFY_CSS:=0`

## Верификация

- `npm run build`, затем `docker compose up -d --wait`; тема выбирается `LUCI_THEME`
  (`shadcn`, `shadcn-light`, `shadcn-dark`).
- Смоук curl'ом: логин `-d 'luci_username=root&luci_password=openwrt'`, обход страниц
  `admin/{dashboard,status/overview,network/network,network/firewall,system/system}`.
  Важно: curl видит только каркас, вью рендерятся на клиенте.
- Визуально (нужен браузер): Status → Overview, Network → Interfaces (таблицы + ifacebox),
  Firewall → Zones (`.zonebadge` с инлайн-цветом), Network → Wireless (dropdown с поиском),
  System → Backup (файлбраузер), System → Startup (длинная таблица), Dashboard (слой
  совместимости переменных), плюс сценарии: Save & Apply (индикатор, дифф, спиннер),
  ошибка валидации (`.cbi-input-invalid` + `[data-errors]` на табе), логин в модалке.
- Матрица режимов: три темы × `prefers-color-scheme` dark/light. Проверять `data-darkmode`,
  класс `dark`, отсутствие FOUC.
- Мобильный режим — только через эмуляцию устройства в DevTools: медиа-условия используют
  `max-device-width`, простое сужение окна их не активирует.
- Аудит: список селекторов апстрима против нашего вывода (`MISSING` должен быть пуст),
  остаточные хардкод-цвета, отсутствие `hsl(var(--*-hsl))`.
- Проверка шва перекраски: положить другой файл с `/create` в `theme/globals.css`,
  `npm run build` — тема меняет цвета и остаётся работоспособной.

## Грабли (проверенные)

- **`csstidy` в SDK.** `luci.mk` прогоняет `CssTidy --template=highest` по всему `htdocs/`
  при `CONFIG_LUCI_CSSTIDY` (по умолчанию включён). Минификатор 2008 года не знает
  `@layer`, `@property`, `oklch()`, `color-mix()` — поломка проявится только в собранном
  пакете, не на стенде. Лечится `LUCI_MINIFY_CSS:=0` в Makefile (сделано).
- **`?v=` в шаблонах не пишем.** `SubstituteVersion` из `luci.mk` сам дописывает
  `?v=$(PKG_VERSION)` к `{{ media }}/*.css|js` при сборке пакета. На стенде версии нет,
  поэтому правки CSS смотреть с отключённым кэшем или hard-reload.
- **Имена опций uci не допускают дефис** — поэтому `luci.themes.ShadcnDark`, а не
  `shadcn-dark`. `uci set` с дефисом молча падает.
- **`--zone-color-rgb` приходит инлайновым `style`** из `resources/firewall.js` и бьёт любой
  наш класс. Фон `.zonebadge[style]`/`.ifacebox-head[style]` не красим вообще.
- **`display:none` в CSS для `#topmenu`/`#tabmenu`/`#modemenu` запрещён** — тема отдаёт их с
  инлайновым `style="display:none"`, а menu-JS снимает его через `style.display=''`.
- **`transitionend`-контракт**: `.alert-message` и `.cbi-tooltip` обязаны иметь transition на
  `opacity` — ядро удаляет нотификации по этому событию, иначе они не исчезнут.
- **Активный таб — атрибут**, не класс: `[data-tab-active="true"]`. Если не скрыть
  `[data-tab]:not([data-tab-active="true"])`, все табы покажутся сразу.
- **Индикаторы без классов**: `#indicators > span[data-indicator][data-style="active"][data-clickable]` —
  красить только атрибутными селекторами.
- **`.cbi-dropdown` — конечный автомат**, а не стиль: состояния в атрибутах и десяток
  `display: … !important`, которыми управляет `ui.js`. Логику переносить побайтово, менять
  только цвет/радиус/тень/отступы. Переписывать последним.
- **Div-таблицы**: `.table/.tr/.td` это `display:table*` на `div` — `overflow`, `rounded` и
  `gap` на них не работают, бордер-модель оставляем апстримную (border-top на ячейках).
- **`@keyframes` переносим руками** (`flash`, `fade-in`, `fade-out`): с `source(none)`
  Tailwind их не сгенерирует, а `tw-animate-css` мы не подключаем.
- **`oklch()`/`color-mix()`** требуют Chrome 111+/Safari 16.4+/Firefox 113+. Для админки
  роутера приемлемо, но стоит указать в README.
- **`logo.svg` и `logo_48.png`** жёстко ссылаются из `header.ut` — файлы с этими именами
  обязаны лежать в каталоге темы.
