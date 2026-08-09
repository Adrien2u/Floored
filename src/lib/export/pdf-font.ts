/**
 * Text in PDF, without embedding a font.
 *
 * **This is what settles ADR-0011.** The open risk there was font embedding —
 * a TrueType subset plus a width table is real work, and if it had proved
 * expensive, `pdf-lib` would have come back as a lazy-loaded import.
 *
 * It does not, because PDF has fourteen fonts every conforming reader is
 * required to provide. Referencing Helvetica costs one dictionary and no
 * embedded bytes at all. The only thing actually needed is a width table, so
 * text can be centred and measured — 95 numbers, listed below.
 *
 * The trade is that a plan can be set in Helvetica and nothing else. For
 * dimension text, table labels, and a title block that is not a limitation
 * worth a dependency: architectural drawings have been lettered in one
 * grotesque for a century.
 */

/** The one font used throughout. A standard-14 name, so no embedding. */
export const FONT_NAME = 'Helvetica';

/** PDF resource name referenced from content streams. */
export const FONT_RESOURCE = 'F1';

/**
 * Helvetica advance widths, in 1/1000 em, for printable ASCII (32–126).
 *
 * From the Adobe Font Metrics for the standard-14 set. Exact rather than
 * approximated: a wrong width shows up as text drifting off centre inside a
 * table circle, which is the sort of flaw that makes a printed plan look
 * amateur without anyone being able to say why.
 */
const WIDTHS: readonly number[] = [
  278,
  278,
  355,
  556,
  556,
  889,
  667,
  191,
  333,
  333,
  389,
  584,
  278,
  333,
  278,
  278, // 32-47
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  556,
  278,
  278,
  584,
  584,
  584,
  556, // 48-63
  1015,
  667,
  667,
  722,
  722,
  667,
  611,
  778,
  722,
  278,
  500,
  667,
  556,
  833,
  722,
  778, // 64-79
  667,
  778,
  722,
  667,
  611,
  722,
  667,
  944,
  667,
  667,
  611,
  278,
  278,
  278,
  469,
  556, // 80-95
  333,
  556,
  556,
  500,
  556,
  556,
  278,
  556,
  556,
  222,
  222,
  500,
  222,
  833,
  556,
  556, // 96-111
  556,
  556,
  333,
  500,
  278,
  556,
  500,
  722,
  500,
  500,
  500,
  334,
  260,
  334,
  584, // 112-126
];

/** Width of one character, in 1/1000 em. Unknown characters take a space's width. */
function charWidth(code: number): number {
  if (code < 32 || code > 126) return WIDTHS[0] ?? 278;
  return WIDTHS[code - 32] ?? 278;
}

/** Width of a string at a given font size, in PDF points. */
export function textWidth(text: string, sizePt: number): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) total += charWidth(text.charCodeAt(i));
  return (total / 1000) * sizePt;
}

/**
 * Escape a string for a PDF literal.
 *
 * Backslashes and parentheses end the literal early if left alone, which
 * corrupts every object after it in the file — a plan whose event name contains
 * a bracket would produce a PDF no reader could open.
 */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Characters WinAnsiEncoding places in 0x80–0x9F.
 *
 * **WinAnsiEncoding is not Latin-1**, and assuming it is loses real characters.
 * Latin-1 leaves 0x80–0x9F as control codes; WinAnsi fills them with the
 * typographic set — curly quotes, en and em dashes, the euro, the bullet.
 * Those are exactly the characters people type into an event name, and treating
 * them as unrepresentable turned an em dash into a question mark on the sheet.
 */
const WIN_ANSI_HIGH: Readonly<Record<string, number>> = {
  '€': 0x80,
  '‚': 0x82,
  ƒ: 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  ˆ: 0x88,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/**
 * Convert text to bytes the standard encoding can represent.
 *
 * Anything outside WinAnsi becomes a question mark. That is deliberate: it
 * shows the user something was lost rather than silently printing a wrong
 * glyph, or emitting bytes that break the reader entirely.
 */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text) {
    const mapped = WIN_ANSI_HIGH[char];
    if (mapped !== undefined) {
      out += String.fromCharCode(mapped);
      continue;
    }

    const code = char.codePointAt(0) ?? 63;
    // 0x7F is DEL and 0x80-0x9F are handled above; everything else in Latin-1
    // sits at the same byte value in WinAnsi.
    out += (code >= 32 && code < 127) || (code >= 0xa0 && code <= 0xff) ? char : '?';
  }
  return out;
}

/**
 * Decode WinAnsi bytes back to text.
 *
 * Only the tests need this — to read back what was actually written to the
 * file rather than trusting what went in, which is the same principle the
 * ruler test rests on.
 */
export function fromWinAnsi(bytes: string): string {
  const reverse = new Map<number, string>();
  for (const [char, code] of Object.entries(WIN_ANSI_HIGH)) reverse.set(code, char);

  let out = '';
  for (const char of bytes) {
    const code = char.charCodeAt(0);
    out += reverse.get(code) ?? char;
  }
  return out;
}

/** The font dictionary, as a PDF object body. */
export function fontDictionary(): string {
  return `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME} /Encoding /WinAnsiEncoding >>`;
}
