// Dev-time only. Nothing here reaches the shipped theme.
import js from "@eslint/js";
import globals from "globals";

export default [
	{
		// tmp/ is the unpacked upstream ruTorrent source, kept for reading. It
		// does not parse under these settings anyway: two of its plugin files
		// use `public` as an identifier and delete a local.
		ignores: ["node_modules/**", "tmp/**", "screenshots/**"],
	},
	{
		// The shipped behaviour file: vanilla ES5 living in the shared global
		// scope of someone else's application, which is exactly the environment
		// no-undef and no-unused-vars were written for.
		files: ["Dracula/init.js"],
		languageOptions: {
			// An accurate description rather than a restriction: the executable
			// code is pure ES5, and the only arrow functions and backticks in
			// the file are inside comments. Upstream's own theme init.js uses
			// newer syntax, so this is house style, not a compatibility bound.
			ecmaVersion: 5,
			sourceType: "script",
			// Deliberately empty. Every global the file touches — ruTorrent's
			// and the browser's alike — is declared in its own /* global */
			// block: one list, in the file it describes, visible to a reader
			// and to any linter. Adding globals.browser here would duplicate
			// that list (no-redeclare fires on all ten) and let it rot,
			// a name used but not listed no longer being an error.
			globals: {},
		},
		rules: {
			...js.configs.recommended.rules,
			// Args are unchecked because upstream's callback signatures dictate
			// them. Caught errors are unchecked because at ecmaVersion 5 there
			// is no optional catch binding: `catch(e)` with an unused `e` is
			// the only way to write a catch at all.
			"no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
			"no-implicit-globals": "off",
			// A warning and not an error, on purpose. The one loose compare in
			// the file is `torrent.chkstate == 4`, and it is correct: chkstate
			// arrives from rTorrent as a string and rutracker_check compares it
			// loosely too. Do not "fix" that one.
			eqeqeq: ["warn", "always"],
		},
	},
	{
		files: ["tests/**/*.mjs", "tools/**/*.mjs", "*.mjs"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: globals.node,
		},
		rules: js.configs.recommended.rules,
	},
];
