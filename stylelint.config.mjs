// Dev-time only. Nothing here reaches the shipped theme.
//
// Written as .mjs rather than .stylelintrc.json so each rule turned off can
// carry its reason.
//
// The base is stylelint-config-recommended, not -standard: -standard adds ~30
// formatting rules that argue with two things this theme cannot change — its
// own deliberate hand formatting (`div#t div#add {background: ...;
// background-size: 28px;}` is two declarations on one line, on purpose) and
// upstream's class names, which are not kebab-case and not the theme's to
// rename (.Status_Paused, .Icon_File, .Cell0, .noty_bar). -recommended is the
// correctness-only set: every rule in it is a real error.
export default {
	extends: "stylelint-config-recommended",
	plugins: ["stylelint-declaration-strict-value"],
	rules: {
		// Fires constantly and legitimately in an override theme: upstream's
		// source order dictates this one, so a low-specificity selector routinely
		// has to come after a high-specificity one.
		"no-descending-specificity": null,

		// Off deliberately. This theme overrides a UI that writes inline styles,
		// and !important is the only thing that outranks inline, so a warning
		// per use is a wall to skim past rather than a signal. The count is
		// guarded instead by a ratchet in tests/integrity.test.mjs, which fails
		// when it grows.
		"declaration-no-important": null,

		"declaration-block-no-duplicate-properties": [
			true,
			{ ignore: ["consecutive-duplicates-with-different-values"] },
		],
		"function-url-quotes": ["always", { except: ["empty"] }],

		// The palette enforcer, and the reason the Dracula spec holds without a
		// human sweep: any colour-ish declaration whose value is not a var()
		// fails. It does not touch the :root blocks, the properties there being
		// named --dracula-bg rather than color, so the palette definitions stay
		// legal and every *use* of a colour is checked.
		"scale-unlimited/declaration-strict-value": [
			[
				"/color$/",
				"fill",
				"stroke",
				"background-color",
				"border-color",
				"outline-color",
			],
			{
				ignoreValues: [
					"transparent",
					"inherit",
					"currentColor",
					"none",
					"initial",
					"unset",
					"revert",
				],
				disableFix: true,
				severity: "warning",
			},
		],
	},
};
