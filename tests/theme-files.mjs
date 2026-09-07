// Reading and parsing shared by the structural checks. Not tests: the suites
// beside this file assert things the theme's own rules require but nothing else
// enforces, and each of them needs the shipped text and the same few parsers.
//
// The parsers are deliberately narrow. A general "dead code" sweep over CSS
// custom properties cannot be done by pattern alone: `var(NAME)` with a closing
// paren misses `var(NAME, fallback)`, which is how upstream writes it; a grep
// pattern beginning with `--` is read as an option and reports a confident zero;
// and upstream splits one var() across four lines, which no single-line pattern
// sees.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const THEME = join(ROOT, "Dracula");

// Read from the directory rather than listed by hand: a sheet named in no list
// is checked by nothing. It also guards the one list that cannot be read this
// way — `extra-files` in release-please-config.json. A sheet missing from that
// keeps the version it was added under, and the header comparison in
// version.test.mjs fails at the next release rather than shipping.
export const SHEETS = readdirSync(THEME)
	.filter((name) => name.endsWith(".css"))
	.sort();
export const FILES = [...SHEETS, "init.js"];

export const read = (name) => readFileSync(join(THEME, name), "utf8");
export const css = SHEETS.map((name) => ({ name, text: read(name) }));

export const VERSION_HEADER = /^\s*\*\s*Version\s+(\d+\.\d+\.\d+)\b/m;

// The prose in these sheets quotes @import statements and colours, so a match
// inside a comment would be checked as though it were code.
export const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");

// Scoped to the three namespaces the theme both defines and consumes. Names
// outside them (--row-odd-bg-color, --status-image, --menu-*, every --bs-*) are
// somebody else's contract: the theme supplies values and upstream's own sheets
// read them, so "unused here" says nothing about them.
export const OWNED = /^--(?:dracula|alucard|functional|variant|font|icon)-/;

export function definitions(text) {
	const found = new Set();
	// A definition follows the start of a line, a `{` or a `;`.
	for (const m of text.matchAll(/(?:^|[{;])\s*(--[a-zA-Z0-9-]+)\s*:/gm))
		found.add(m[1]);
	// `@property` defines a name too, and carries its initial value in the block
	// rather than after a colon, so the pattern above cannot see it.
	for (const m of text.matchAll(/@property\s+(--[a-zA-Z0-9-]+)/g))
		found.add(m[1]);
	return found;
}

export function references(text) {
	const found = new Set();
	// `\s*` after `var(` is load-bearing: upstream and this theme both wrap
	// long var() calls across lines, and the name can start on the next one.
	for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) found.add(m[1]);
	return found;
}

// Follows the @import URLs from a set of entry sheets, so a sheet added to one
// interface's entry point and forgotten at the other is found by a test rather
// than by a reader's phone.
export function reachableFrom(entries) {
	const seen = new Set();
	for (const queue = [...entries]; queue.length;) {
		const name = queue.shift();
		if (seen.has(name)) continue;
		seen.add(name);
		const text = withoutComments(read(name));
		for (const m of text.matchAll(/@import\s+url\("([^"?]+)/g))
			queue.push(m[1]);
	}
	return [...seen];
}

// The selectors one sheet styles. The pattern takes everything before a `{`, so
// an at-rule prelude and a declaration split across lines reach it too, and
// neither of those is a selector.
function* selectorsIn(text) {
	for (const m of withoutComments(text).matchAll(
		/(?:^|[}\n])\s*([^{}@\n][^{}]*?)\s*\{/g,
	)) {
		const sel = m[1].replace(/\s+/g, " ").trim();
		if (sel && !sel.startsWith("@") && !sel.includes(";")) yield sel;
	}
}

// Every selector in the sheets, mapped to the sheets that style it.
export function selectorOwners() {
	const seen = new Map();
	for (const { name, text } of css)
		for (const sel of selectorsIn(text)) {
			if (!seen.has(sel)) seen.set(sel, new Set());
			seen.get(sel).add(name);
		}
	return seen;
}

export const paletteText = css.find(({ name }) => name === "palette.css").text;

export const paletteHex = new Map(
	[...paletteText.matchAll(/(--[a-z]+-[a-z-]+)\s*:\s*#([0-9a-fA-F]{6})/g)].map(
		([, name, hex]) => [name, hex.toLowerCase()],
	),
);
