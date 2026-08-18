/*
 * Dracula Theme for ruTorrent — behaviour
 * Version 0.1.0 · built against ruTorrent 5.3
 * https://draculatheme.com
 *
 * Checks at startup that the stylesheets beside it carry the same version — see
 * draculaCheckVersions. This file cannot be served stale: ruTorrent inlines it
 * into a PHP response (`plugins/theme/init.php:22`) while the sheets sit behind
 * a cached URL.
 *
 * Carries every behavioural change the theme makes: keyboard handling, the
 * status classification, dialog geometry, the context menu, the status bar, the
 * favicon and the graph colours.
 *
 * ruTorrent appends this file to its own script bundle, so everything below
 * runs against globals the WebUI has already defined. The block below declares
 * them so a linter reading the file on its own does not report every use as an
 * undefined variable, and so a reader can see what the theme depends on.
 */

/* global plugin, thePlugins, theWebUI, theUILang, theContextMenu, theDialogManager */
/* global dStatus, askYesNo, RGBackground, dxSTable, rGraph, ALIGN_LEFT */
/* global document, setTimeout, clearTimeout, MutationObserver, MouseEvent, Intl, $, window, getComputedStyle, Image, console */

// Bump together with the stamps on :root in each sheet: this file compares
// itself against them at startup.
var DRACULA_VERSION = "0.1.0";
// ruTorrent minors this build was run against, not a guess at what it might
// tolerate. The theme reaches into upstream's markup and wraps its functions by
// name, so a new minor is a real risk.
var DRACULA_RUTORRENT = ["5.3"];

// getPropertyValue hands back the token stream, quotes included.
function draculaStampedVersion(name)
{
	return getComputedStyle(document.documentElement)
		.getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
}

// The three sheets are served under a URL ruTorrent versions by *its own*
// release (`js/plugins.js:3` — `?v=` plus theWebUI.version with the dots
// stripped), so updating the theme changes no character of the URL and a
// browser is free to keep serving yesterday's CSS. This file cannot go stale
// the same way, being inlined into a PHP response rather than fetched, and that
// asymmetry is what makes the check possible: the fresh half sees the cached
// half and says so.
//
// The symptom otherwise is not obvious — new class names arrive from a new
// init.js, the old sheet has no rules for them, and icons simply vanish.
function draculaCheckVersions()
{
	var sheets = {
		"style.css":   draculaStampedVersion("--dracula-version"),
		"stable.css":  draculaStampedVersion("--dracula-version-stable"),
		"plugins.css": draculaStampedVersion("--dracula-version-plugins")
	};

	var stale = [];
	for(var name in sheets)
		if(sheets[name] !== DRACULA_VERSION)
			stale.push(name + " " + (sheets[name] || "(missing or not loaded)"));

	if(stale.length)
	{
		var msg = "Dracula theme " + DRACULA_VERSION + ": stylesheet mismatch — " +
			stale.join(", ") + ". Reload with Ctrl+Shift+R; if that does not " +
			"fix it, the theme files are from different releases.";
		// noty falls back to the Log tab when $.noty is absent (`common.js:947`),
		// so the message lands somewhere either way.
		if(typeof window.noty === "function")
			window.noty(msg, "error");
		if(window.console && console.warn)
			console.warn(msg);
	}

	var rt = (window.theWebUI && theWebUI.version) || "";
	var line = rt.split(".").slice(0, 2).join(".");
	if(line && DRACULA_RUTORRENT.indexOf(line) === -1 && window.console && console.warn)
		console.warn("Dracula theme " + DRACULA_VERSION + " was built against " +
			"ruTorrent " + DRACULA_RUTORRENT.join(", ") + "; this is " + rt +
			". Some styling may be wrong.");
}

/* === Graphs stay sharp when the page is zoomed === */

/* Two different zooms, needing different handling.

   Ctrl+= is full page zoom: the browser changes devicePixelRatio, re-lays the
   page out in CSS pixels and re-evaluates media queries. A pinch on a touchpad
   or touchscreen is visual-viewport zoom and does none of that — it magnifies
   the composited output like a lens. At a pinch of 3, devicePixelRatio stays 1,
   visualViewport.scale goes to 3 and the CSS box is unchanged.

   The compositor re-rasterises text and SVG at the new scale, which is why
   everything else stays sharp. A canvas is a bitmap and cannot. So the
   effective density a canvas has to match is devicePixelRatio times the visual
   scale, not devicePixelRatio alone. */
function draculaVisualScale()
{
	var viewport = window.visualViewport;
	return (viewport && viewport.scale) || 1;
}

/* How far a given canvas may be scaled up before the allocation stops being
   reasonable. Budgeted by area, not by a flat ceiling: a flat ceiling throttles
   a 100x20 status-bar meter as hard as a full-tab graph, though the meter at
   ten times over is still only 200,000 pixels. Chrome reaches devicePixelRatio
   5 at maximum zoom and a pinch multiplies on top of that, so a ceiling of 4
   leaves the meter five times too small with both at maximum.

   The side limit keeps every dimension inside what engines will allocate at
   all; past that a canvas fails and draws nothing, which is worse than soft. */
function draculaRatioLimit(width, height)
{
	var maxPixels = 8000000;
	var maxSide = 8192;

	var w = Math.max(1, width);
	var h = Math.max(1, height);

	var byArea = Math.sqrt(maxPixels / (w * h));
	var bySide = Math.min(maxSide / w, maxSide / h);

	return Math.max(1, Math.min(byArea, bySide));
}

/* Without this, every flot graph in the product — the CPU meter, Speed, Trafic
   — turns soft the moment the page is zoomed and stays soft. Two lines of flot
   0.8.3 explain it.

   Its Canvas constructor reads the ratio exactly once:

       i = window.devicePixelRatio || 1;
       this.pixelRatio = i / backingStoreRatio;

   and resize() early-outs when the CSS size has not changed:

       if (this.width  != t) { i.width  = t * n; i.style.width  = t + "px"; ... }
       if (this.height != e) { i.height = e * n; i.style.height = e + "px"; ... }

   Zooming changes devicePixelRatio but not the size in CSS pixels, so the
   guards never fire, the backing store keeps the ratio it was born with, and
   the browser scales the bitmap up to fill the box. Redrawing cannot clear
   that: every later draw goes into the same undersized buffer, and
   plot.resize() compares the same unchanged dimensions.

   flot never exports Canvas, but hands the class to plugin init() as
   `classes.Canvas`, which is the one way to reach it. Refreshing pixelRatio
   there and clearing the cached dimensions makes the original resize() rebuild
   the buffer at the new ratio. Registered at module scope on purpose: the theme
   declares runlevel 5 and loads ahead of the plugins that draw graphs, so
   init() is still called for their plots; inside allDone it would be too late
   for the CPU graph.

   The patch alone is not enough: a density change fires **no** window resize
   event, so nothing calls resize(). Both watchers below exist for that, one per
   kind of zoom. */
if(typeof $ !== "undefined" && $.plot && $.plot.plugins)
{
	$.plot.plugins.push({
		name: "draculaSharpCanvas",
		version: "1.0",
		init: function(plot, classes)
		{
			var canvasClass = classes && classes.Canvas;
			if(!canvasClass || canvasClass.prototype.draculaSharpCanvas)
				return;

			canvasClass.prototype.draculaSharpCanvas = true;
			var originalResize = canvasClass.prototype.resize;

			canvasClass.prototype.resize = function(width, height)
			{
				var context = this.context;
				var backing = context.webkitBackingStorePixelRatio ||
					context.mozBackingStorePixelRatio ||
					context.msBackingStorePixelRatio ||
					context.oBackingStorePixelRatio ||
					context.backingStorePixelRatio || 1;
				var ratio = ((window.devicePixelRatio || 1) *
					draculaVisualScale()) / backing;
				var limit = draculaRatioLimit(width, height);

				if(ratio > limit)
					ratio = limit;

				if(Math.abs(ratio - this.pixelRatio) > 0.001)
				{
					this.pixelRatio = ratio;
					// the original only resizes when these differ from the
					// arguments, and at a pure zoom they would not
					this.width = 0;
					this.height = 0;
				}

				originalResize.call(this, width, height);
			};
		}
	});
}

/* Redraw every flot graph on the page at the current ratio. flot stores the
   plot object on its placeholder, so the graphs can be found without knowing
   which plugin owns them. resize() sizes the canvases; setupGrid and draw are
   what flot requires after one, or the new buffer stays empty. */
function draculaResizeAllPlots()
{
	$("canvas.flot-base").each(function()
	{
		var plot = $(this).parent().data("plot");
		if(!plot)
			return;

		plot.resize();
		plot.setupGrid();
		plot.draw();
	});
}

/* Zoom, and a window dragged to a monitor of a different density, both change
   devicePixelRatio without firing a single window resize event. A media query
   on the current ratio is the only event for it, and it has to be re-armed each
   time because the query stops matching the moment the ratio moves.

   draculaRatioQuery is module scope deliberately. Held only in a local, the
   MediaQueryList becomes collectable when the function returns, and a collected
   one silently stops delivering events — the first zoom is caught and no
   later one is. */
var draculaRatioQuery = null;

function draculaOnPixelRatioChange()
{
	draculaResizeAllPlots();
	draculaWatchPixelRatio();
}

function draculaWatchPixelRatio()
{
	if(!window.matchMedia)
		return;

	if(draculaRatioQuery)
	{
		if(draculaRatioQuery.removeEventListener)
			draculaRatioQuery.removeEventListener("change", draculaOnPixelRatioChange);
		else if(draculaRatioQuery.removeListener)
			draculaRatioQuery.removeListener(draculaOnPixelRatioChange);
	}

	draculaRatioQuery = window.matchMedia(
		"(resolution: " + (window.devicePixelRatio || 1) + "dppx)");

	if(draculaRatioQuery.addEventListener)
		draculaRatioQuery.addEventListener("change", draculaOnPixelRatioChange);
	else if(draculaRatioQuery.addListener)
		draculaRatioQuery.addListener(draculaOnPixelRatioChange);
}

/* A pinch never touches devicePixelRatio, so the media query above never fires
   for it. visualViewport does emit resize while the scale changes, which is the
   hook.

   Debounced because a pinch emits continuously while the fingers move and each
   redraw reallocates two canvases per graph. */
var draculaPinchTimer = null;

function draculaWatchVisualViewport()
{
	var viewport = window.visualViewport;
	if(!viewport || !viewport.addEventListener)
		return;

	viewport.addEventListener("resize", function()
	{
		if(draculaPinchTimer)
			clearTimeout(draculaPinchTimer);

		draculaPinchTimer = setTimeout(function()
		{
			draculaPinchTimer = null;
			draculaResizeAllPlots();
		}, 150);
	});
}

/* === Status bar meters === */

/* The meters colour themselves by how full they are: the plugin interpolates
   between prgStartColor and prgEndColor at the current percentage and writes
   the result as an inline style. Upstream ramps green to red; this theme ramps
   Pink to Purple, so an idle meter is light and a full one deep, and every
   value between stays inside one palette family rather than passing through the
   muddy tones a green-to-red ramp gives at 50%.

   The repaint is not decoration: this runs from allDone, by which time the
   meter has drawn itself once with upstream's colours and would keep them until
   its next poll. Recomputing from the width already on screen fixes that at
   once, through the plugin's own RGBackground so the interpolation matches what
   the next poll will produce. */
function draculaRecolorMeter(name, elementId, startColor, endColor)
{
	var plg = thePlugins.get(name);
	if(!plg || !plg.enabled)
		return;

	plg.prgStartColor = new RGBackground(startColor);
	plg.prgEndColor = new RGBackground(endColor);

	if(!elementId)
		return;

	var bar = document.getElementById(elementId);
	if(!bar)
		return;

	var percent = parseFloat(bar.style.width);
	if(isNaN(percent))
		return;

	bar.style.backgroundColor = new RGBackground()
		.setGradient(plg.prgStartColor, plg.prgEndColor, percent)
		.getColor();
}

/* The CPU graph draws soft, and the cause is a race rather than the drawing.
   flot sizes its canvas from the holder at creation time, but upstream injects
   the theme's stylesheet from JS after the page has painted — so the canvas is
   built at upstream's 16px while the holder ends up at this theme's 20px.
   `#meter-cpu-holder canvas { height: 100% }` in plugins.css then stretches it,
   which is 16 rows of pixels resampled into 20: it hides the gap and keeps the
   softness.

   flot's own resize() rebuilds the canvas at the holder's real size, 100x16 ->
   100x20, after which it draws sharp and the height rule becomes a no-op.
   Retried a few times because the stylesheet may still be in flight when
   allDone runs; each attempt is skipped once the canvas already matches. */
function draculaResharpenCpuGraph(attempt)
{
	var plg = thePlugins.get("cpuload");
	if(!plg || !plg.graph || !plg.graph.resize)
		return;

	var holder = document.getElementById("meter-cpu-holder");
	var canvas = holder && holder.querySelector("canvas");
	if(!holder || !canvas)
		return;

	if(Math.abs(canvas.height - holder.getBoundingClientRect().height) > 0.5)
		plg.graph.resize();

	attempt = (attempt || 0) + 1;
	if(attempt < 4)
		setTimeout(function() { draculaResharpenCpuGraph(attempt); }, 400 * attempt);
}

/* === Status bar tooltips ===
 *
 * One function per section, each guarding its own element, so the updater
 * that drives them stays a list of calls. ruTorrent rewrites these titles as
 * it refreshes, so they are re-applied rather than set once.
 */

function draculaDiskTooltip(pane)
{
	if(!pane)
		return;
	var orig = pane.getAttribute("title") || "";
	if(orig.indexOf("Disk Space") === 0)
		return;
	// The diskspace plugin builds this from "%USED%/%TOTAL% (%FREE% free)", so
	// the first value is used space, not free. Matched on structure rather than
	// on words, which are translated.
	var dp = orig.match(/^\s*([^/]+?)\s*\/\s*([^(]+?)\s*(?:\(([^)]*)\))?\s*$/);
	if(!dp)
		return;
	// The bracketed part reads "26.2 GiB free"; only the amount is kept, the
	// trailing word being localized and already supplied by the label.
	var free = dp[3] ? (dp[3].match(/[\d.,]+\s*\S+/) || [dp[3]])[0] : "";
	pane.title = "Disk Space\nUsed: " + dp[1] +
		(free ? "\nFree: " + free : "") +
		"\nTotal: " + dp[2];
}

function draculaCpuTooltip(pane)
{
	if(!pane)
		return;
	var orig = pane.getAttribute("title") || "";
	if(orig.indexOf("CPU Load:") !== 0)
		pane.title = "CPU Load: " + orig;
}

function draculaConnectionsTooltip(cell)
{
	if(!cell)
		return;
	var count = function(id)
	{
		var el = document.getElementById(id);
		return el ? el.textContent.replace(/\D/g, "") : "0";
	};
	cell.title = "Open Connections\nHTTP: " + count("stopen_http_count") +
		"\nSockets: " + count("stopen_sock_count") +
		"\nFile Descriptors: " + count("stopen_fd_count");
}

function draculaTorrentsTooltip(cell)
{
	if(!cell)
		return;
	var rows = document.getElementById("viewrows");
	var size = document.getElementById("viewrows_size");
	if(!rows || !size)
		return;
	var parts = rows.textContent.split("/");
	cell.title = "Filtered Torrents: " + (parts[0] || "0") +
		"\nTotal Torrents: " + (parts[1] || "0") +
		"\nTotal Size: " + size.textContent;
}

function draculaPortTooltip(pane)
{
	if(!pane)
		return;
	// check_port states: 0 = still checking, 1 = closed, 2 = open. Tested for
	// pstatus2 rather than for "not pstatus1", which reports a verdict while
	// the check is still running.
	var status = pane.querySelector(".pstatus2") ? "Open"
		: pane.querySelector(".pstatus1") ? "Closed"
		: "Checking...";
	pane.title = "Port Status: " + status;
}

/* === Status bar behaviour === */

// Built with RegExp rather than a /\s+/ literal so the complexity analyser
// parses the function below correctly; with the literal it reads the rest of
// the file as part of it. Same expression either way.
var draculaWhitespace = new RegExp("\\s+");

// "0 http" reads as a quantity of nothing; "http: 0" reads as a label and a
// value. Re-applied on updates, the core rewriting the values as it refreshes.
function draculaFlipOnce(cell)
{
	var vals = cell.querySelectorAll(".stval");
	for(var i = 0; i < vals.length; i++)
	{
		var parts = vals[i].textContent.trim().split(draculaWhitespace);
		if(parts.length === 2 && !isNaN(parts[0]))
			vals[i].textContent = parts[1] + ": " + parts[0];
		if(i > 0)
			vals[i].style.marginLeft = "12px";
	}
}

function draculaFlipConnectionValues(cell)
{
	if(!cell)
		return;
	var flip = function() { draculaFlipOnce(cell); };
	flip();
	new MutationObserver(flip).observe(cell,
		{ childList: true, subtree: true, characterData: true });
}

// Upstream binds the speed limit menu to right-click alone, which is
// undiscoverable on a block that looks like a button. Left-click opens it too.
function draculaSpeedClickOpensMenu(el)
{
	if(!el)
		return;
	el.addEventListener("click", function(e)
	{
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		var target = this, x = e.clientX, y = e.clientY;
		setTimeout(function()
		{
			target.dispatchEvent(new MouseEvent("contextmenu",
				{ bubbles: true, clientX: x, clientY: y }));
		}, 50);
	});
}

// Keyboard access to the context menus. `objects.js:389` and `:409` bind
// `focus -> blur()` to every command, and the menu is rebuilt from scratch on
// each open, so clearing the handlers once at startup clears nothing that will
// exist a second later — the hook has to be the opening itself.
//
// Menus get their own layer rather than the generic roving group the other
// regions use, for two reasons that only appear once a menu has submenus. That
// group's selector is `a.menu-cmd`, while a submenu's parent is `a.exp`
// (objects.js:367), so those entries are unreachable; and its descendant
// selector reaches *into* an open submenu, folding those entries into the
// parent level's arrow order instead of their own.
//
// So each level is handled separately, direct children only, and the arrows
// mean what they mean in a menu: Down and Up walk the level, Right opens a
// submenu and steps into it, Left closes it and steps back out, Escape closes
// everything and returns to whatever opened the menu.
//
// Opening and closing go through upstream's own `openSubmenu`/`closeSubmenu`
// (objects.js:425, :440), called with a synthetic `{ currentTarget: li }` — they
// read only that property, and reusing them keeps the keyboard's submenu
// positioning identical to the mouse's, including the flips upstream does near
// the edges of the window.
var draculaMenuOpener = null;

function draculaMenuItems(menu)
{
	return Array.prototype.filter.call(
		menu.querySelectorAll(":scope > li > a.menu-cmd:not(.dis), :scope > li > a.exp"),
		function(el)
		{
			var rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		});
}

function draculaCloseMenu()
{
	theContextMenu.hide();
	if(draculaMenuOpener && document.contains(draculaMenuOpener))
		draculaMenuOpener.focus({ preventScroll: true });
}

function draculaOpenSubmenu(link)
{
	var li = link.parentElement;
	var submenu = li && li.querySelector(":scope > ul.CMenu");
	if(!submenu)
		return;
	theContextMenu.openSubmenu({ currentTarget: li });
	link.setAttribute("aria-expanded", "true");
	draculaPrepareMenuLevel(submenu, link);
	var first = draculaMenuItems(submenu)[0];
	if(first)
		first.focus({ preventScroll: true });
}

function draculaPrepareMenuLevel(menu, parentLink)
{
	menu.setAttribute("role", "menu");

	// Upstream binds `focus -> blur()` to every command as it builds them
	// (objects.js:389, :409), and the menu is rebuilt on each open, so this
	// runs per level, per open.
	var items = Array.prototype.slice.call(
		menu.querySelectorAll(":scope > li > a.menu-cmd, :scope > li > a.exp"));
	$(items).off("focus");
	items.forEach(function(item)
	{
		item.removeAttribute("onfocus");
		item.onfocus = null;
		item.setAttribute("role", "menuitem");
		item.tabIndex = -1;
		if(item.classList.contains("dis"))
			item.setAttribute("aria-disabled", "true");
		if(item.classList.contains("exp"))
		{
			item.setAttribute("aria-haspopup", "menu");
			item.setAttribute("aria-expanded", "false");
		}
	});

	if(menu.getAttribute("data-dracula-menu"))
		return;
	menu.setAttribute("data-dracula-menu", "1");

	menu.addEventListener("keydown", function(ev)
	{
		// A submenu sits inside its parent, so without this every level answers
		// the same key press.
		if(ev.target.parentElement.parentElement !== menu)
			return;

		var list = draculaMenuItems(menu);
		var index = list.indexOf(ev.target);
		var expandable = ev.target.classList.contains("exp");

		switch(ev.key)
		{
			case "ArrowDown":
			case "ArrowUp":
				if(index < 0 || !list.length)
					return;
				ev.preventDefault();
				var step = (ev.key === "ArrowDown") ? 1 : -1;
				var next = (index + step + list.length) % list.length;
				list[next].focus({ preventScroll: true });
				return;

			case "Home":
			case "End":
				if(!list.length)
					return;
				ev.preventDefault();
				list[ev.key === "Home" ? 0 : list.length - 1].focus({ preventScroll: true });
				return;

			case "ArrowRight":
				if(!expandable)
					return;
				ev.preventDefault();
				draculaOpenSubmenu(ev.target);
				return;

			case "ArrowLeft":
				if(!parentLink)
					return;
				ev.preventDefault();
				theContextMenu.closeSubmenu({ currentTarget: parentLink.parentElement });
				parentLink.setAttribute("aria-expanded", "false");
				parentLink.focus({ preventScroll: true });
				return;

			case "Enter":
			case " ":
				ev.preventDefault();
				if(expandable)
				{
					draculaOpenSubmenu(ev.target);
					return;
				}
				ev.target.click();
				// A mouse click closes the menu through the document mouseup
				// handler installed at objects.js:308. A keypress sends no
				// mouseup, so the menu would stay open over the thing it just
				// acted on.
				draculaCloseMenu();
				return;

			case "Escape":
				ev.preventDefault();
				draculaCloseMenu();
				return;
		}
	});
}

function draculaPrepareContextMenu()
{
	var menu = document.querySelector("ul.CMenu");
	if(!menu)
		return;

	draculaPrepareMenuLevel(menu, null);
	draculaFillMenuHotkeys(menu);

	var first = draculaMenuItems(menu)[0];
	if(first)
		first.focus({ preventScroll: true });
}

function draculaWatchContextMenu()
{
	if(!window.theContextMenu || typeof theContextMenu.show !== "function")
		return;
	var show = theContextMenu.show;
	theContextMenu.show = function()
	{
		// Remember who opened it, so Escape has somewhere to go back to.
		draculaMenuOpener = (document.activeElement && document.activeElement !== document.body)
			? document.activeElement : null;
		var result = show.apply(this, arguments);
		// The menu is animated open, so the commands are styled and measured a
		// tick later; preparing on the next task keeps `dis` accurate.
		setTimeout(draculaPrepareContextMenu, 0);
		return result;
	};
}

// The F1 help screen has to carry the theme's bindings too. Upstream builds
// that dialog as one Bootstrap row of `.col-4` key / `.col-8` action pairs
// (content.js:299), which with these entries added stands 300px wide and 773px
// tall in a 961px-high window.
//
// So it is rebuilt as two groups side by side, the split the content already
// has: what you can do, and how to move around. Upstream's eleven keep the left
// and their shipped order; these follow on the right. The cells are moved
// rather than recreated, so the six actions that are links keep their handlers.

// Inter's four plain arrows are not one family. As ink at 14px bold:
// U+2190/2192 draw 8.5x3.4 with a 0.63px shaft, U+2191/2193 draw 9.9x10.4 with
// a 1.75px shaft — 4.4 times the ink and a shaft nearly three times as thick,
// so "left up right down" reads as two tiny dashes between two heavy arrows.
// Metrics hide it: all four report the same 17px line box.
//
// U+2B05/2B06/27A1/2B07 are the set that holds together — ink areas 43.6, 43.2,
// 43.7, 43.2, a spread of 1.012 — and they are solid. U+FE0E pins text
// presentation: both U+2B05 and U+27A1 are Emoji=Yes, so a system whose
// fallback offers a colour glyph would otherwise paint one, and it changes
// nothing where the text face wins. Written as escapes on purpose: U+FE0E is
// invisible, and a literal here looks like a plain arrow someone can "tidy up"
// back into one.
var draculaArrow = {
	left:  "\u2B05\uFE0E",
	up:    "\u2B06\uFE0E",
	right: "\u27A1\uFE0E",
	down:  "\u2B07\uFE0E"
};

// One line each, measured against the 250px column the dialog's 720px gives:
// the longest, "Move between the five regions", is 204px. Keep new entries
// inside that, or this side of the screen wraps and reads as prose.
var draculaKeyHelp = [
	["Tab", "Move between the five regions"],
	[draculaArrow.left + " " + draculaArrow.up + " " + draculaArrow.right + " " + draculaArrow.down,
		"Move inside the region"],
	["Home / End", "First or last item in the region"],
	["Enter", "Open details, a tab or a filter"],
	["Space", "Toggle selection, or activate"],
	["Ctrl-Enter", "Torrent menu, or add a filter"],
	["Menu / Shift-F10", "Torrent menu, as a right click"],
	["Shift-" + draculaArrow.up + " " + draculaArrow.down, "Extend the selection in the list"],
	["Shift-Enter", "Select a range of filters"],
	["Escape", "Close the menu and go back"]
];

// What travels out of one of upstream's cells is the element inside it, not the
// cell: for six of the eleven that element is the `<a>` carrying the onclick.
function draculaHelpCell(cell)
{
	if(cell.firstElementChild)
		return cell.firstElementChild;
	var span = document.createElement("span");
	span.textContent = cell.textContent.trim();
	return span;
}

// A `<dl>` because a list of term-and-meaning is what this is, and because it
// lets the stylesheet size the key column to its own content. Bootstrap's flat
// third is too little for "Ctrl-Enter" and far too much for "Tab" at the 250px
// each group gets here.
function draculaHelpGroup(title, pairs)
{
	var group = document.createElement("div");
	group.className = "col-12 col-md-6 dracula-help-group";

	var heading = document.createElement("div");
	heading.className = "dracula-help-title";
	heading.textContent = title;
	group.appendChild(heading);

	var list = document.createElement("dl");
	list.className = "dracula-help-list";
	pairs.forEach(function(pair)
	{
		var key = document.createElement("dt");
		key.appendChild(pair[0]);
		var action = document.createElement("dd");
		action.appendChild(pair[1]);
		list.appendChild(key);
		list.appendChild(action);
	});
	group.appendChild(list);
	return group;
}

function draculaFillKeyHelp()
{
	var dlg = document.getElementById("dlgHelp");
	if(!dlg || dlg.getAttribute("data-dracula-keys"))
		return;
	var row = dlg.querySelector(".row");
	if(!row)
		return;
	dlg.setAttribute("data-dracula-keys", "1");

	var cells = Array.prototype.slice.call(row.children);
	var commands = [];
	for(var i = 0; i + 1 < cells.length; i += 2)
		commands.push([draculaHelpCell(cells[i]), draculaHelpCell(cells[i + 1])]);

	// Upstream lists Del ninth, in the middle of the Ctrl group. Read down the
	// column the modifier keys belong together with the single keys after them,
	// so it moves to the end of what upstream supplied — under Ctrl-Z, above the
	// letters appended below. Matched on the key text, the literal "Del" at
	// `content.js:311`, rather than on its position in the list.
	//
	// Its wording is rephrased at the same time: upstream's
	// `Delete_current_torrents` reads "Delete current torrent(s)", the one line
	// in the column speaking in parenthesised plurals, sitting directly above
	// lines that say "the selected torrents" for the same set. Only the help
	// screen is touched; `theUILang` is left alone, since the menus and every
	// translation read from it.
	for(var d = 0; d < commands.length; d++)
	{
		if(commands[d][0].textContent.trim() !== "Del")
			continue;
		commands[d][1].textContent = "Delete the selected torrents";
		commands.push(commands.splice(d, 1)[0]);
		break;
	}

	// The torrent actions join Commands rather than Navigation: the screen is
	// grouped by what a key does, and these act on a selection rather than
	// moving around.
	draculaTorrentActions.forEach(function(entry)
	{
		var key = document.createElement("span");
		key.className = "fw-bold";
		key.textContent = entry[0].toUpperCase();
		var text = document.createElement("span");
		text.textContent = entry[2];
		commands.push([key, text]);
	});

	var moves = draculaKeyHelp.map(function(pair)
	{
		var key = document.createElement("span");
		key.className = "fw-bold";
		key.textContent = pair[0];
		var text = document.createElement("span");
		text.textContent = pair[1];
		return [key, text];
	});

	// Both groups are built first, which is what empties the old cells; only
	// then is the row cleared of the husks and given the two groups. Commands
	// keep the left, navigation follows on the right.
	var actions = draculaHelpGroup("Commands", commands);
	var movement = draculaHelpGroup("Navigation", moves);
	row.textContent = "";
	row.appendChild(actions);
	row.appendChild(movement);
}

// Upstream styles `span.htkey`, a hotkey slot inside menu commands, and never
// fills it. Matching is by the command's own text against the language table
// rather than by position, because plugins insert commands of their own.
//
// Only what is really bound goes in here. `dxSTable.keyEvents` (`stable.js:809`)
// handles three keys and no more: Delete, Ctrl-A and Ctrl-Z. Properties takes
// no "Enter" hint — Enter on a row reaches `ondblclick`, which is `showDetails`
// and opens the details panel, while Properties is `showProperties`.
function draculaFillMenuHotkeys(menu)
{
	if(!window.theUILang)
		return;
	var keys = {};
	if(theUILang.Delete) keys[theUILang.Delete] = "Del";
	if(theUILang.Remove) keys[theUILang.Remove] = "Del";
	if(theUILang.Start) keys[theUILang.Start] = "S";
	if(theUILang.Pause) keys[theUILang.Pause] = "P";
	if(theUILang.Stop) keys[theUILang.Stop] = "T";
	if(theUILang.updateTracker) keys[theUILang.updateTracker] = "U";
	if(theUILang.Force_recheck) keys[theUILang.Force_recheck] = "R";

	Array.prototype.forEach.call(menu.querySelectorAll("a.menu-cmd"), function(cmd)
	{
		if(cmd.querySelector("span.htkey"))
			return;
		var hint = keys[cmd.textContent.trim()];
		if(!hint)
			return;
		var span = document.createElement("span");
		span.className = "htkey";
		span.textContent = hint;
		cmd.appendChild(span);
	});
}

// Upstream's separators sit where its source order puts them, not where this
// theme's three-zone layout leaves the groups: the one before RSS divides
// nothing, the auto margin having already opened ~390px between the search and
// settings groups, while Go and the activity indicator are pressed together
// with no mark at all. The second stands in front of the Plugins dropdown, so
// the bar ends `RSS Settings │ Plugins ▾ Help` and the caret reads as though it
// could open either Plugins or Help.
//
// style.css hides the strays; the replacements go in here as real
// `div.TB_Separator` elements, so they take the width, colour and inset the
// theme already gives every other separator rather than a second definition
// that would have to be kept in step.
function draculaInsertSeparator(before)
{
	if(!before || before.previousElementSibling &&
		before.previousElementSibling.classList.contains("TB_Separator"))
		return;
	var rule = document.createElement("div");
	rule.className = "TB_Separator";
	rule.setAttribute("data-dracula-separator", "1");
	before.parentNode.insertBefore(rule, before);
}

function draculaFixToolbarSeparators()
{
	draculaInsertSeparator(document.getElementById("ind"));
	draculaInsertSeparator(document.getElementById("mnu_help"));
}

// The search box has two behaviours and the toolbar shows neither: with "Local
// Torrents" chosen the field filters the list live on every keystroke
// (webui.js:497 -> updateQuickSearch), and with an engine chosen it does nothing
// until Enter or Go.
//
// So the source is named in three places that cost no layout: a badge in front
// of the magnifier, the field's own placeholder, and the button's tooltip.
//
// For a real engine the badge is that engine's favicon, at the native 16px the
// sidebar pins them to. "Local Torrents" gets the list glyph, that case not
// being a search at all. "all", "public" and "private" are covered below.
function draculaSearchSource()
{
	var engines = window.theSearchEngines;
	if(!engines)
		return null;
	var current = engines.current;
	var lang = window.theUILang || {};

	// getEngName covers the three group names and an engine key, but returns a
	// raw -1 for local search, which upstream never named.
	if(current === -1 || current === "-1")
		return { name: lang.innerSearch || "Local Torrents", icon: "var(--icon-list)", local: true };

	var name = (typeof engines.getEngName === "function")
		? engines.getEngName(current) : current;
	// Not the magnifier the sidebar substitutes for these three images: this
	// badge sits immediately left of the big magnifier, where a small copy of it
	// reads as a stutter rather than as information. These three mean "several
	// engines at once", which is what the tracker rows' network glyph says.
	if(current === "all" || current === "public" || current === "private")
		return { name: name, icon: "var(--icon-peer-network)", local: false };

	return {
		name: name,
		icon: "url(\"./plugins/extsearch/images/" + current + ".png\")",
		local: false
	};
}

function draculaSyncSearchSource()
{
	var source = draculaSearchSource();
	var button = document.getElementById("mnu_search");
	var field = document.getElementById("query");
	if(!source || !button || !field)
		return;

	var badge = document.getElementById("dracula-search-source");
	if(!badge)
	{
		badge = document.createElement("div");
		badge.id = "dracula-search-source";
		badge.setAttribute("aria-hidden", "true");
		button.parentNode.insertBefore(badge, button);
	}
	badge.style.backgroundImage = source.icon;

	// Attributes rather than text nodes on purpose: #t is watched for childList
	// changes to keep the roving tab order fresh, and rewriting a text node here
	// would wake that observer on every selection change.
	field.placeholder = source.local
		? "Filter the list"
		: "Search " + source.name;
	button.title = (window.theUILang && theUILang.mnu_search ? theUILang.mnu_search : "Search")
		+ ": " + source.name;
	button.setAttribute("aria-haspopup", "menu");
}

// The selection is written in four places — `set()` plus three direct
// assignments inside extsearch's own correction pass — so wrapping the setter
// alone would miss three of them. An accessor over a private field catches
// every write and stays invisible to the code doing the writing.
function draculaWatchSearchSource()
{
	var engines = window.theSearchEngines;
	if(!engines)
		return;
	try
	{
		var value = engines.current;
		Object.defineProperty(engines, "current", {
			configurable: true,
			enumerable: true,
			get: function(){ return value; },
			set: function(next)
			{
				value = next;
				draculaSyncSearchSource();
			}
		});
	}
	catch(e)
	{
		// A future ruTorrent could make the property non-configurable. The label
		// is worth having even if it can then only be right at load.
	}
	draculaSyncSearchSource();
}

// Region five: the status bar. Almost all of it is read-only text, but the two
// speed cells are real controls — clicking either opens its throttle menu.
//
// That menu opens on a `contextmenu` event carrying pointer coordinates. A
// keyboard has no pointer, so the cell's own box supplies them and the menu
// lands under the control it belongs to.
function draculaSpeedMenuFromKeyboard(cell)
{
	var rect = cell.getBoundingClientRect();
	cell.dispatchEvent(new MouseEvent("contextmenu", {
		bubbles: true,
		clientX: Math.round(rect.left + rect.width / 2),
		clientY: Math.round(rect.bottom)
	}));
}

function draculaStatusBarKeys()
{
	var bar = document.getElementById("StatusBar");
	if(!bar)
		return;
	bar.setAttribute("role", "region");
	bar.setAttribute("aria-label", "Status");

	var cells = ["st_up", "st_down"].map(function(id){ return document.getElementById(id); })
		.filter(Boolean);
	if(!cells.length)
		return;
	cells.forEach(function(cell)
	{
		cell.setAttribute("role", "button");
		cell.setAttribute("aria-haspopup", "menu");
		if(!cell.getAttribute("aria-label"))
		{
			cell.setAttribute("aria-label",
				(cell.id === "st_up" ? "Upload" : "Download") + " speed, opens the throttle menu");
		}
	});

	draculaRovingGroup(bar, "#st_up, #st_down", {
		activate: function(cell){ draculaSpeedMenuFromKeyboard(cell); }
	});
}

// ruTorrent refuses keyboard focus on much of its own chrome:
// `addButtonToToolbar` binds `focus: (ev) => ev.target.blur()` to every toolbar
// button (plugins.js:364), and `attachPageToTabs` does the same to every
// plugin-added detail tab (plugins.js:271). The effect is that the toolbar and
// four of the eleven detail tabs cannot be reached from a keyboard at all, and
// no stylesheet can mark focus on an element that never holds it.
//
// It is done two ways, and both have to be undone:
//   - the core toolbar buttons carry an inline `onfocus="this.blur()"`
//     attribute in index.html, which no amount of jQuery `off()` can reach;
//   - everything added later binds a jQuery handler instead.
//
// `off("focus")` clears every jQuery focus handler on these elements, which is
// safe because the blur is the only one any of them carries in 5.3.7.
// Context-menu commands (objects.js:389, :409) do the same thing but are
// rebuilt on each open, so they are handled by draculaPrepareMenuLevel.
var draculaFocusThieves = "#t a.nav-link, #tabbar li.nav-item a";

function draculaRestoreKeyboardFocus()
{
	$(draculaFocusThieves).off("focus").each(function()
	{
		// Both spellings: the attribute is what the parser read, the property is
		// what it compiled into. Clearing one alone leaves the other in place.
		this.removeAttribute("onfocus");
		this.onfocus = null;
	});
}

// The keyboard model: five regions — toolbar, sidebar, torrent list, detail
// panel, status bar — where Tab moves between regions and the arrows move
// inside one. This function is the mechanism every region is wired to.
//
// Unaided, 5.3.7 offers 26 tab stops and 25 of them are two rows — 14 toolbar
// controls and 11 detail tabs — so Tab never leaves the first row. A roving
// tabindex is the standard answer: exactly one control in a region is tabbable,
// and an arrow key moves both the focus and that single stop.
//
// The pattern bends around two controls, and the rule is the same for both — a
// control keeps the axis it needs and gives up the other:
//   - a text field owns Left/Right, which move its caret, so the row moves on
//     Up/Down instead;
//   - a <select> owns Up/Down, which change its value, so it moves on
//     Left/Right. Space and Enter still open it, and inside the open list the
//     browser's own Up/Down pick an option.
// Neither control becomes unreachable and neither loses a key it needs.

// Arrow order follows what is on screen, not what is in the markup. The two
// differ in the toolbar by this theme's doing: the three-zone layout moves the
// search and settings groups past each other with flex `order`, so the DOM runs
// …Stop, RSS, Settings, Plugins, Help, Search, field, Go while the eye reads
// …Stop, Search, field, Go, RSS, Settings, Plugins, Help.
//
// Items are grouped into visual rows by their vertical centre and sorted left
// to right within a row, which reads correctly for a horizontal bar, for the
// vertical sidebar, and for a toolbar wrapped onto two lines. Bucketing rather
// than comparing centres pairwise keeps the comparator transitive.
function draculaRovingItems(container, itemSelector)
{
	var items = Array.prototype.filter.call(container.querySelectorAll(itemSelector),
		function(el)
		{
			var rect = el.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0 && !el.disabled;
		});

	return items.map(function(el)
	{
		var rect = el.getBoundingClientRect();
		return { el: el, row: Math.round((rect.top + rect.height / 2) / 8), left: rect.left };
	}).sort(function(a, b)
	{
		return (a.row - b.row) || (a.left - b.left);
	}).map(function(entry){ return entry.el; });
}

// Which control holds the region's single tab stop. Keep whatever already has
// it, so a plugin adding a button mid-session cannot move the user's place;
// otherwise ask the caller, and fall back to the first control.
function draculaRovingSync(container, itemSelector, preferred)
{
	var items = draculaRovingItems(container, itemSelector);
	if(!items.length)
		return items;
	var current = items.filter(function(el){ return el.tabIndex === 0; })[0];
	if(!current && preferred)
		current = preferred(items);
	if(!current)
		current = items[0];
	// Every matched control is pinned, not only the ones the arrows visit.
	// Otherwise a hidden or disabled control keeps its own tabindex and becomes
	// a second stop in the region the moment it is enabled — the sidebar's
	// "save view" button ships disabled and does exactly that.
	Array.prototype.forEach.call(container.querySelectorAll(itemSelector), function(el)
	{
		el.tabIndex = (el === current) ? 0 : -1;
	});
	return items;
}

// options.preferred(items) — which control should hold the stop to begin with.
// options.activate(el, ev)  — what Enter and Space do. Without it they fall
//                             through to a link's own click, which is right for
//                             the two rows of <a> but not for the sidebar.
function draculaRovingGroup(container, itemSelector, options)
{
	if(!container || container.getAttribute("data-dracula-roving"))
		return;
	container.setAttribute("data-dracula-roving", "1");
	options = options || {};
	var preferred = options.preferred;
	var activate = options.activate;

	draculaRovingSync(container, itemSelector, preferred);

	// Clicking a control makes it the region's stop, so Tab returns to where the
	// user last was rather than to the start of the row.
	container.addEventListener("focusin", function(ev)
	{
		var items = draculaRovingItems(container, itemSelector);
		if(items.indexOf(ev.target) < 0)
			return;
		items.forEach(function(el){ el.tabIndex = (el === ev.target) ? 0 : -1; });
	});

	container.addEventListener("keydown", function(ev)
	{
		// Modifiers are let through only for activation, where Ctrl and Shift
		// mean what they mean for a click — add to the selection, extend it.
		var activating = (ev.key === " " || ev.key === "Enter");
		if((ev.altKey || ev.ctrlKey || ev.metaKey) && !activating)
			return;

		var items = draculaRovingItems(container, itemSelector);
		var index = items.indexOf(ev.target);
		if(index < 0)
			return;

		var tag = ev.target.tagName;
		var typing = (tag === "INPUT" && !/^(button|submit|checkbox|radio)$/i.test(ev.target.type))
			|| tag === "TEXTAREA";
		var picking = (tag === "SELECT");

		// A text field owns the arrows only while there is text left to walk. At
		// the edge of the value it hands them back, so the row carries on, and
		// an empty field is at both edges at once and never traps anything.
		// Without this the search box is a dead end: Left and Right do nothing
		// visible and only Up or Down escapes.
		var atStart = true, atEnd = true;
		if(typing)
		{
			var value = String(ev.target.value || "");
			var from = ev.target.selectionStart, to = ev.target.selectionEnd;
			// A selection is a range to collapse, not an edge to leave from.
			var collapsed = (from === to);
			atStart = collapsed && from === 0;
			atEnd = collapsed && to === value.length;
		}
		// null means "this key is not handled here" — distinct from a
		// negative index, which means "wrapped past the start".
		var target = null;

		switch(ev.key)
		{
			case "ArrowRight": if(!typing || atEnd) target = index + 1; break;
			case "ArrowLeft":  if(!typing || atStart) target = index - 1; break;
			case "ArrowDown":  if(!picking) target = index + 1; break;
			case "ArrowUp":    if(!picking) target = index - 1; break;
			case "Home":       if(!typing && !picking) target = 0; break;
			case "End":        if(!typing && !picking) target = items.length - 1; break;
			case " ":
			case "Enter":
				if(activate)
				{
					ev.preventDefault();
					activate(ev.target, ev);
					return;
				}
				// A link does not activate on Space the way a button does, and
				// every control in these two rows is an <a>. Enter is handled
				// here too, not for activation — that works already — but for
				// what happens after it.
				//
				// Restricted to links on purpose: Enter in the search field has
				// to reach upstream's handler and run the search.
				if(tag !== "A")
					return;
				ev.preventDefault();
				var link = ev.target;
				link.click();
				// Upstream blurs the detail tabs on click (common.js:858) to
				// keep the ring off after a mouse click. From the keyboard that
				// drops focus to the body and loses the row, so it is restored
				// after the click handler has run, leaving the mouse alone.
				//
				// Only when nothing else claimed it: the magnifier opens a menu
				// that takes focus on its first command, and an unconditional
				// restore drags focus straight back out of it.
				setTimeout(function()
				{
					var now = document.activeElement;
					if(!now || now === document.body || now === document.documentElement)
						link.focus();
				}, 0);
				return;
			default: return;
		}

		if(target === null || target === index)
			return;
		if(target < 0)
			target = items.length - 1;
		if(target >= items.length)
			target = 0;

		ev.preventDefault();
		items.forEach(function(el){ el.tabIndex = (el === items[target]) ? 0 : -1; });
		items[target].focus();
	});
}

// The detail tabs are a real tab set, so they are labelled as one. Upstream's
// markup already pairs them with their panels — the tab is `li#tab_gcont` and
// its panel is `div#gcont` — so aria-controls needs no new bookkeeping, only
// the prefix removed.
//
// aria-selected follows upstream rather than leading it: selection is marked by
// a `selected` class ruTorrent puts on the li, so the class is what is watched
// and mirrored. Painting is untouched — Bootstrap styles these by class.
function draculaSyncTabRoles()
{
	var bar = document.getElementById("tabbar");
	if(!bar)
		return;
	bar.setAttribute("role", "tablist");

	Array.prototype.forEach.call(bar.querySelectorAll("li.nav-item"), function(li)
	{
		var link = li.querySelector("a");
		if(!link || !li.id)
			return;
		var panel = document.getElementById(li.id.replace(/^tab_/, ""));
		link.setAttribute("role", "tab");
		link.setAttribute("aria-selected", li.classList.contains("selected") ? "true" : "false");
		if(panel)
		{
			if(!link.id)
				link.id = "dracula-" + li.id;
			link.setAttribute("aria-controls", panel.id);
			panel.setAttribute("role", "tabpanel");
			panel.setAttribute("aria-labelledby", link.id);
		}
	});
}

// The sidebar — Views, State, Labels, Search, Feeds, Trackers. Unlike the
// toolbar there is no handler to remove: in 5.3.7 its 20 `panel-label` elements
// have `tabIndex` -1, no role, and a shadow root with zero focusable nodes, so
// there is nothing to focus and the whole region is built here.
//
// Selection runs off **mousedown**, not click (category-list-elements.js:168),
// so a synthetic `.click()` on a label changes nothing. Enter and Space
// dispatch mousedown instead, passing the modifiers through so Ctrl and Shift
// mean the same from the keyboard as from the mouse. Going through upstream's
// own event rather than its internals keeps the two from drifting apart.
//
// One compromise: the "save view" button sits inside `category-list` in
// upstream's markup, so a listbox role on the list encloses a button however
// the tab order is arranged. It is left in the arrow order, which keeps the
// region to a single tab stop and the button reachable.
function draculaLabelActivate(label, ev)
{
	label.dispatchEvent(new MouseEvent("mousedown", {
		bubbles: true,
		button: 0,
		ctrlKey: ev.ctrlKey,
		metaKey: ev.metaKey,
		shiftKey: ev.shiftKey
	}));
}

function draculaSyncSidebarRoles()
{
	var list = document.querySelector("category-list");
	if(!list)
		return;
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-label", "Torrent filters");
	// Ctrl-click already adds to the selection, so say so.
	list.setAttribute("aria-multiselectable", "true");

	Array.prototype.forEach.call(list.querySelectorAll("category-panel"), function(panel)
	{
		panel.setAttribute("role", "group");
		var heading = panel.shadowRoot && panel.shadowRoot.querySelector("[part=heading]");
		var name = heading && heading.textContent.trim();
		if(name)
			panel.setAttribute("aria-label", name);
	});

	Array.prototype.forEach.call(list.querySelectorAll("panel-label"), function(label)
	{
		label.setAttribute("role", "option");
		label.setAttribute("aria-selected", label.hasAttribute("selected") ? "true" : "false");
		if(!label.hasAttribute("tabindex"))
			label.tabIndex = -1;
	});

	var save = document.getElementById("pview_save_view_button");
	if(save && !save.getAttribute("aria-label"))
		save.setAttribute("aria-label", "Save current filters as a view");
}

// Region four: the torrent list. Nothing here duplicates upstream —
// `dxSTable.keyEvents` (stable.js:809) is bound to document keydown but handles
// exactly three keys: Delete, Ctrl-A and Ctrl-Z, no arrows, Space or Enter.
//
// The list is virtualised: only the rows on screen exist in the DOM, so a roving
// tabindex over rows would fight the renderer. The container is the tab stop
// instead and the current row is named by aria-activedescendant, which is the
// pattern virtualised lists exist for.
//
// Selection goes through upstream's own `selectRow`, which reads nothing from
// the row but its id (stable.js:840) — so a row scrolled out of the DOM can
// still be selected by passing `{ id: … }`. It ends by calling `onselect`, the
// same callback a mouse click ends with, so the detail panel follows along.
var draculaListAnchor = null;

function draculaListTable()
{
	return (window.theWebUI && theWebUI.tables && theWebUI.tables.trt)
		? theWebUI.tables.trt.obj : null;
}

function draculaListScrollTo(index)
{
	var scroller = document.querySelector("#List .stable-body");
	var table = draculaListTable();
	if(!scroller || !table)
		return;
	var height = table.TR_HEIGHT || 30;
	var top = index * height;
	if(top < scroller.scrollTop)
		scroller.scrollTop = top;
	else if(top + height > scroller.scrollTop + scroller.clientHeight)
		scroller.scrollTop = top + height - scroller.clientHeight;
}

function draculaListSelect(id, ev, toggle)
{
	var table = draculaListTable();
	if(!table)
		return;
	table.selectRow({
		which: 1,
		metaKey: toggle || ev.ctrlKey || ev.metaKey,
		shiftKey: ev.shiftKey
	}, { id: id });
	draculaListAnchor = id;
	var list = document.getElementById("List");
	if(list)
		list.setAttribute("aria-activedescendant", id);
	draculaListScrollTo(table.rowIDs.indexOf(id));
	draculaSyncListRoles();
}

// The torrent menu, which upstream opens on a right click alone.
//
// It opens through upstream's own path rather than around it. `which: 3` is
// exactly what a right click sends, and that matters twice: `selectRow` keeps a
// multi-row selection intact when the row under the pointer is already in it
// (`stable.js:847`), and `trtSelect` is what builds the menu and shows it
// (`webui.js:1367`). Reimplementing either would mean two menus to keep in step.
//
// The menu is placed at the focused row's bottom-left, where a right click on
// its name would land. `theContextMenu.show` already pulls a menu back inside
// the window on both axes (`objects.js:451`), so a row at the bottom of the list
// needs nothing special here.
function draculaListMenu(id)
{
	var table = draculaListTable();
	if(!table || !id)
		return;
	// Rows are virtualised, but every path that moves the focus scrolls the
	// target into view first, so the element is normally there; the list is the
	// fallback rather than a guess at coordinates.
	var anchor = document.getElementById(id) || document.getElementById("List");
	if(!anchor)
		return;
	var rect = anchor.getBoundingClientRect();
	table.selectRow({
		which: 3,
		metaKey: false,
		shiftKey: false,
		clientX: Math.round(rect.left + 24),
		clientY: Math.round(rect.bottom)
	}, { id: id });
}

// Sideways movement lands on column edges rather than on a round number of
// pixels, so a step always leaves a whole column against the frame. The edges
// are summed from the heading cells because those are the only certainly-used
// widths — `colgroup` carries what was asked for, not what the table settled on.
//
// The two directions snap to different sides on purpose: a column boundary comes
// to rest against whichever edge of the port the step is moving towards, left
// going left and right going right. That is the edge the eye watches, and a
// column arriving there half shown reads as a missed step.
function draculaListScrollColumn(direction)
{
	var list = document.getElementById("List");
	var table = draculaListTable();
	var scroller = list ? list.querySelector(".stable-body") : null;
	if(!scroller || !table)
		return;

	var edges = [0];
	var cells = table.tHeadRow[0].getElementsByTagName("td");
	var x = 0;
	for(var i = 0; i < cells.length; i++)
	{
		x += cells[i].getBoundingClientRect().width;
		edges.push(Math.round(x));
	}

	var port = scroller.clientWidth;
	var limit = scroller.scrollWidth - port;
	var at = scroller.scrollLeft;
	var target = (direction > 0) ? limit : 0;
	if(direction > 0)
	{
		// The first boundary still past the right of the port, brought back to
		// it — so the step reveals one more whole column and stops there.
		for(var f = 0; f < edges.length; f++)
			if(edges[f] > at + port + 1) { target = edges[f] - port; break; }
	}
	else
	{
		for(var b = 0; b < edges.length; b++)
			if(edges[b] < at - 1) target = edges[b];
	}
	scroller.scrollLeft = Math.max(0, Math.min(target, limit));
}

// Rows are rebuilt as the list scrolls and as the server updates, so the roles
// are re-applied rather than set once.
function draculaSyncListRoles()
{
	var list = document.getElementById("List");
	var table = draculaListTable();
	if(!list || !table)
		return;
	Array.prototype.forEach.call(
		list.querySelectorAll(".stable-body table tbody:not(.stable-virtpad) tr"),
		function(row)
		{
			if(!row.id)
				return;
			row.setAttribute("role", "option");
			row.setAttribute("aria-selected", table.rowSel[row.id] ? "true" : "false");
		});
}

function draculaTorrentListKeys()
{
	var list = document.getElementById("List");
	if(!list || list.getAttribute("data-dracula-keys"))
		return;
	list.setAttribute("data-dracula-keys", "1");
	list.tabIndex = 0;
	list.setAttribute("role", "listbox");
	list.setAttribute("aria-multiselectable", "true");
	list.setAttribute("aria-label", "Torrents");

	// The list was costing two tab stops, not one. `#List` is this theme's, but
	// the scrollport inside it is Chrome's: a scroll container with no focusable
	// child joins the tab order by itself, so Tab landed on the region twice —
	// measured `panel-label` then `#List` then `div.stable-body` then the detail
	// tabs. An explicit tabindex is what takes a scroller back out of the
	// sequence, and -1 keeps it reachable to script and to the mouse.
	//
	// That stop was not useless, which is why it is replaced rather than only
	// removed: this table is 3305px wide inside a 1636px port, so the browser's
	// scroller focus was the only way to reach the right-hand columns from the
	// keyboard. Left and Right now do it from `#List` itself — they were free
	// here, since `#List` is `overflow: hidden` and nothing scrolled on them.
	var scroller = list.querySelector(".stable-body");
	if(scroller)
		scroller.tabIndex = -1;

	// Upstream arms its own Delete and Ctrl-A only after the first mousedown on
	// the table (stable.js:209), which a keyboard user never sends. Arming on
	// focus is what the mouse path does one event earlier.
	list.addEventListener("focus", function()
	{
		var table = draculaListTable();
		if(table && typeof table.bindKeys === "function")
			table.bindKeys();
		draculaSyncListRoles();
	});

	list.addEventListener("keydown", function(ev)
	{
		var table = draculaListTable();
		if(!table || !table.rowIDs.length)
			return;
		if(ev.altKey)
			return;

		var ids = table.rowIDs;
		var current = draculaListAnchor;
		if(!current || ids.indexOf(current) < 0)
			current = (table.stSel && table.stSel.length) ? table.stSel[0] : null;
		var index = current ? ids.indexOf(current) : -1;
		// The linter is right that nothing reads this null: every case below
		// either assigns a number or returns, so the guard after the switch is
		// unreachable today. Both stay. They are the net under the next case
		// someone adds — one that forgets to assign would otherwise fall
		// through to ids[undefined] — and that is worth one dead assignment.
		// eslint-disable-next-line no-useless-assignment
		var target = null;

		switch(ev.key)
		{
			case "ArrowDown": target = (index < 0) ? 0 : Math.min(index + 1, ids.length - 1); break;
			case "ArrowUp":   target = (index < 0) ? 0 : Math.max(index - 1, 0); break;
			case "ArrowRight":
			case "ArrowLeft":
				ev.preventDefault();
				draculaListScrollColumn(ev.key === "ArrowRight" ? 1 : -1);
				return;
			case "Home":      target = 0; break;
			case "End":       target = ids.length - 1; break;
			case " ":
				if(index >= 0)
				{
					ev.preventDefault();
					draculaListSelect(ids[index], ev, true);
				}
				return;
			case "Enter":
				if(index < 0)
					return;
				ev.preventDefault();
				// Ctrl-Enter is free here, Enter opening the details with or
				// without it, so the menu takes it. In the sidebar Ctrl-Enter adds
				// a filter instead; Enter means a different thing in every region.
				if(ev.ctrlKey || ev.metaKey)
					draculaListMenu(ids[index]);
				else if(typeof table.ondblclick === "function")
					table.ondblclick({ id: ids[index] });
				return;
			// Both have to be taken on keydown: upstream cancels the
			// `contextmenu` event document-wide (`webui.js:244`), so the
			// browser's own path never arrives.
			case "ContextMenu":
				if(index < 0)
					return;
				ev.preventDefault();
				draculaListMenu(ids[index]);
				return;
			case "F10":
				if(index < 0 || !ev.shiftKey)
					return;
				ev.preventDefault();
				draculaListMenu(ids[index]);
				return;
			default: return;
		}

		if(target === null)
			return;
		ev.preventDefault();
		draculaListSelect(ids[target], ev, false);
	});
}

// The toolbar's loading indicator turns while the UI is waiting on the server
// and stands still otherwise, and it never stops halfway. CSS alone cannot do
// that: an animation ends the instant its rule stops matching, so a request
// finishing mid-turn would snap the web back to zero.
//
// So the class comes off at an iteration boundary rather than immediately. The
// keyframes hold at 360 degrees for the last third of each cycle, and a boundary
// is the end of that hold — the glyph is back at its starting angle, so removing
// the animation there moves nothing. A turn under way always finishes; one that
// has not begun never starts.
//
// What counts as "waiting" is upstream's judgement: `rtorrent.js:1346` reveals
// `#ind` only once a request has been outstanding for 500ms, and that gate is
// read here rather than reimplemented, so the timing has one source of truth.
//
// Not driven from `ajaxStart`: ruTorrent polls the server about every 2.5s
// whether or not anyone is doing anything, so a turn per round-trip would be a
// 2.4s turn starting every 2.5s — a web that never stops, reporting work nobody
// is waiting for. Background polling is not loading.
//
// The consequence is deliberate: on a fast server the web stays still, because
// nothing is slow enough to be worth reporting — 29 requests in 16s here, median
// 6ms, slowest 28ms, none near the 500ms gate. Stillness is the correct signal.
function draculaWatchLoadingIndicator()
{
	var ind = document.getElementById("ind");
	if(!ind)
		return;

	var stopWhenTurnEnds = false;

	// Motion alone reads at a glance only once you know what the glyph is, and on
	// a fast server the web is nearly always still, so the tooltip names it and
	// gives its state. A name and one word, not a manual for the mechanism.
	//
	// It follows the class rather than the request, so the word and the picture
	// cannot disagree: a request finishing mid-turn leaves the web turning for the
	// rest of that turn, and for that time it is truthfully busy.
	var setTitle = function(busy)
	{
		ind.title = "Activity Indicator\n" + (busy ? "Waiting" : "Idle");
	};
	setTitle(false);

	ind.addEventListener("animationiteration", function()
	{
		if(!stopWhenTurnEnds)
			return;
		stopWhenTurnEnds = false;
		ind.classList.remove("dracula-loading");
		setTitle(false);
	});

	new MutationObserver(function()
	{
		if(ind.style.visibility === "visible")
		{
			// A wait arriving during the rest cancels the pending stop, so
			// the web carries on into the next turn.
			stopWhenTurnEnds = false;
			ind.classList.add("dracula-loading");
			setTitle(true);
		}
		else if(ind.classList.contains("dracula-loading"))
			stopWhenTurnEnds = true;
	}).observe(ind, { attributes: true, attributeFilter: ["style"] });
}

// The tab icon. A theme cannot touch index.html, where the thirteen <link>
// elements that declare it live — one .ico, eight apple-touch sizes and four
// PNGs — but it can replace the lot from here with one inline SVG.
//
// The letterform is upstream's own, traced from images/favicon-196x196.png:
// same stem with its flared base, same top flag, same round shoulder on a thin
// neck. Tracing the raster directly follows its antialiasing and gives a lumpy
// outline; blurring a 12x upscale before the threshold gives a clean one and
// halves the path, 65 nodes against 138, the curve no longer describing noise.
//
// Two colours, both read from the palette rather than written here, which is the
// point of doing it this way: a re-themed copy of this folder changes its custom
// properties and the tab icon follows, with no JavaScript to edit.
var draculaLetterR =
	"M120 29C111 29 96 31 87 33C85 34 82 34 81 35C75 36 72 37 68 38C65 39 64 39 61 40" +
	"C58 40 57 41 55 42C54 42 53 43 53 43C52 43 50 44 49 44C46 45 45 46 43 47" +
	"C42 47 41 48 40 49C37 50 37 50 35 52C34 52 33 53 33 53C30 55 27 59 26 61" +
	"C23 67 22 72 25 77C27 80 28 80 33 83C39 85 40 86 42 88C45 91 47 96 48 102" +
	"C48 105 48 105 48 124C48 145 48 147 48 156C47 165 45 177 44 180C42 183 38 188 34 191" +
	"C33 192 32 193 31 193C30 194 29 195 28 195C27 196 25 198 23 201C20 205 20 213 23 218" +
	"C26 223 30 226 38 230C41 231 45 232 53 234C64 236 82 237 111 236C132 236 146 234 156 231" +
	"C163 228 170 223 172 218C174 212 174 204 171 200C169 197 168 196 163 194" +
	"C160 192 159 192 155 191C149 189 145 186 142 182C141 180 141 178 140 167" +
	"C138 149 137 128 138 119C139 107 141 102 146 101C149 100 153 102 158 106" +
	"C159 107 160 108 161 109C162 109 163 110 163 111C164 112 165 112 165 113" +
	"C166 113 167 114 168 115C171 117 177 120 182 121C188 123 197 123 203 121" +
	"C209 119 217 115 222 112C223 111 227 108 227 107C229 105 231 103 232 102" +
	"C232 101 233 99 234 99C236 96 238 90 239 86C241 78 241 68 239 61C238 58 236 52 235 51" +
	"C231 44 225 38 219 35C219 34 217 33 217 33C208 28 192 27 180 31C177 32 171 36 168 38" +
	"C167 39 166 40 166 41C165 41 164 42 164 42C164 43 163 44 162 45C161 46 159 47 159 48" +
	"C158 49 157 51 156 52C155 53 154 54 153 55C149 59 146 60 142 58C140 57 139 54 139 47" +
	"C137 34 135 31 129 29C127 29 122 28 120 29Z";

function draculaPaletteColor(name, fallback)
{
	var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return v || fallback;
}

function draculaSetFavicon()
{
	var tile = draculaPaletteColor("--dracula-bg", "#282A36");
	var ink = draculaPaletteColor("--dracula-purple", "#BD93F9");
	var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'>" +
		"<rect width='256' height='256' rx='56' fill='" + tile + "'/>" +
		"<path d='" + draculaLetterR + "' fill='" + ink + "'/></svg>";

	// Every one, or the browser is free to keep choosing an old one.
	var old = document.querySelectorAll("link[rel*='icon' i]");
	for(var i = 0; i < old.length; i++)
		old[i].parentNode.removeChild(old[i]);

	var href = "data:image/svg+xml," + encodeURIComponent(svg);

	var link = document.createElement("link");
	link.rel = "icon";
	link.type = "image/svg+xml";
	link.href = href;
	document.head.appendChild(link);

	// Safari does not read SVG favicons, and with upstream's links gone would
	// show nothing, so the same drawing is rasterised once and offered beside
	// it. Declared *after* the SVG on purpose: a browser that understands both
	// takes the vector and stays sharp at any zoom.
	//
	// A data: URI does not taint the canvas, so toDataURL is allowed here. The
	// whole thing is wrapped because a failure to rasterise must not cost the
	// icon that already works.
	try
	{
		var size = 64;
		var canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		var img = new Image();
		img.onload = function()
		{
			try
			{
				canvas.getContext("2d").drawImage(img, 0, 0, size, size);
				var png = document.createElement("link");
				png.rel = "icon";
				png.type = "image/png";
				png.sizes = size + "x" + size;
				png.href = canvas.toDataURL("image/png");
				document.head.appendChild(png);
			}
			catch(e) { /* the vector is already installed; nothing to repair */ }
		};
		img.src = href;
	}
	catch(e) { /* same */ }
}

/* A label with no picture of its own and a tracker with no favicon both draw
   nothing, for the same reason: tracklabels points those rows at
   `plugins/tracklabels/action.php?label=…` or `?tracker=…`, and with nothing to
   serve that endpoint answers 200 with a 16x16 PNG whose every pixel has alpha
   0. Nothing fails, so nothing in the DOM says the row is empty — the only way
   to know is to look at the pixels.

   Which is what this does: load the image once per URL, draw it, and ask whether
   any pixel is opaque. A row that paints nothing is marked, and plugins.css puts
   the theme's own glyph there. A CSS fallback layered underneath cannot do it:
   `::part(icon)::before` parses and paints, but a pseudo-element is painted
   after its originating element's background, so it covers the favicon rather
   than sitting behind it. */
var draculaIconInk = {};

function draculaIconKind(value)
{
	if(!value || value.indexOf("tracklabels/action.php?") < 0)
		return null;
	if(value.indexOf("?label=") >= 0)
		return "label";
	if(value.indexOf("?tracker=") >= 0)
		return "tracker";
	return null;
}

function draculaProbeIcon(url)
{
	draculaIconInk[url] = "pending";
	var img = new Image();
	img.onload = function()
	{
		var blank = true;
		try
		{
			var canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth || 16;
			canvas.height = img.naturalHeight || 16;
			var context = canvas.getContext("2d");
			context.drawImage(img, 0, 0);
			var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
			for(var i = 3; i < data.length; i += 4)
			{
				if(data[i] !== 0)
				{
					blank = false;
					break;
				}
			}
		}
		catch(e)
		{
			// Never call a row empty because the probe itself failed; leaving the
			// plugin's own image alone is the safe answer.
			blank = false;
		}
		draculaIconInk[url] = blank ? "blank" : "inked";
		draculaSweepIcons();
	};
	img.onerror = function() { draculaIconInk[url] = "inked"; };
	img.src = url;
}

function draculaMarkIcon(label)
{
	var value = label.getAttribute("icon") || "";
	var kind = draculaIconKind(value);
	if(!kind)
	{
		label.removeAttribute("data-dracula-blank");
		return;
	}
	var url = value.slice(4);
	var state = draculaIconInk[url];
	if(state === undefined)
	{
		draculaProbeIcon(url);
		return;
	}
	if(state === "blank")
		label.setAttribute("data-dracula-blank", kind);
	else if(state === "inked")
		label.removeAttribute("data-dracula-blank");
}

function draculaSweepIcons()
{
	var rows = document.querySelectorAll("panel-label[icon^='url:']");
	Array.prototype.forEach.call(rows, draculaMarkIcon);
}

/* The panels are rebuilt as labels and trackers come and go, and a row can keep
   its element while its icon attribute changes. Watching `icon` alone is also
   what keeps this from looping: the sweep writes data-dracula-blank, which the
   filter ignores. */
function draculaWatchCategoryIcons()
{
	var list = document.getElementById("CatList");
	if(!list)
		return;
	draculaSweepIcons();
	new MutationObserver(draculaSweepIcons).observe(list, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["icon"]
	});
}

/* Every line of the log is a span.std carrying "[stamp] message" as one text
   node (`log()` in js/common.js), and log_history writes its "restored log"
   separators the same way. CSS cannot reach inside a text node, so the stamp
   gets an element of its own and the separators get a class; style.css decides
   the colours.

   Only a span holding exactly one text node is touched: `logHTML()` puts real
   markup in there, and rewriting that would throw the markup away. */
function draculaMarkLogEntry(node)
{
	if(!node || node.nodeType !== 1 || node.dataset.draculaLog)
		return;
	if(node.childNodes.length !== 1 || node.firstChild.nodeType !== 3)
		return;
	node.dataset.draculaLog = "1";

	var text = node.textContent;
	if(/^={3,}.*={3,}$/.test(text.trim()))
	{
		node.classList.add("dracula-log-rule");
		return;
	}

	var parts = /^(\[[^\]]*\])([\s\S]*)$/.exec(text);
	if(!parts)
		return;
	var stamp = document.createElement("span");
	stamp.className = "dracula-log-time";
	stamp.textContent = parts[1];
	node.textContent = "";
	node.appendChild(stamp);
	node.appendChild(document.createTextNode(parts[2]));
}

/* log_history replays the saved log by detaching every node and appending it
   again, so the observer sees old entries a second time. The data attribute
   keeps that from re-splitting a stamp that already has its own element. */
function draculaWatchLog()
{
	var lcont = document.getElementById("lcont");
	if(!lcont)
		return;
	Array.prototype.forEach.call(lcont.children, draculaMarkLogEntry);
	new MutationObserver(function(records)
	{
		records.forEach(function(record)
		{
			Array.prototype.forEach.call(record.addedNodes, draculaMarkLogEntry);
		});
	}).observe(lcont, { childList: true });
}

/* Firefox reserves the torrent list's vertical scrollbar column and paints
   nothing in it on a first load: the list scrolls, 12px are taken out of the
   content, and no bar is drawn. A style recalculation creates it — switching
   the theme by hand and back is what makes it appear. Hiding and showing the
   scroller forces that recalculation without touching anything else; the rows
   do not flicker, because this runs before the list is on screen for long.

   Chrome draws the bar without any of this, and the toggle costs it one
   reflow. */
function draculaNudgeListScrollbar()
{
	var body = document.querySelector("#List div.stable-body");
	if(!body || body.scrollHeight <= body.clientHeight)
		return false;
	body.style.display = "none";
	void body.offsetHeight;
	body.style.display = "";
	return true;
}

/* Torrents arrive from the server well after allDone, so at install time there
   is nothing to overflow yet. Wait for the first list tall enough to need a bar
   and nudge once; 60 tries at half a second cover a slow first load, and a list
   that still fits its pane after that never needed one. */
function draculaWatchListScrollbar(tries)
{
	if(draculaNudgeListScrollbar() || tries > 60)
		return;
	setTimeout(function()
	{
		draculaWatchListScrollbar(tries + 1);
	}, 500);
}

plugin.draculaAllDone = plugin.allDone;
plugin.allDone = function()
{
	plugin.draculaAllDone.call(this);
	draculaWatchListScrollbar(0);

	// Once for what exists, then again whenever a plugin adds a button or a tab:
	// several arrive after allDone, each bringing its own focus handler.
	draculaRestoreKeyboardFocus();
	draculaWatchLoadingIndicator();
	draculaSetFavicon();
	draculaWatchLog();
	draculaWatchCategoryIcons();
	var toolbar = document.getElementById("t");
	var tabbar = document.getElementById("tabbar");

	// Two of the five regions. The toolbar is a mixed row of links, a search
	// field and a select; the tab bar is a plain row of links whose stop starts
	// on whichever tab is open.
	var toolbarItems = "a.nav-link, input, select, button";
	var tabItems = "li.nav-item > a";
	if(toolbar)
	{
		toolbar.setAttribute("role", "toolbar");
		toolbar.setAttribute("aria-label", "Main toolbar");
		draculaRovingGroup(toolbar, toolbarItems);
	}
	if(tabbar)
	{
		draculaSyncTabRoles();
		draculaRovingGroup(tabbar, tabItems, { preferred: function(items)
		{
			return items.filter(function(el)
			{
				return el.parentElement.classList.contains("selected");
			})[0];
		}});
	}

	// The third region. The stop starts on whichever filter is already active,
	// so arriving by Tab puts you where the list currently is.
	var catlist = document.querySelector("category-list");
	var catItems = "panel-label, input.Button";
	if(catlist)
	{
		draculaSyncSidebarRoles();
		draculaRovingGroup(catlist, catItems, {
			preferred: function(items)
			{
				return items.filter(function(el){ return el.hasAttribute("selected"); })[0];
			},
			activate: function(el, ev)
			{
				if(el.tagName === "PANEL-LABEL")
					draculaLabelActivate(el, ev);
				else
					el.click();
			}
		});
	}

	draculaTorrentListKeys();

	var refreshRegions = function()
	{
		draculaRestoreKeyboardFocus();
		if(toolbar) draculaRovingSync(toolbar, toolbarItems);
		if(tabbar)
		{
			draculaSyncTabRoles();
			draculaRovingSync(tabbar, tabItems);
		}
		if(catlist)
		{
			draculaSyncSidebarRoles();
			draculaRovingSync(catlist, catItems);
		}
	};

	// Plugins add buttons and tabs after allDone, and ruTorrent moves the
	// `selected` class as tabs are switched, so the class is watched alongside
	// the child lists.
	var focusObserver = new MutationObserver(refreshRegions);
	if(toolbar) focusObserver.observe(toolbar, { childList: true, subtree: true });
	if(tabbar) focusObserver.observe(tabbar,
		{ childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
	// Labels and trackers arrive from the server well after allDone, and the
	// `selected` attribute moves on every filter change; both are mirrored into
	// aria-selected.
	if(catlist) focusObserver.observe(catlist,
		{ childList: true, subtree: true, attributes: true, attributeFilter: ["selected"] });

	/* Disk: Pink when idle, Purple when full — light to deep, every value between
	   in the same family. quotaspace is gone from 5.3.7 and is not called.

	   CPU: Cyan to Purple. Cyan stays at the zero end so an idle machine matches
	   the Cyan icon beside the graph, which is why that colour was chosen; the
	   disk's ramp here would put Pink next to a Cyan icon at idle.

	   Purple at the far end rather than a warm colour, because the ramp is a
	   straight line through RGB and a line between a cool and a warm colour
	   passes through grey: Cyan to Orange gives #C5D1B5 at 50%, a grey-green in
	   a theme with none, where Cyan to Purple gives #A4BEFB and stays cool the
	   whole way. The reading is "how busy", not "how hot".

	   cpuload has no bar to repaint. In 5.3.7 it is a flot graph and these
	   colours arrive as its line colour, which flot fills underneath at partial
	   alpha, so the filled area looks muted next to the value named here. */
	draculaRecolorMeter("diskspace", "meter-disk-value", "#FF79C6", "#BD93F9");
	draculaRecolorMeter("cpuload",   null,               "#8BE9FD", "#BD93F9");

	draculaResharpenCpuGraph();
	draculaWatchPixelRatio();
	draculaWatchVisualViewport();

	var diskPane = document.getElementById("meter-disk-pane");
	var cpuPane = document.getElementById("meter-cpu-pane");
	var portPane = document.getElementById("port-pane");
	var stFd = document.getElementById("st_fd");
	var cells = document.querySelectorAll("#StatusBar > .status-cell");
	var torrentsCell = cells[6];
	var timeCell = cells[cells.length - 1];
	var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

	var updateTooltips = function()
	{
		draculaDiskTooltip(diskPane);
		draculaCpuTooltip(cpuPane);
		draculaConnectionsTooltip(stFd);
		draculaTorrentsTooltip(torrentsCell);
		draculaPortTooltip(portPane);
		if(timeCell)
			timeCell.title = "Local Time: " + tz;
	};

	// The disk and CPU panes have their titles rewritten by their plugins, so
	// those two are watched and re-applied; the rest are set once the bar has
	// filled in.
	var observer = new MutationObserver(updateTooltips);
	if(diskPane) observer.observe(diskPane, { attributes: true, attributeFilter: ["title"] });
	if(cpuPane) observer.observe(cpuPane, { attributes: true, attributeFilter: ["title"] });
	setTimeout(updateTooltips, 2000);

	draculaFlipConnectionValues(stFd);
	draculaSpeedClickOpensMenu(document.getElementById("st_up"));
	draculaSpeedClickOpensMenu(document.getElementById("st_down"));
	draculaStatusBarKeys();
	draculaWatchContextMenu();
	draculaFillKeyHelp();
	draculaFixToolbarSeparators();
	draculaWatchSearchSource();
	draculaFixHiddenToolbarHeight();
	draculaTorrentActionKeys();
	draculaStatusOverride();
	draculaCheckVersions();
}

// Keys for the five common torrent actions. Upstream binds three in total
// (`stable.js:809` — Delete, Ctrl-A, Ctrl-Z), leaving Start, Pause, Stop,
// Reannounce and Force recheck mouse-only.
//
// Bare letters, Ctrl not being the theme's to spend: Ctrl-P is Settings
// (`webui.js:280`), Ctrl-O is Add Torrent, Ctrl-F is search, and Ctrl-S, Ctrl-R
// and Ctrl-T are the browser's — the mnemonic letters are exactly the
// unavailable ones. Unmodified they are free, every letter case in upstream's
// global handler being guarded by `metaKey`.
//
// This is the shape Delete has — live everywhere, held off while you type —
// which `stable.js:812` guards with `!e.fromTextCtrl` and
// `!theDialogManager.isModalState()`. `fromTextCtrl` is jQuery's, added by the
// patched `$.event.fix` at `common.js:81` for `input`, `textarea` and `a`; a
// native listener never sees it, so the test is written out in
// draculaTypingInto.
//
// It is written out slightly wider: `select` and contenteditable are added
// because these keys are *letters*. Delete does nothing in a `<select>`, but `s`
// jumps it to the first option starting with s — and would start the torrents
// at the same time.
//
// The third element is the whole help line, not a prefix, because Reannounce
// cannot take the shared ending: "Update trackers the selected torrents" is not
// a sentence. Recheck stays last so the destructive one is at the bottom.
var draculaTorrentActions = [
	["s", "start",         "Start the selected torrents"],
	["p", "pause",         "Pause the selected torrents"],
	["t", "stop",          "Stop the selected torrents"],
	["u", "updateTracker", "Reannounce to the trackers"],
	["r", "recheck",       "Force recheck the selected torrents"]
];

function draculaTypingInto(target)
{
	if(!target || !target.tagName)
		return false;
	if(target.isContentEditable)
		return true;
	return /^(INPUT|TEXTAREA|SELECT|A)$/.test(target.tagName);
}

function draculaRunTorrentAction(action)
{
	var table = window.theWebUI && theWebUI.getTable ? theWebUI.getTable("trt") : null;
	var count = table ? table.selCount : 0;
	if(!count || typeof theWebUI[action] !== "function")
		return false;

	// Recheck cannot be taken back: `webui.js:1570` is a bare
	// `perform("recheck")` with no confirmation of its own, and on a large torrent
	// the rehash starts at once. One is a fair mistake to make, a whole selection
	// is not, so past one it asks first — through upstream's own helper, so the
	// dialog is the one the rest of the product uses.
	if(action === "recheck" && count > 1 && typeof window.askYesNo === "function")
	{
		askYesNo("Force recheck",
			"Recheck " + count + " torrents? Rehashing cannot be stopped.",
			function() { theWebUI.recheck(); });
		return true;
	}

	theWebUI[action]();
	return true;
}

function draculaTorrentActionKeys()
{
	document.addEventListener("keydown", function(ev)
	{
		if(ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey || ev.repeat)
			return;
		if(draculaTypingInto(ev.target))
			return;
		if(window.theDialogManager && theDialogManager.isModalState())
			return;

		var key = String(ev.key).toLowerCase();
		for(var i = 0; i < draculaTorrentActions.length; i++)
		{
			if(draculaTorrentActions[i][0] !== key)
				continue;
			if(draculaRunTorrentAction(draculaTorrentActions[i][1]))
				ev.preventDefault();
			return;
		}
	});
}

// `getStatusIcon` (`webui.js:1793`) returns [iconName, word] and is the only
// place either is chosen, so both halves are corrected in one wrap.
//
// The icon name is only ever used as a CSS class — no caller across `js/` or
// `plugins/` branches on it — so new names are safe. The word is not so free:
// `scheduler/init.js:57` compares it against theUILang.Seeding and
// theUILang.Downloading to decide what to restart after a schedule change, so
// those two are left exactly as upstream wrote them.
//
// rTorrent raises one error bit for unrelated things and only the text tells
// them apart: "Tracker: [network error: ETIMEDOUT]" and "Tracker: [No DHT nodes
// available for peer search.]" say nothing about the data, yet look exactly like
// a torrent whose files have gone.
//
// An allowlist of the benign, not a blocklist of the dangerous, and deliberately
// so: a blocklist would let an unfamiliar phrasing pass quietly as a nuisance
// and dress a real loss in orange. An allowlist errs towards alarm.
function draculaMinorError(torrent)
{
	// The third source of the flag, and the one nothing in `state` or `msg`
	// distinguishes: rutracker_check sets it for a release it believes was taken
	// down (`rutracker_check/init.js:41`). The data is fine; the verdict is a page
	// parser's guess. chkstate arrives as a string, so this compares loosely,
	// exactly as the plugin does.
	// eslint-disable-next-line eqeqeq
	if(torrent.chkstate == 4)
		return true;
	return /^Tracker:/.test(torrent.msg || "");
}

function draculaErrorIcon(icon)
{
	return icon === "Status_Error" || icon === "Status_Error_Up" ||
		icon === "Status_Error_Down";
}

// Mirrors the one path through upstream's getStatusIcon that leaves both halves
// empty (`webui.js:1797-1822`): not checking, not hashing, not started. Reads
// the bits rather than the icon name, because by the time this is asked the
// error branch may already have overwritten the name.
function draculaStoppedTorrent(torrent)
{
	return !(torrent.state &
		(dStatus.started | dStatus.checking | dStatus.hashing));
}

// Installed from allDone rather than at file scope, and that is load-bearing:
// rutracker_check wraps getStatusIcon at its own file scope
// (`rutracker_check/init.js:60`) and returns early for chkstate 4 without
// calling through, so a file-scope wrap here would sit underneath it and never
// see that torrent. allDone runs after every plugin has loaded, which puts this
// wrap outermost.
function draculaStatusOverride()
{
	if(!window.theWebUI || typeof theWebUI.getStatusIcon !== "function")
		return;

	plugin.draculaStatusIcon = theWebUI.getStatusIcon;
	theWebUI.getStatusIcon = function(torrent)
	{
		var pair = plugin.draculaStatusIcon.call(this, torrent);
		var icon = pair[0];
		var status = pair[1];

		if(draculaErrorIcon(icon) && draculaMinorError(torrent))
			icon = "Status_Warning";

		if(draculaStoppedTorrent(torrent))
		{
			// Upstream has no stopped state: it falls through to Completed or
			// Incompleted *by percentage*, so one keypress earns a green tick
			// reading "Finished" on one row and an alarm on the next, neither
			// saying "this is not running".
			//
			// Both are stopped, and which of them finished is what the Progress
			// column is for, so the word is the same for both. Only the two
			// upstream writes here are replaced; anything a plugin substituted
			// (rutracker_check's "Probably deleted") is left to speak.
			if(status === theUILang.Finished || status === theUILang.Stopped)
				status = "Stopped";
			// A real error outranks it: a stopped torrent whose data is in
			// trouble keeps the red cross. A benign complaint about something
			// that is not running is stale news.
			if(!draculaErrorIcon(icon))
				icon = "Status_Stopped";
		}
		else if(status === theUILang.Pausing)
			status = "Paused";	// a state, not something in progress

		return [icon, status];
	};
}

// F4 hides the toolbar, and one branch in `theWebUI.resize` (`webui.js:2288`)
// then pushes the status bar off the bottom of the screen, where nothing can
// reach it — `html` and `body` are both `overflow: hidden`:
//
//     if ($("#t").css("display") === "none")
//         $("#maincont").height($(window).height() - 30);  // 25 bar + 5 margin
//
// Only the toolbar toggle reaches that branch; F6 and F7 never change `#t`, so
// `#maincont` keeps `height: ""` and the flex layout does the arithmetic. The 30
// describes a status bar this theme does not have — this one is 32px with a 5px
// top margin, 37 in all — so the bar ends up 7px short of the window.
//
// The correction measures the bar instead of naming a number, so changing the
// bar's padding cannot make it stale. `resizeTop` is re-run afterwards because
// the split is a fraction of the height just corrected, and it is called with
// upstream's own setting rather than a copy of its formula.
function draculaMainContentHeight()
{
	var toolbar = document.getElementById("t");
	var bar = document.getElementById("StatusBar");
	var main = document.getElementById("maincont");
	if(!toolbar || !bar || !main || getComputedStyle(toolbar).display !== "none")
		return;

	var barStyle = getComputedStyle(bar);
	var reserved = bar.getBoundingClientRect().height +
		parseFloat(barStyle.marginTop) + parseFloat(barStyle.marginBottom) +
		parseFloat(getComputedStyle(main).marginTop);

	main.style.height = Math.max(0, window.innerHeight - reserved) + "px";
	if(window.theWebUI && typeof theWebUI.resizeTop === "function")
		theWebUI.resizeTop(null,
			main.getBoundingClientRect().height * theWebUI.settings["webui.vsplit"]);
}

function draculaFixHiddenToolbarHeight()
{
	if(!window.theWebUI || typeof theWebUI.resize !== "function")
		return;
	var resize = theWebUI.resize;
	theWebUI.resize = function()
	{
		var result = resize.apply(this, arguments);
		draculaMainContentHeight();
		return result;
	};
	// Upstream registers its own `resize` as a window listener at startup
	// (`webui.js:240`), capturing the function rather than the property, so
	// wrapping the property alone leaves every window resize wrong. This listener
	// is added after upstream's and therefore runs after it.
	window.addEventListener("resize", draculaMainContentHeight);
	window.addEventListener("orientationchange", draculaMainContentHeight);
	draculaMainContentHeight();
}

// Column headings and default widths, applied in the dxSTable.create hook at
// the bottom of this file.
//
// Headings: the Files tab ships "%", a bare symbol that says nothing next to
// Size, Done and Priority, and the torrent list calls its progress bar "Done"
// while the Files tab uses that word for a byte count. Both are the same
// TYPE_PROGRESS column, so both read "Progress".
//
// Widths are measured against real rows: at upstream's defaults "754.00 MiB"
// overflows Size, "0 (667)" overflows Seeds by 11px, and a full
// "01.03.2026 15:46:30" overflows Created On by 44px.
var draculaColumns = {
	fls: { percent: { text: "Progress" } },
	trt: {
		done:       { text: "Progress", width: "120px" },
		size:       { width: "100px" },
		// Speeds carry a unit and a "/s": "888.3 KiB/s" is 73px and a gigabit
		// line reaches "1023.99 MiB/s" at 92px, against the 56px that 70px of
		// column leaves for text — even "0.0 KiB/s" did not fit.
		dl:         { width: "110px" },
		ul:         { width: "110px" },
		// "5m 47s" is 47px and "999d 23h" is 59px, against 46px of room
		eta:        { width: "80px" },
		// Both print "connected (total)", so they size together: "12 (1234)" is
		// 61px. Upstream marks them ALIGN_RIGHT, but the bracketed pair is a
		// composite rather than a magnitude, and right-aligning lines up the
		// closing bracket instead of the number that matters.
		peers:      { width: "80px", align: ALIGN_LEFT },
		seeds:      { width: "80px", align: ALIGN_LEFT },
		// A byte column has to hold "1023.99 GiB" (77px) and, for these two, a
		// header wider still ("Downloaded" is 78px). 14px of that goes to
		// padding, so 100px leaves 8px of slack before either touches the
		// column edge.
		downloaded: { width: "115px" },
		uploaded:   { width: "115px" },
		remaining:  { width: "105px" },
		name:    { width: "260px" },
		status:  { width: "115px" },
		ratio:   { width: "70px" },
		// Timestamps are TYPE_NUMBER, so dxSTable right-aligns them like a
		// magnitude. A date is read left to right and nearly fills its column,
		// which floats the short heading far right of where the value starts.
		// ALIGN_LEFT moves heading and cells together.
		created: { width: "160px", align: ALIGN_LEFT },
		// "Added" next to "Created On" reads as a different kind of value;
		// they are the same kind, so they are named the same way
		addtime: { text: "Added On", width: "160px", align: ALIGN_LEFT },
		tracker: { width: "140px" }
	}
};

// Speed and Trafic graphs both hardcode their series colors (#1C8DFF blue,
// #009900 green, and two darker variants for the previous period), none of them
// in the palette. Download takes the cyan and upload the green the theme uses
// for those directions in the status bar and the row icons; the previous-period
// series take the same hues mixed 45% over the background (#558090, #3A8855) so
// they read as the same measurement, further back.
//
// Hooked on the rGraph base rather than the two subclasses: both set
// this.datasets and only then call super.create(), so by the time this runs the
// datasets exist and the plot is built. Redrawing re-reads the options getter,
// which is what carries the new colors onto the canvas.
if(typeof rGraph !== "undefined")
{
	var draculaSeriesColors = {
		speedgraph_dl: "#8BE9FD",
		speedgraph_ul: "#50FA7B",
		trafic_downloaded: "#8BE9FD",
		trafic_uploaded: "#50FA7B",
		trafic_downloaded_old: "#558090",
		trafic_uploaded_old: "#3A8855"
	};

	// The Trafic graph builds its previous-period series by spreading the current
	// ones — `{...this.down, label: "trafic_downloaded_old"}` — which copies
	// labelTranslation too, so the legend lists "Downloaded" and "Uploaded" twice
	// with no way to tell which bar is which. The split is current period against
	// earlier: in "Per day" the bright series is today, the muted one before it.
	var draculaSeriesLabels = {
		trafic_downloaded_old: "Downloaded (earlier)",
		trafic_uploaded_old: "Uploaded (earlier)"
	};

	plugin.draculaGraphCreate = rGraph.prototype.create;
	rGraph.prototype.create = function(aOwner, webuiView)
	{
		plugin.draculaGraphCreate.call(this, aOwner, webuiView);
		var changed = false;
		for(var i = 0; i < this.datasets.length; i++)
		{
			var d = this.datasets[i];
			var c = draculaSeriesColors[d.label];
			if(c)
			{
				d.color = c;
				changed = true;
			}
			var t = draculaSeriesLabels[d.label];
			if(t)
			{
				d.labelTranslation = t;
				// create() has already copied the old text into the static map
				rGraph.legendLabelTranslations[d.label] = t;
				changed = true;
			}
		}
		if(changed)
			this.draw(true);
	}
}

// The seedingtime plugin renames its columns after the table exists, retrying
// on a timer until every plugin has loaded, so a heading set at create time is
// overwritten a second later. Intercepting the rename keeps the list above
// authoritative no matter who renames a column or when.
plugin.draculaRenameColumn = dxSTable.prototype.renameColumnById;
dxSTable.prototype.renameColumnById = function(id, name)
{
	var patch = draculaColumns[this.prefix];
	if(patch && patch[id] && patch[id].text)
		name = patch[id].text;
	return plugin.draculaRenameColumn.call(this, id, name);
}

// Applied from the create hook rather than at load time: `styles` is the
// table's own columns array, and by then every plugin has pushed the columns it
// adds — AddTime and Tracker among them, which a load-time patch misses because
// those plugins run after this file.
//
// A width the profile already carries is the user's own resizing and outranks a
// default. This is the same test config() uses when it applies saved widths over
// the definitions.
function draculaHasSavedWidth(saved, index)
{
	return !!(saved && index < saved.length && saved[index] > 4);
}

function draculaPatchColumns(styles, aName)
{
	var patch = draculaColumns[aName];
	if(!patch || !styles)
		return;
	var saved = theWebUI.settings["webui." + aName + ".colwidth"];
	for(var i = 0; i < styles.length; i++)
	{
		var col = patch[styles[i].id];
		if(!col)
			continue;
		if(col.text)
			styles[i].text = col.text;
		if(col.align)
			styles[i].align = col.align;
		if(col.width && !draculaHasSavedWidth(saved, i))
			styles[i].width = col.width;
	}
}

plugin.draculaTableCreate = dxSTable.prototype.create;
dxSTable.prototype.create = function(ele, styles, aName)
{
	draculaPatchColumns(styles, aName);
	plugin.draculaTableCreate.call(this, ele, styles, aName);

	// Torrent progress bar: Purple → Green gradient, each mixed 35% over the
	// background (#282A36). The bar is a large fill spanning most of the cell with
	// the percentage printed on top, so the accent colors at full strength put that
	// text at 1.3:1. Mixed down, the same hues read as purple and green while the
	// label clears 5.3:1 at every fill level, needing no outline.
	// #5C4F7A = 35% #BD93F9, #36734E = 35% #50FA7B.
	this.prgStartColor = new RGBackground("#5C4F7A");
	this.prgEndColor = new RGBackground("#36734E");
}
