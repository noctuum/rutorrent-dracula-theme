// Unit tests for the pure functions in Dracula/init.js.
//
// The shipped file cannot be a module: ruTorrent reads it off disk and splices
// it into a PHP response (`plugins/theme/init.php:22`), so an `export` would be
// a syntax error in the page. Top-level `function` declarations do become
// properties of the global object, which is the trick here — node:vm evaluates
// the real file in a sandbox and the functions are read back off it. Nothing in
// Dracula/ changes to make this work.
//
// Zero dependencies: node:test, node:assert and node:vm are all stdlib. Run
// with `node --test` from the repo root.
//
// Only the pure functions are tested. The DOM-wrapping ones are left alone
// deliberately: their interesting failures are wrap ordering against other
// plugins and position in the cascade, and a mock reproduces neither.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const SRC = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"Dracula",
	"init.js",
);

// The ruTorrent and browser surface init.js touches while it is being
// evaluated. When the theme reaches for a new global at module scope this
// throws and a line has to be added here — the price of testing the shipped
// file unmodified.
function loadTheme() {
	const noop = () => {};
	const sandbox = {
		plugin: { allDone: noop },
		thePlugins: { get: () => ({}) },
		theWebUI: { settings: {}, getStatusIcon: () => ["", ""], version: "5.3.7" },
		dStatus: { started: 1, paused: 2, checking: 4, hashing: 8, error: 16 },
		dxSTable: { prototype: { create: noop, renameColumnById: noop } },
		RGBackground: function () {},
		rGraph: undefined,
		ALIGN_LEFT: 0,
		$: undefined,
		console: { warn: noop, log: noop },
		document: {
			documentElement: {},
			addEventListener: noop,
			querySelectorAll: () => [],
			getElementById: () => null,
			createElement: () => ({
				style: {},
				appendChild: noop,
				setAttribute: noop,
			}),
			head: { appendChild: noop },
		},
		setTimeout: noop,
		clearTimeout: noop,
		MutationObserver: function () {
			return { observe: noop, disconnect: noop };
		},
		getComputedStyle: () => ({ getPropertyValue: () => "" }),
		Image: function () {},
		matchMedia: () => ({
			addEventListener: noop,
			addListener: noop,
			matches: false,
		}),
	};
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(readFileSync(SRC, "utf8"), sandbox, { filename: SRC });
	return sandbox;
}

const theme = loadTheme();

// Evaluating the file at all is a smoke test: a syntax error or a module-scope
// crash fails the run here rather than on every page the theme is installed
// on.
test("init.js evaluates against a stub ruTorrent and exposes its helpers", () => {
	for (const fn of [
		"draculaRatioLimit",
		"draculaMinorError",
		"draculaErrorIcon",
		"draculaStoppedTorrent",
		"draculaUserSizedColumn",
		"draculaOlderThan",
		"draculaIconKind",
		"draculaVisualScale",
		"draculaSharedWords",
		"draculaDropWords",
		"draculaTrimEllipsis",
	])
		assert.equal(typeof theme[fn], "function", `${fn} is missing`);
});

test("the theme version is a plain semver string", () => {
	assert.match(theme.DRACULA_VERSION, /^\d+\.\d+\.\d+$/);
	assert.match(theme.DRACULA_RUTORRENT_MIN, /^\d+\.\d+\.\d+$/);
});

// The trap this guards is "5.10" against "5.9": below it as text, above it as a
// version, and ruTorrent is already past 5.9.
test("draculaOlderThan compares versions as numbers, not as text", () => {
	assert.equal(theme.draculaOlderThan("5.1.12", "5.2.0"), true);
	assert.equal(theme.draculaOlderThan("5.2.0", "5.2.0"), false);
	assert.equal(theme.draculaOlderThan("5.3.12", "5.2.0"), false);
	assert.equal(theme.draculaOlderThan("5.9.0", "5.10.0"), true);
	assert.equal(theme.draculaOlderThan("5.10.0", "5.9.0"), false);
	assert.equal(theme.draculaOlderThan("4.3.11", "5.2.0"), true);
	// A version with parts missing reads them as zero rather than as NaN.
	assert.equal(theme.draculaOlderThan("5.2", "5.2.0"), false);
});

// The pairs are `mnu_add` against `mnu_create` as ruTorrent 5.3.12 and its
// create plugin ship them. Word order, script and casing all differ across
// them, and splitting on whitespace is what carries the derivation through:
// German leads with the noun, Korean and Chinese space it off, Serbian writes
// it in Cyrillic with one r.
test("draculaSharedWords finds the noun whatever the language does with it", () => {
	const cases = [
		["Add Torrent", "Create Torrent", ["torrent"]],
		["Torrent dazu", "Create Torrent", ["torrent"]],
		["Добавить торрент", "Новый торрент", ["торрент"]],
		["토렌트 추가", "토렌트 생성", ["토렌트"]],
		["添加 Torrent", "创建 Torrent", ["torrent"]],
		["Torrent hozzáadása", "Torrent létrehozása", ["torrent"]],
		["Додај торент", "Направи торент", ["торент"]],
		// French shares the article too, and dropping both is what gets
		// "Ajouter un torrent" down to a label that fits a third of a phone.
		["Ajouter un torrent", "Créer un torrent", ["un", "torrent"]],
	];
	// `Array.from` re-homes the result: node:vm gives the sandbox its own
	// realm, so an array built in there fails a strict deep compare against one
	// built out here on its prototype alone.
	for (const [add, create, want] of cases)
		assert.deepEqual(
			Array.from(theme.draculaSharedWords(add, create)),
			want,
			add,
		);
});

// Polish translates neither label with the noun; Latvian and Bengali translate
// only one of the two, so the spellings never meet. Nothing shared means
// nothing dropped — the stylesheet clips those instead.
test("draculaSharedWords finds nothing rather than guessing", () => {
	assert.deepEqual(Array.from(theme.draculaSharedWords("Dodaj", "Utwórz")), []);
	assert.deepEqual(
		Array.from(theme.draculaSharedWords("Pievienot torentu", "Create Torrent")),
		[],
	);
	assert.deepEqual(Array.from(theme.draculaSharedWords("Add Torrent", "")), []);
	assert.deepEqual(
		Array.from(theme.draculaSharedWords(undefined, "Create Torrent")),
		[],
	);
});

// Only buttons a plugin adds carry the dots in the label; the ones ruTorrent
// builds keep them in the tooltip, which the panel never shows.
test("draculaTrimEllipsis takes the dots a plugin writes into a label", () => {
	assert.equal(
		theme.draculaTrimEllipsis("Create Torrent..."),
		"Create Torrent",
	);
	assert.equal(
		theme.draculaTrimEllipsis("RSS Downloader..."),
		"RSS Downloader",
	);
	// The single character as well as the three dots.
	assert.equal(theme.draculaTrimEllipsis("Plugins…"), "Plugins");
	assert.equal(theme.draculaTrimEllipsis("Settings"), "Settings");
	// Dots and nothing else name no command, so they stay.
	assert.equal(theme.draculaTrimEllipsis("..."), "...");
});

test("draculaDropWords takes the noun and leaves the verb", () => {
	assert.equal(theme.draculaDropWords("Add Torrent", ["torrent"]), "Add");
	assert.equal(theme.draculaDropWords("Torrent dazu", ["torrent"]), "dazu");
	assert.equal(
		theme.draculaDropWords("Ajouter un torrent", ["un", "torrent"]),
		"Ajouter",
	);
	// Nothing to drop is not a reason to touch the label.
	assert.equal(theme.draculaDropWords("Remove", ["torrent"]), "Remove");
	assert.equal(theme.draculaDropWords("Remove", []), "Remove");
});

// The order the panel applies them in, and the reason it is that order: the
// noun is compared as a bare word, which "Torrent..." is not until the dots
// come off.
test("trimming before dropping is what shortens a plugin's label", () => {
	const words = theme.draculaSharedWords("Add Torrent", "Create Torrent");
	assert.equal(
		theme.draculaDropWords(
			theme.draculaTrimEllipsis("Create Torrent..."),
			words,
		),
		"Create",
	);
});

// A label reduced to nothing says less than one that has to be clipped.
test("draculaDropWords never empties a label", () => {
	assert.equal(theme.draculaDropWords("Torrent", ["torrent"]), "Torrent");
});

// The budget is by area, so a small canvas is allowed to be dense: a flat
// ceiling of 4 leaves the 100x20 status-bar meter five times too small.
test("draculaRatioLimit: a small meter gets all the density it asks for", () => {
	assert.ok(theme.draculaRatioLimit(100, 20) > 10);
});

test("draculaRatioLimit: never below 1, never past the 8192 side limit", () => {
	assert.equal(theme.draculaRatioLimit(20000, 20000), 1);
	assert.equal(theme.draculaRatioLimit(4096, 1), 2);
	assert.ok(theme.draculaRatioLimit(0, 0) >= 1);
});

test("draculaRatioLimit: stays inside the 8,000,000 pixel budget", () => {
	for (const [w, h] of [
		[100, 20],
		[800, 300],
		[1920, 400],
		[4000, 2000],
	]) {
		const r = theme.draculaRatioLimit(w, h);
		assert.ok(w * r * h * r <= 8000001, `${w}x${h} @ ${r}`);
	}
});

// An allowlist on purpose: an unfamiliar phrasing must land in the loud bucket,
// never the quiet one.
test("draculaMinorError: announce noise and a tracker takedown are minor", () => {
	assert.equal(
		theme.draculaMinorError({ msg: "Tracker: [network error: ETIMEDOUT]" }),
		true,
	);
	assert.equal(
		theme.draculaMinorError({
			msg: "Tracker: [No DHT nodes available for peer search.]",
		}),
		true,
	);
	// chkstate arrives from rTorrent as a string; the plugin compares loosely,
	// and so must this.
	assert.equal(theme.draculaMinorError({ chkstate: "4" }), true);
	assert.equal(theme.draculaMinorError({ chkstate: 4 }), true);
});

test("draculaMinorError: a real data error is never quiet", () => {
	// rTorrent's exact wording when the file is deleted under a torrent.
	assert.equal(
		theme.draculaMinorError({
			msg: "Download registered as completed, but hash check returned unfinished chunks.",
		}),
		false,
	);
	assert.equal(theme.draculaMinorError({ msg: "" }), false);
	assert.equal(theme.draculaMinorError({}), false);
	// "Tracker" has to be the start of the message, not merely present in it.
	assert.equal(
		theme.draculaMinorError({ msg: "Files missing. Tracker: fine" }),
		false,
	);
	// A chkstate that is not 4 says nothing about severity.
	assert.equal(theme.draculaMinorError({ chkstate: "7" }), false);
});

test("draculaErrorIcon: matches the three upstream error classes and nothing else", () => {
	assert.equal(theme.draculaErrorIcon("Status_Error"), true);
	assert.equal(theme.draculaErrorIcon("Status_Error_Up"), true);
	assert.equal(theme.draculaErrorIcon("Status_Error_Down"), true);
	assert.equal(theme.draculaErrorIcon("Status_Warning"), false);
	assert.equal(theme.draculaErrorIcon("Status_Stopped"), false);
	assert.equal(theme.draculaErrorIcon(""), false);
});

test("draculaStoppedTorrent: only started, checking or hashing count as running", () => {
	assert.equal(theme.draculaStoppedTorrent({ state: 0 }), true);
	// The paused bit alone does not mean running: upstream reaches
	// Status_Paused only when started is set too.
	assert.equal(theme.draculaStoppedTorrent({ state: 2 }), true);
	assert.equal(theme.draculaStoppedTorrent({ state: 16 }), true); // error alone
	assert.equal(theme.draculaStoppedTorrent({ state: 1 }), false);
	assert.equal(theme.draculaStoppedTorrent({ state: 3 }), false); // started|paused
	assert.equal(theme.draculaStoppedTorrent({ state: 4 }), false);
	assert.equal(theme.draculaStoppedTorrent({ state: 8 }), false);
	assert.equal(theme.draculaStoppedTorrent({ state: 19 }), false); // the alpine case
});

// The profile carries a width for every column whether or not anyone chose it,
// so the declaration it was saved from is what tells the two apart.
test("draculaUserSizedColumn: only a width unlike the declaration is the user's", () => {
	// Saved exactly what upstream declares: nobody touched it.
	assert.equal(theme.draculaUserSizedColumn([110], 0, "110px"), false);
	// Dragged away from the declaration.
	assert.equal(theme.draculaUserSizedColumn([309], 0, "200px"), true);
	// No width worth the name, and config() would not apply it either.
	assert.equal(theme.draculaUserSizedColumn([3], 0, "70px"), false);
	assert.equal(theme.draculaUserSizedColumn(null, 0, "70px"), false);
	assert.equal(theme.draculaUserSizedColumn([10], 5, "70px"), false);
	// A declaration that cannot be read leaves the column alone.
	assert.equal(theme.draculaUserSizedColumn([80], 0, undefined), true);
	assert.equal(theme.draculaUserSizedColumn([80], 0, "auto"), true);
});

test("draculaIconKind: only tracklabels URLs classify, and by their parameter", () => {
	assert.equal(
		theme.draculaIconKind("plugins/tracklabels/action.php?label=x"),
		"label",
	);
	assert.equal(
		theme.draculaIconKind("plugins/tracklabels/action.php?tracker=y"),
		"tracker",
	);
	assert.equal(
		theme.draculaIconKind("plugins/tracklabels/action.php?other=z"),
		null,
	);
	assert.equal(theme.draculaIconKind("some/other/url?label=x"), null);
	assert.equal(theme.draculaIconKind(""), null);
	assert.equal(theme.draculaIconKind(null), null);
});

test("draculaVisualScale: falls back to 1 when the viewport reports nothing", () => {
	assert.equal(theme.draculaVisualScale(), 1);
});

// The mobile plugin writes its whole status line as one string, so the ratio's
// value has to be found in text before it can be given an element and coloured.
// Everything below is what a real line looks like, taken off the plugin's own
// template at `plugins/mobile/init.js:1907`.

test("draculaMobileRatioAt: finds the value, whatever precedes it", () => {
	const at = (text, word = "Ratio") => theme.draculaMobileRatioAt(text, word);

	const plain = at("Seeding | Ratio 0.377");
	assert.equal(plain.value, 0.377);
	assert.equal(
		"Seeding | Ratio 0.377".substr(plain.start, plain.length),
		"0.377",
	);

	// A tracker message follows the value, so it ends at a space, not at the end.
	const withMessage = at("Seeding | Ratio 1.250 | ");
	assert.equal(withMessage.value, 1.25);
	assert.equal(withMessage.length, 5);

	// Speeds sit between the state and the separator.
	const withSpeeds = at("Seeding ↑12.3 KiB/s | Ratio 2.000");
	assert.equal(withSpeeds.value, 2);

	// The word is the user's language, never assumed.
	assert.equal(at("Раздаётся | Рейтинг 0.500", "Рейтинг").value, 0.5);
});

test("draculaMobileRatioAt: finds nothing rather than guessing", () => {
	const at = (text, word = "Ratio") => theme.draculaMobileRatioAt(text, word);

	// A downloading torrent shows an ETA and carries no ratio at all.
	assert.equal(at("Downloading | ETA ∞"), null);
	// The plugin writes ∞ for an unknown ratio: no number, no side of 1.
	assert.equal(at("Seeding | Ratio ∞"), null);
	// The word alone, with nothing behind it.
	assert.equal(at("Seeding | Ratio "), null);
	assert.equal(at("Seeding | Ratio"), null);
	// Nothing to read.
	assert.equal(at(""), null);
	assert.equal(at(null), null);
	assert.equal(at("Seeding | Ratio 1.0", ""), null);
	assert.equal(at("Seeding | Ratio 1.0", null), null);
});

test("draculaMobileRatioAt: 1.000 is met, 0.999 is not", () => {
	const value = (text) => theme.draculaMobileRatioAt(text, "Ratio").value;
	assert.equal(value("Ratio 0.999") >= 1, false);
	assert.equal(value("Ratio 1.000") >= 1, true);
	assert.equal(value("Ratio 1.001") >= 1, true);
	assert.equal(value("Ratio 0.000") >= 1, false);
	// A ratio past ten still parses whole, not truncated at the dot.
	assert.equal(value("Ratio 12.500"), 12.5);
});
