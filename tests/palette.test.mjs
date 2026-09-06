// palette.css is the record of the specification and the only place a colour may
// be written. A hex or an rgb() anywhere else is a copy that has stopped
// following it: change Purple in the palette and the stray stays as it was,
// silently, with nothing on screen looking broken.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	FILES,
	css,
	paletteHex,
	paletteText,
	read,
	withoutComments,
} from "./theme-files.mjs";
import { SPEC, SPEC_COMMIT } from "./dracula-spec.mjs";

// --- The decimal copies of palette colours ----------------------------------
//
// Bootstrap's utilities take a bare `r, g, b` triple rather than a colour —
// `.text-danger` resolves to `rgba(var(--bs-danger-rgb), var(--bs-text-opacity))`
// — and CSS cannot derive one from a hex custom property. So each triple is a
// second, decimal copy of a colour that palette.css already holds, and nothing
// but this test keeps the two in step when a palette value moves.

const asTriple = (hex) =>
	[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

// The pairing is by name: `--alucard-rgb-red` answers to `--alucard-red` and to
// nothing else. `rgb` sits next to the namespace so the eye groups the copies
// together rather than reading to the end of each name.
test("every --*-rgb-* triple still spells out the palette colour it stands for", () => {
	const wrong = [];
	for (const m of paletteText.matchAll(
		/--([a-z]+)-rgb-([a-z]+)\s*:\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*;/g,
	)) {
		const [, space, colour, r, g, b] = m;
		const name = `--${space}-${colour}`;
		const written = [r, g, b].map(Number).join(", ");
		const hex = paletteHex.get(name);
		if (!hex)
			wrong.push(`palette.css: --${space}-rgb-${colour} has no ${name}`);
		else if (asTriple(hex) !== written)
			wrong.push(
				`palette.css: --${space}-rgb-${colour} is ${written}, but ${name} is #${hex}`,
			);
	}
	assert.deepEqual(wrong, [], `\n${wrong.join("\n")}`);
});

// A triple anywhere but the palette is a copy nothing can hold to a colour.
test("no sheet writes a triple of its own", () => {
	const stray = [];
	for (const { name, text } of css) {
		if (name === "palette.css") continue;
		for (const m of withoutComments(text).matchAll(
			/(--[a-zA-Z0-9-]+)\s*:\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*;/g,
		))
			stray.push(`${name}: ${m[1]}`);
	}
	assert.deepEqual(
		stray,
		[],
		`written by hand outside the palette, so nothing keeps it in step: ${stray.join(", ")}`,
	);
});

// --- The palette is the specification, at a named point ---------------------

test("every palette colour is the value the specification publishes", () => {
	const wrong = [];
	for (const [name, hex] of Object.entries(SPEC)) {
		// paletteHex holds the six digits; the table keeps the `#` so it can be
		// read against the specification page without translating.
		const got = paletteHex.get(name);
		if (got === undefined) wrong.push(`${name} is not in palette.css`);
		else if (`#${got}` !== hex)
			wrong.push(`${name} is #${got}, the spec says ${hex}`);
	}
	assert.deepEqual(wrong, [], `\n${wrong.join("\n")}`);
});

test("the palette publishes nothing the specification does not", () => {
	// A colour invented here and given a spec-shaped name would be taken for
	// Dracula's by anyone reading the file, and by anyone porting it onward.
	const extra = [...paletteHex.keys()].filter((n) => !(n in SPEC));
	assert.deepEqual(
		extra,
		[],
		`not in the specification at the pinned commit: ${extra.join(", ")}`,
	);
});

test("the pinned commit is stated in the palette as well as here", () => {
	assert.match(
		paletteText,
		new RegExp(SPEC_COMMIT),
		"palette.css no longer names the commit this table was copied from",
	);
});

// --- Colours live in palette.css and nowhere else ---------------------------
//
// Comments are stripped first — they quote colours as documentation, and a
// measurement written into a note is not a declaration. In CSS the selectors go
// too: `#add` is an id to a pattern and a colour to nobody, and stripping the
// text before each `{` removes every selector and at-rule prelude at once.

const COLOUR_HEX =
	/#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})\b/g;
// Only a literal: `rgba(var(--x-rgb), .5)` reads the palette and is the shape
// Bootstrap's utilities force, so a digit after the paren is what marks a copy.
const COLOUR_FN = /\b(?:rgba?|hsla?)\(\s*[\d.]/g;

function colourLiterals(name) {
	let text = withoutComments(read(name));
	if (name.endsWith(".js")) {
		// `:` before the slashes is a URL, not a comment.
		text = text.replace(/(^|[^:])\/\/.*$/gm, "$1");
	} else {
		text = text.replace(/[^{};]*\{/g, "");
	}
	return [
		...(text.match(COLOUR_HEX) || []),
		...(text.match(COLOUR_FN) || []),
	].map((s) => s.trim());
}

// An SVG fill cannot read a custom property, so every glyph writes its colour
// out. `%23` is what `#` becomes inside a data URI, which hides all of them from
// COLOUR_HEX above — the one place most of the theme's colours live is the one
// place that rule does not reach. These cannot be names, so the encoded check
// asks the weaker question the shape allows: that each is a value the spec pins.
const ENCODED_HEX =
	/%23(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{3})\b/g;

const encodedColours = (name) => read(name).match(ENCODED_HEX) || [];

// Each entry is one literal and the reason it cannot be a name. Removing the
// literal removes the entry: the staleness checks refuse a reason that no longer
// answers to anything.
const COLOUR_EXEMPT = {
	"init.js": [
		// draculaSetFavicon runs at file scope so that upstream's icon is replaced
		// before it is ever painted, which is earlier than any stylesheet — see the
		// note there. Measured: the favicon is drawn from these two on every load.
		["#282A36", "favicon: drawn before a stylesheet exists"],
		["#BD93F9", "favicon: drawn before a stylesheet exists"],
	],
	"mobile.css": [
		// A mask reads alpha and discards hue, so this is the word "opaque"
		// spelled as a colour. Naming a palette entry here would say the opposite.
		["#000", "mask stop: a mask reads alpha, so this is opacity"],
		["#000", "mask stop: a mask reads alpha, so this is opacity"],
	],
};

const ENCODED_EXEMPT = {
	"style.css": [
		// A mask reads alpha and discards hue, so this is the word "opaque"
		// spelled as a colour, exactly as in mobile.css above.
		["%23000", "mask stop: a mask reads alpha, so this is opacity"],
		["%23000", "mask stop: a mask reads alpha, so this is opacity"],
	],
};

// Consumes one allowance per literal found, so a second copy of an exempted
// colour is still reported and an exemption cannot cover more than it names.
function unexplained(found, allowed) {
	const left = [...allowed];
	const stray = [];
	for (const literal of found) {
		const at = left.indexOf(literal);
		if (at === -1) stray.push(literal);
		else left.splice(at, 1);
	}
	return stray;
}

function staleExemptions(table, lookup) {
	const dead = [];
	for (const [name, entries] of Object.entries(table)) {
		const found = lookup(name);
		for (const [literal, reason] of entries) {
			const at = found.indexOf(literal);
			if (at === -1) dead.push(`${name}: ${literal} (${reason})`);
			else found.splice(at, 1);
		}
	}
	return dead;
}

test("no colour is written outside palette.css", () => {
	const stray = [];
	for (const name of FILES) {
		if (name === "palette.css") continue;
		const allowed = (COLOUR_EXEMPT[name] || []).map(([literal]) => literal);
		for (const literal of unexplained(colourLiterals(name), allowed))
			stray.push(`${name}: ${literal}`);
	}
	assert.deepEqual(
		stray,
		[],
		`written outside palette.css: ${stray.join(", ")}. Define it in ` +
			`palette.css and read the name, or exempt it here with a reason.`,
	);
});

test("every colour inside a data URI is a palette value", () => {
	const published = new Set(
		Object.values(SPEC).map((hex) => hex.toLowerCase()),
	);
	const stray = [];
	for (const name of FILES) {
		const allowed = (ENCODED_EXEMPT[name] || []).map(([literal]) => literal);
		for (const literal of unexplained(encodedColours(name), allowed))
			// `%23` is three characters; what follows is the hex the spec would
			// spell with a leading `#`.
			if (!published.has("#" + literal.slice(3).toLowerCase()))
				stray.push(`${name}: ${literal}`);
	}
	assert.deepEqual(
		stray,
		[],
		`not in the palette: ${stray.join(", ")}. A glyph takes its colour from ` +
			`the spec like everything else, or is exempted here with a reason.`,
	);
});

test("no encoded-colour exemption outlives its literal", () => {
	const dead = staleExemptions(ENCODED_EXEMPT, encodedColours);
	assert.deepEqual(
		dead,
		[],
		`exempted but no longer written: ${dead.join(", ")} — drop the entry`,
	);
});

test("no colour exemption outlives its literal", () => {
	const dead = staleExemptions(COLOUR_EXEMPT, colourLiterals);
	assert.deepEqual(
		dead,
		[],
		`exempted but no longer written: ${dead.join(", ")} — drop the entry`,
	);
});
