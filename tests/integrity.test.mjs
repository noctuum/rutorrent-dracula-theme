// Structural checks on the shipped files. Not unit tests: they read the
// files as text and assert things the theme's own rules require but nothing
// else enforces — names the theme owns end to end, the version it writes in
// eight places, and the SVGs it encodes by hand.
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
const SHEETS = ["style.css", "stable.css", "plugins.css"];
const FILES = [...SHEETS, "init.js"];

const read = (name) => readFileSync(join(THEME, name), "utf8");
const css = SHEETS.map((name) => ({ name, text: read(name) }));

// --- 1. One version, written in eight places -------------------------------
//
// Every file carries a human-readable "Version X.Y.Z" line in its header, the
// three sheets each stamp a machine-readable custom property, and init.js
// carries the constant it compares them against at runtime. All eight have to
// agree, or the startup check cries wolf at the user.

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

// --- 2. Theme-owned custom properties resolve ------------------------------
//
// Scoped to the two namespaces the theme both defines and consumes. Names
// outside them (--row-odd-bg-color, --status-image, --menu-*) are upstream's
// contract: the theme supplies values and upstream's own sheets read them, so
// "unused here" says nothing about them.

const OWNED = /^--(?:dracula|icon)-/;

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

test("every --dracula-*/--icon-* the theme references is defined somewhere in it", () => {
	const missing = [...allReferenced].filter(
		(n) => OWNED.test(n) && !allDefined.has(n),
	);
	assert.deepEqual(
		missing,
		[],
		`referenced but never defined: ${missing.join(", ")}`,
	);
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

test("no --dracula-*/--icon-* is defined and then never used", () => {
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
const IMPORTANT_BUDGET = { "style.css": 34, "stable.css": 2, "plugins.css": 1 };

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
