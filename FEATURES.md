# What this theme does

Dracula is the palette. Most of the work is elsewhere: ruTorrent's interface was
built around small screens and raster sprites, and this theme reworks how it is
drawn, how it is navigated and what it tells you. Everything below lives in the
`Dracula/` folder.

## Keyboard control

The whole interface is reachable without a mouse.

**Five regions — toolbar, sidebar, torrent list, detail tabs, status bar.** Tab
moves between them, arrows move inside one, Home and End jump to its ends. Each
region remembers where you were, so Tab returns you to the row you left rather
than to the top.

| Key                               | Does                             |
| --------------------------------- | -------------------------------- |
| `Tab`                             | Move between the five regions    |
| `← ↑ → ↓`                         | Move inside a region             |
| `Enter`                           | Open details, a tab, or a filter |
| `Space`                           | Toggle selection, or activate    |
| `Ctrl-Enter`, `Menu`, `Shift-F10` | Torrent menu, as a right click   |
| `Shift-↑ ↓`                       | Extend the selection in the list |
| `Escape`                          | Close the menu and step back     |
| `F1`                              | The full list, on screen         |

Five bare letters act on whatever is selected: **S** start, **P** pause,
**T** stop, **U** reannounce, **R** force recheck. They are plain letters
because the mnemonic combinations are taken — Ctrl-P is Settings, Ctrl-O is Add
Torrent, Ctrl-F is search, and Ctrl-S, Ctrl-R and Ctrl-T belong to the browser.
Typing into a field or a dropdown never triggers them, and a force recheck of
more than one torrent asks first.

Context menus work the same way as under the pointer: arrows walk the items,
Right opens a submenu, Left closes it. Their shortcuts are printed in the menu
itself, next to the commands.

The torrent table is wider than its pane, so Left and Right scroll it by whole
columns and snap to column edges instead of drifting by pixels.

## No image files

**The theme ships no images at all.** Every glyph is an inline SVG in the
stylesheet — 56 of them, defined once as custom properties and reused wherever
they appear, so one glyph is one definition rather than a copy per site. They
come from [Phosphor Icons](https://phosphoricons.com) (Duotone, MIT).

Upstream draws its interface from GIF and PNG sprites, fixed in size and blurred
on a HiDPI screen. Here everything is vector: the toolbar, the sidebar, torrent
status, file and directory rows, dialog headers, close buttons, the status bar,
the mobile navbar. Sharp at any zoom, and every glyph takes its colour from the
palette instead of carrying its own.

Both loading indicators are drawn too. The startup cover spins three dots in
CSS, and the toolbar's activity indicator is a web that stands still while the
UI is idle and turns while it waits on the server — the motion is the signal,
and hovering it says which of the two it is doing.

## A list that says what state a torrent is in

Upstream picks a torrent's icon by percentage, so a stopped download and a
stopped seed show either an alarm or praise, and nothing says "stopped". This
theme adds the state: a square inside a circle, drawn in Comment rather than
Orange, because a stopped torrent is not a problem.

The error flag is split by what it actually means. rTorrent's own errors stay
red. Announce noise — a tracker that did not answer, a release the tracker check
believes is gone — reads as a warning instead, because it is not the same class
of event as a torrent that cannot write to disk.

Status icons keep their contrast wherever the row goes. The quiet ones are
painted through a mask in the row's own colour, so a selected row does not
swallow them.

## One row height

Every list in the interface sits on the same grid: **30px per row**, and 26px
with ruTorrent's compact mode on. The torrent list, table headings, the sidebar
and its section headings, the detail tabs and the General tab's fields all land
on it, so the eye reads one rhythm down the page rather than four.

Table headings are exactly as tall as the rows beneath them and are told apart
by their paint alone.

## Typography

**The interface is set at 14px.** Upstream puts the whole page — body, inputs,
selects, buttons and textareas — at 11px Tahoma, which is small on a screen made
this decade. Every one of those gets the new size, so a field does not sit at
11px beside a 14px label.

Inter for the interface and JetBrains Mono for hashes and paths, both bundled as
`woff2` in 13 subsets with their OFL licences. Nothing is fetched from a CDN and
nothing depends on what the machine has installed.

## Details

- **Status bar sections explain themselves on hover** — disk space, CPU, open
  connections, torrent counts, listening port.
- **Dialogs are laid out for a landscape screen** rather than stacked into a
  column, and the ones that hold long lists were widened.
- **Seven breakpoints** carry the layout down to a phone, where the toolbar
  collapses into a navbar.
- **The theme checks itself on load.** Its stylesheets carry a version stamp
  that the script compares against its own, so a browser serving a cached
  stylesheet from an older release says so instead of rendering half-broken.

## What it needs

**ruTorrent 5.0.0 or newer**, which is every 5.x release there is. Each one from
5.0.0 to 5.1.12 was raised and measured against 5.3.12, along with 5.2.0, 5.2.10,
5.3.0, 5.3.1 and 5.3.12 above them.

Two releases changed enough to need the theme's own answer, and both are covered:
5.2.0 rebuilt the torrent table, and 5.1.0 moved the interface colours into
custom properties a theme can set.

Which rTorrent you run is ruTorrent's business rather than the theme's — the
theme never speaks to the daemon. It is worth knowing all the same, because it
narrows the choice: **ruTorrent below 5.3.2 does not understand rTorrent 0.16 at
all, and below 5.3.9 it does not understand 0.16.18 and newer.** On a current
daemon, ruTorrent 5.3.9+ is the only pairing that works, whatever theme is on
top.

## Under the hood

Plain CSS and one script — no build step, no preprocessor, no framework. Copy
the folder into ruTorrent and pick it in Settings.

Colours are never written as literals: the Dracula palette is declared once as
custom properties and everything else refers to them, which a lint rule
enforces. The repository carries a test suite over the shipped files — version
stamps agreeing across sheets, every custom property resolving, no rule
duplicated between stylesheets, every inline SVG well-formed.
