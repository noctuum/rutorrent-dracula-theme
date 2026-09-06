// The Dracula specification, at a named point.
//
// Copied from github.com/dracula/draculatheme.com, content/spec.mdx, at commit
// ab9840fc416836e1474b9a7d21522234af1eaddd (2026-08-14) — the same pin written
// into the header of palette.css. Held here as well as there because a comment
// states an intention and a test enforces one: a hex edited in the palette, for
// whatever good reason at the time, fails against this.
//
// Raising the pin is deliberate work: fetch that file at the newer commit,
// replace this table with what it says, and move the commit in both places.
// Nothing here should ever be edited to make a failing palette pass.
//
// The ANSI palettes are not recorded. The specification assigns them to terminal
// applications and nothing in this interface is one; thirty-two names no rule can
// read would make the record harder to check, not more faithful.

export const SPEC_COMMIT = "ab9840fc416836e1474b9a7d21522234af1eaddd";

export const SPEC = {
	"--dracula-bg": "#282a36",
	"--dracula-fg": "#f8f8f2",
	"--dracula-current-line": "#6272a4",
	"--dracula-selection": "#44475a",
	"--dracula-comment": "#6272a4",
	"--dracula-red": "#ff5555",
	"--dracula-orange": "#ffb86c",
	"--dracula-yellow": "#f1fa8c",
	"--dracula-green": "#50fa7b",
	"--dracula-cyan": "#8be9fd",
	"--dracula-purple": "#bd93f9",
	"--dracula-pink": "#ff79c6",
	"--dracula-floating": "#343746",
	"--dracula-bg-lighter": "#424450",
	"--dracula-bg-light": "#343746",
	"--dracula-bg-dark": "#21222c",
	"--dracula-bg-darker": "#191a21",
	"--dracula-line-highlight": "#353747",

	"--alucard-bg": "#fffbeb",
	"--alucard-fg": "#1f1f1f",
	"--alucard-current-line": "#6c664b",
	"--alucard-selection": "#cfcfde",
	"--alucard-comment": "#6c664b",
	"--alucard-red": "#cb3a2a",
	"--alucard-orange": "#a34d14",
	"--alucard-yellow": "#846e15",
	"--alucard-green": "#14710a",
	"--alucard-cyan": "#036a96",
	"--alucard-purple": "#644ac9",
	"--alucard-pink": "#a3144d",
	"--alucard-floating": "#efeddc",
	"--alucard-bg-lighter": "#ece9df",
	"--alucard-bg-light": "#dedccf",
	"--alucard-bg-dark": "#ceccc0",
	"--alucard-bg-darker": "#bcbab3",
	"--alucard-line-highlight": "#e2deca",

	"--functional-red": "#de5735",
	"--functional-orange": "#a39514",
	"--functional-green": "#089108",
	"--functional-cyan": "#0081d6",
	"--functional-purple": "#815cd6",
};
