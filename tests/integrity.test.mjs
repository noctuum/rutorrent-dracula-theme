// Structural checks on the shipped files. Not unit tests: they read the
// files as text and assert things the theme's own rules require but nothing
// else enforces — names the theme owns end to end, the version it writes in
// nineteen places, and the SVGs it encodes by hand.
//
// Scope is deliberately narrow. A general "dead code" sweep over CSS custom
// properties cannot be done by pattern alone: `var(NAME)` with a closing paren
// misses `var(NAME, fallback)`, which is how upstream writes it; a grep pattern
// beginning with `--` is read as an option and reports a confident zero; and
// upstream splits one var() across four lines, which no single-line pattern
// sees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEME = join(ROOT, "Dracula");
const SHEETS = [
	"style.css",
	"stable.css",
	"plugins.css",
	"palette.css",
	"fonts.css",
	"icons.css",
	"mobile.css",
];
const FILES = [...SHEETS, "init.js"];

const read = (name) => readFileSync(join(THEME, name), "utf8");
const css = SHEETS.map((name) => ({ name, text: read(name) }));

// --- 1. One version, written in nineteen places ----------------------------
//
// Each of the eight files carries a human-readable "Version X.Y.Z" line in its
// header, the three sheets ruTorrent loads each stamp a machine-readable custom
// property, init.js carries the constant it compares them against at runtime,
// and the seven @import URLs carry it as their cache-buster. All of them have to
// agree, or the startup check cries wolf at the user and an edited sheet is
// served from cache.
//
// The four imported sheets — palette.css, fonts.css, icons.css and mobile.css —
// stamp no custom property: they are fetched under the version in the URL that
// imports them, so they cannot go stale on their own — see the header of
// palette.css.

const VERSION_HEADER = /^\s*\*\s*Version\s+(\d+\.\d+\.\d+)\b/m;

test("every shipped file states its version in its header", () => {
	for (const name of FILES) {
		const m = read(name).match(VERSION_HEADER);
		assert.ok(m, `${name} has no "Version X.Y.Z" line in its header`);
	}
});

test("the header version agrees across the shipped files", () => {
	const seen = FILES.map((name) => [name, read(name).match(VERSION_HEADER)[1]]);
	const [, first] = seen[0];
	for (const [name, v] of seen)
		assert.equal(v, first, `${name} says ${v}, ${seen[0][0]} says ${first}`);
});

test("the machine-readable stamps agree with the headers", () => {
	const declared = read("init.js").match(/DRACULA_VERSION\s*=\s*"([^"]+)"/);
	assert.ok(declared, "init.js has no DRACULA_VERSION constant");

	const stamps = {
		"style.css": /--dracula-version:\s*"([^"]+)"/,
		"stable.css": /--dracula-version-stable:\s*"([^"]+)"/,
		"plugins.css": /--dracula-version-plugins:\s*"([^"]+)"/,
	};
	for (const [name, pattern] of Object.entries(stamps)) {
		const m = read(name).match(pattern);
		assert.ok(m, `${name} does not stamp its version on :root`);
		assert.equal(
			m[1],
			declared[1],
			`${name} stamps ${m[1]} but init.js is ${declared[1]}`,
		);
	}
	assert.equal(
		declared[1],
		read("init.js").match(VERSION_HEADER)[1],
		"init.js header and DRACULA_VERSION disagree",
	);
});

// An @import whose version has stopped moving is the exact failure the URLs
// were given a version to prevent: the importing sheet arrives new, names the
// old palette, and the browser answers from cache. Nothing about the page looks
// broken, so only this test would notice.
test("every @import asks for the version the theme is on", () => {
	const declared = read("init.js").match(/DRACULA_VERSION\s*=\s*"([^"]+)"/)[1];
	let found = 0;
	for (const name of SHEETS) {
		// Comments first: the prose in palette.css discusses these URLs, and a
		// match inside a comment would be checked as though it were code.
		const text = read(name).replace(/\/\*[\s\S]*?\*\//g, "");
		// Every @import, not only the ones already written the right way — a new
		// one added without a version is exactly what this has to catch.
		for (const m of text.matchAll(/@import\s+[^;]*;/g)) {
			found++;
			const statement = m[0].replace(/\s+/g, " ").trim();
			const asked = statement.match(/\?v=([^"')\s]+)/);
			assert.ok(
				asked,
				`${name}: ${statement} carries no ?v=, so an edit to the imported ` +
					`sheet keeps its URL and the browser answers from cache`,
			);
			assert.equal(
				asked[1],
				declared,
				`${name}: ${statement} asks for ${asked[1]}, the theme is ${declared}`,
			);
		}
	}
	// Exact, not a floor: another import is a decision, and it should cost
	// whoever makes it a look at this test. Seven of them — the palette, the
	// fonts and the icons into style.css, and those three plus the mobile rules
	// into plugins.css, which is the only sheet the mobile plugin's UI ever
	// loads. The first three are named twice on purpose: same URLs, fetched
	// once, and the desktop would otherwise wait for config time to get them.
	assert.equal(
		found,
		7,
		`expected 7 @imports across the sheets, found ${found}`,
	);
});

// The imports are the only way palette.css, fonts.css, icons.css and mobile.css
// reach a page: nothing links them, and the mobile UI loads no sheet of the
// theme's but plugins.css. Losing one costs the colours, the typeface or the
// icons everywhere at once, and nothing else in this suite would notice.
test("the sheets that carry the imports still carry them", () => {
	const carries = (sheet, target) =>
		assert.match(
			read(sheet),
			new RegExp(`@import\\s+url\\("${target.replace(".", "\\.")}`),
			`${sheet} no longer imports ${target}`,
		);
	for (const target of ["palette.css", "fonts.css", "icons.css"])
		carries("style.css", target);
	for (const target of ["palette.css", "fonts.css", "icons.css", "mobile.css"])
		carries("plugins.css", target);
});

// --- 2. Theme-owned custom properties resolve ------------------------------
//
// Scoped to the three namespaces the theme both defines and consumes. Names
// outside them (--row-odd-bg-color, --status-image, --menu-*, every --bs-*) are
// somebody else's contract: the theme supplies values and upstream's own sheets
// read them, so "unused here" says nothing about them.

const OWNED = /^--(?:dracula|font|icon)-/;

function definitions(text) {
	const found = new Set();
	// A definition follows the start of a line, a `{` or a `;`.
	for (const m of text.matchAll(/(?:^|[{;])\s*(--[a-zA-Z0-9-]+)\s*:/gm))
		found.add(m[1]);
	return found;
}

function references(text) {
	const found = new Set();
	// `\s*` after `var(` is load-bearing: upstream and this theme both wrap
	// long var() calls across lines, and the name can start on the next one.
	for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) found.add(m[1]);
	return found;
}

const allDefined = new Set(css.flatMap(({ text }) => [...definitions(text)]));
const allReferenced = new Set(css.flatMap(({ text }) => [...references(text)]));

test("every name the theme owns and references is defined somewhere in it", () => {
	const missing = [...allReferenced].filter(
		(n) => OWNED.test(n) && !allDefined.has(n),
	);
	assert.deepEqual(
		missing,
		[],
		`referenced but never defined: ${missing.join(", ")}`,
	);
});

// --- 2a. …and in a sheet the interface reading it actually loads -------------
//
// The theme is two programs sharing a folder. ruTorrent's desktop loads
// style.css, stable.css and plugins.css; the mobile plugin disables the theme
// plugin (`plugins/mobile/init.js:2138`) and loads plugins.css alone. A name
// defined in a sheet the other interface never fetches resolves to nothing, the
// declaration reading it is dropped, and the page looks merely plain — which is
// why the check above, which pools every sheet, cannot see it.
//
// The reachable set is followed from the @import URLs rather than listed here,
// so a sheet added to one entry point and forgotten at the other fails this
// test instead of a reader's phone.

const ENTRY_POINTS = {
	desktop: ["style.css", "stable.css", "plugins.css"],
	"the mobile plugin": ["plugins.css"],
};

function reachableFrom(entries) {
	const seen = new Set();
	for (const queue = [...entries]; queue.length;) {
		const name = queue.shift();
		if (seen.has(name)) continue;
		seen.add(name);
		// Comments first: the prose in these sheets quotes @import statements.
		const text = read(name).replace(/\/\*[\s\S]*?\*\//g, "");
		for (const m of text.matchAll(/@import\s+url\("([^"?]+)/g))
			queue.push(m[1]);
	}
	return [...seen];
}

test("every name an interface reads is defined in a sheet that interface loads", () => {
	for (const [ui, entries] of Object.entries(ENTRY_POINTS)) {
		const texts = reachableFrom(entries).map(read);
		const defined = new Set(texts.flatMap((t) => [...definitions(t)]));
		const missing = [
			...new Set(texts.flatMap((t) => [...references(t)])),
		].filter((n) => OWNED.test(n) && !defined.has(n));
		assert.deepEqual(
			missing,
			[],
			`${ui} reads but cannot resolve: ${missing.join(", ")}`,
		);
	}
});

// Every exemption below is a name with a reader this repo cannot see, so it has
// to be listed rather than detected. This list cannot be replaced by grepping
// the installed ruTorrent: grep is line-based and upstream wraps one var() call
// across four lines (`css/panel-label.css:72-75`), so a name being absent from
// such a grep proves nothing.
const EXEMPT = new Map([
	// Read by init.js through getComputedStyle at startup, never by CSS.
	["--dracula-version", "read by draculaCheckVersions"],
	["--dracula-version-stable", "read by draculaCheckVersions"],
	["--dracula-version-plugins", "read by draculaCheckVersions"],
	// Upstream's own panel-label contract. The theme supplies the value and
	// `css/panel-label.css` consumes it; nothing here needs to.
	["--icon-letter-background-color", "read by upstream css/panel-label.css:72"],
	["--icon-letter-border-color", "read by upstream css/panel-label.css:76"],
	// The Dracula spec gives Selection and Current Line the same hex, so this
	// name has no reader of its own but belongs to the palette as published.
	["--dracula-selection", "palette record: shares its hex with Current Line"],
]);

test("no name the theme owns is defined and then never used", () => {
	const dead = [...allDefined].filter(
		(n) => OWNED.test(n) && !allReferenced.has(n) && !EXEMPT.has(n),
	);
	assert.deepEqual(dead, [], `defined but never used: ${dead.join(", ")}`);
});

test("the exemption list has not gone stale", () => {
	// An exemption for a name that no longer exists misleads the next reader.
	const gone = [...EXEMPT.keys()].filter((n) => !allDefined.has(n));
	assert.deepEqual(
		gone,
		[],
		`exempted but no longer defined, drop from EXEMPT: ${gone.join(", ")}`,
	);
});

// --- 2b. The decimal copies of palette colours ------------------------------
//
// Bootstrap's utilities take a bare `r, g, b` triple rather than a colour —
// `.text-danger` resolves to `rgba(var(--bs-danger-rgb), var(--bs-text-opacity))`
// — and CSS cannot derive one from a hex custom property. So each triple is a
// second, decimal copy of a colour that palette.css already holds, and nothing
// but this test keeps the two in step when a palette value moves.

const paletteHex = new Map(
	[
		...css
			.find(({ name }) => name === "palette.css")
			.text.matchAll(/(--dracula-[a-z-]+)\s*:\s*#([0-9a-fA-F]{6})/g),
	].map(([, name, hex]) => [name, hex.toLowerCase()]),
);

const asTriple = (hex) =>
	[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

test("every --*-rgb triple still spells out the palette colour it stands for", () => {
	const wrong = [];
	for (const { name, text } of css) {
		for (const m of text.matchAll(
			/(--[a-zA-Z0-9-]+)-rgb\s*:\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*;/g,
		)) {
			const [, base, r, g, b] = m;
			const written = [r, g, b].map(Number).join(", ");
			// Most triples are written directly under the name they belong to,
			// which says exactly which colour they should spell. The nearest one
			// above and not the first in the file: `--bs-primary` is set once for
			// Dark and again for Light, to two different colours, and each block's
			// triple belongs to its own.
			//
			// `--bs-btn-focus-shadow-rgb` has no such partner — Bootstrap exposes
			// only the triple — so all it can be held to is being some colour the
			// palette publishes.
			const beside = [
				...text
					.slice(0, m.index)
					.matchAll(
						new RegExp(
							`${base}\\s*:\\s*var\\(\\s*(--dracula-[a-z-]+)\\s*\\)`,
							"g",
						),
					),
			].pop();
			const candidates = beside ? [beside[1]] : [...paletteHex.keys()];
			if (candidates.some((n) => asTriple(paletteHex.get(n)) === written))
				continue;
			wrong.push(
				beside
					? `${name}: ${base}-rgb is ${written}, but ${beside[1]} is #${paletteHex.get(beside[1])}`
					: `${name}: ${base}-rgb is ${written}, which is no colour in palette.css`,
			);
		}
	}
	assert.deepEqual(wrong, [], `\n${wrong.join("\n")}`);
});

// --- 3. !important does not creep ------------------------------------------
//
// stylelint's declaration-no-important is switched off in stylelint.config.mjs,
// and this replaces it. An override theme genuinely needs !important: it is the
// only thing that outranks the inline styles ruTorrent writes. The useful
// signal is not the count but the count *growing*, where a warning per use is
// just a wall to skim past.
//
// A ratchet, not a limit. Lower these when a use is removed; raising one takes
// an argument in the commit message.
const IMPORTANT_BUDGET = {
	"style.css": 34,
	"stable.css": 2,
	"plugins.css": 1,
	// Two, both Bootstrap's rather than the plugin's and both in one rule: being
	// last of the three sheets outranks every rule the plugin writes, but not a
	// utility class that carries !important on its own declarations. See the
	// filter count's pill, where the utility forces both of them.
	"mobile.css": 2,
	// Declarations only, no selectors to fight over.
	"palette.css": 0,
	"icons.css": 0,
};

// Comments are stripped before counting. Counting the raw text instead makes
// every mention of the word in prose part of the budget, so rewording a comment
// breaks the test and the numbers drift away from the declarations they are
// supposed to track.
const importantUses = (name) =>
	(
		read(name)
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.match(/!important/g) || []
	).length;

test("!important stays inside its audited budget", () => {
	for (const [name, budget] of Object.entries(IMPORTANT_BUDGET)) {
		const found = importantUses(name);
		assert.ok(
			found <= budget,
			`${name} has ${found} uses of !important, budget is ${budget}. ` +
				`Adding one needs a reason; if the reason is good, raise the budget here.`,
		);
	}
});

test("the !important budget is not stale", () => {
	// A budget above the real count stops being a ratchet and silently permits
	// drift back up to it.
	for (const [name, budget] of Object.entries(IMPORTANT_BUDGET)) {
		const found = importantUses(name);
		assert.equal(
			found,
			budget,
			`${name} now has ${found} uses, budget says ${budget} — lower it`,
		);
	}
});

// --- 4. No selector is styled from two sheets by accident -------------------
//
// stylelint's no-duplicate-selectors works inside one file and cannot see
// across sheets. The three sheets are split by area — main, table, plugins — so
// the same selector in two of them is worth a second look every time.
//
// Both entries below are deliberate and each says why at its own rule.
const CROSS_FILE_ALLOWED = new Map([
	[
		":root",
		"each sheet stamps its own version, which is the point of the check in init.js",
	],
	[
		"#StatusBar",
		"background must load after the plugin sheets, layout need not — see the notes at both rules",
	],
]);

test("no selector is styled from two sheets without a reason", () => {
	const seen = new Map();
	for (const { name, text } of css) {
		const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
		for (const m of stripped.matchAll(
			/(?:^|[}\n])\s*([^{}@\n][^{}]*?)\s*\{/g,
		)) {
			const sel = m[1].replace(/\s+/g, " ").trim();
			if (!sel || sel.startsWith("@") || sel.includes(";")) continue;
			if (!seen.has(sel)) seen.set(sel, new Set());
			seen.get(sel).add(name);
		}
	}
	const shared = [...seen]
		.filter(([sel, files]) => files.size > 1 && !CROSS_FILE_ALLOWED.has(sel))
		.map(([sel, files]) => `${sel} in ${[...files].join(" + ")}`);
	assert.deepEqual(
		shared,
		[],
		`styled from more than one sheet: ${shared.join("; ")}`,
	);
});

test("the cross-sheet allowance is not stale", () => {
	const seen = new Map();
	for (const { name, text } of css) {
		const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
		for (const m of stripped.matchAll(
			/(?:^|[}\n])\s*([^{}@\n][^{}]*?)\s*\{/g,
		)) {
			const sel = m[1].replace(/\s+/g, " ").trim();
			if (!sel || sel.startsWith("@") || sel.includes(";")) continue;
			if (!seen.has(sel)) seen.set(sel, new Set());
			seen.get(sel).add(name);
		}
	}
	const pointless = [...CROSS_FILE_ALLOWED.keys()].filter(
		(sel) => !seen.has(sel) || seen.get(sel).size < 2,
	);
	assert.deepEqual(
		pointless,
		[],
		`allowed but no longer shared, drop from CROSS_FILE_ALLOWED: ${pointless.join(", ")}`,
	);
});

// --- 5. The inline SVGs are encoded correctly ------------------------------
//
// There are no image files in this theme; every glyph is a data URI written by
// hand. A raw `#` is the dangerous one: it opens a fragment, so the URL
// truncates there and the icon silently vanishes rather than erroring.

test("every inline SVG data URI decodes to a well-formed svg element", () => {
	let count = 0;
	for (const { name, text } of css) {
		for (const m of text.matchAll(/url\("data:image\/svg\+xml,([^"]*)"\)/g)) {
			count++;
			const raw = m[1];
			assert.ok(
				!raw.includes("#"),
				`${name}: an inline SVG contains a raw # — it must be %23, or the URL truncates there`,
			);
			let decoded;
			assert.doesNotThrow(() => {
				decoded = decodeURIComponent(raw);
			}, `${name}: an inline SVG is not valid percent-encoding`);
			assert.match(
				decoded,
				/^<svg[\s\S]*<\/svg>$/,
				`${name}: a decoded SVG does not open and close with <svg>`,
			);
		}
	}
	// Guards the guard: without it, a pattern that stops matching leaves this
	// test passing by examining nothing at all.
	assert.ok(
		count > 40,
		`only ${count} inline SVGs found — the pattern is probably wrong`,
	);
});
