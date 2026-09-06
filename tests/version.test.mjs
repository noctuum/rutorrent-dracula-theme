// One version, written in nineteen places.
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
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	FILES,
	SHEETS,
	VERSION_HEADER,
	read,
	withoutComments,
} from "./theme-files.mjs";

const declaredVersion = () =>
	read("init.js").match(/DRACULA_VERSION\s*=\s*"([^"]+)"/);

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
	const declared = declaredVersion();
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
	const declared = declaredVersion()[1];
	let found = 0;
	for (const name of SHEETS) {
		// Every @import, not only the ones already written the right way — a new
		// one added without a version is exactly what this has to catch.
		for (const m of withoutComments(read(name)).matchAll(/@import\s+[^;]*;/g)) {
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
	// whoever makes it a look at this test. Eight of them — the palette, the
	// fonts and the icons into style.css, and those three plus the mobile rules
	// and the pre-5.2.0 rules into plugins.css, which is the only sheet the
	// mobile plugin's UI ever loads. The first three are named twice on purpose:
	// same URLs, fetched once, and the desktop would otherwise wait for config
	// time to get them.
	assert.equal(
		found,
		8,
		`expected 8 @imports across the sheets, found ${found}`,
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
