/**
 * Reading a guest list.
 *
 * Real guest lists arrive as CSV exported from a spreadsheet, a registration
 * form, or a CRM, and they are messy: quoted commas, BOMs from Excel, CRLF
 * endings, blank rows, and column headers nobody agreed on.
 *
 * CSV only. XLSX would mean a parser several times the size of this entire
 * application (SheetJS is ~600 KB), for a format every tool that produces it
 * can also export as CSV. That trade is not close.
 */

/** A parsed row, keyed by its normalized header. */
export type CsvRow = Readonly<Record<string, string>>;

/**
 * Parse CSV text into rows.
 *
 * Written by hand rather than taken from a dependency: the format is small, the
 * awkward parts are quoting and line endings, and both are a dozen lines. What
 * a library would add is dialect detection, which real guest lists do not need.
 */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  // Excel writes a UTF-8 BOM, which otherwise becomes part of the first header
  // and makes "Name" fail to match. Compared by character code rather than
  // matched as a literal, which is invisible in an editor and trips linters.
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records = splitRecords(cleaned);
  const headerRecord = records[0];
  if (!headerRecord) return { headers: [], rows: [] };

  const headers = headerRecord.map(normalizeHeader);

  const rows: CsvRow[] = [];
  for (const record of records.slice(1)) {
    // A trailing newline and blank lines between blocks are both common.
    if (record.every((cell) => cell.trim() === '')) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (record[i] ?? '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

/** Lowercase, strip punctuation and spaces, so "First Name" matches "first_name". */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Split CSV text into records of cells, honouring quotes.
 *
 * A quoted cell may contain commas, newlines, and doubled quotes. Handling that
 * character by character is the whole of what makes CSV parsing non-trivial.
 */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char ?? '';
      }
      continue;
    }

    switch (char) {
      case '"':
        inQuotes = true;
        break;
      case ',':
        record.push(cell);
        cell = '';
        break;
      case '\r':
        // Swallow CR; the LF that follows ends the record.
        break;
      case '\n':
        record.push(cell);
        records.push(record);
        record = [];
        cell = '';
        break;
      default:
        cell += char ?? '';
    }
  }

  if (cell !== '' || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records;
}

/* ------------------------------------------------------------------ *
 * Column mapping
 * ------------------------------------------------------------------ */

export interface ColumnMapping {
  readonly name: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly group: string | null;
  readonly host: string | null;
  readonly meal: string | null;
  readonly dietary: string | null;
  readonly accessibility: string | null;
  readonly notes: string | null;
  readonly key: string | null;
}

/**
 * Header names seen in the wild, per field.
 *
 * Guessing beats making the user map ten columns by hand on every import, and
 * the guess is always shown before anything is applied — so a wrong guess costs
 * a correction rather than a ruined guest list.
 */
const ALIASES: Readonly<Record<keyof ColumnMapping, readonly string[]>> = {
  name: ['name', 'fullname', 'guest', 'guestname', 'attendee', 'attendeename'],
  firstName: ['firstname', 'first', 'givenname', 'forename'],
  lastName: ['lastname', 'last', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'mail'],
  group: ['group', 'company', 'organisation', 'organization', 'party', 'table', 'household', 'org'],
  host: ['host', 'ishost', 'tablehost', 'primary', 'maincontact'],
  meal: ['meal', 'mealchoice', 'entree', 'entrée', 'menu', 'food', 'course'],
  dietary: ['dietary', 'dietaryrestrictions', 'dietaryrequirements', 'allergies', 'diet'],
  accessibility: ['accessibility', 'accessibilityneeds', 'access', 'mobility', 'specialneeds'],
  notes: ['notes', 'note', 'comments', 'remarks'],
  key: ['id', 'guestid', 'registrationid', 'confirmation', 'reference', 'ref', 'submissionid'],
};

/** Guess which column holds which field, from the headers present. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const present = new Set(headers);
  const pick = (field: keyof ColumnMapping): string | null =>
    ALIASES[field].find((alias) => present.has(alias)) ?? null;

  return {
    name: pick('name'),
    firstName: pick('firstName'),
    lastName: pick('lastName'),
    email: pick('email'),
    group: pick('group'),
    host: pick('host'),
    meal: pick('meal'),
    dietary: pick('dietary'),
    accessibility: pick('accessibility'),
    notes: pick('notes'),
    key: pick('key'),
  };
}

/** Can this mapping produce a name? Nothing else is required. */
export function mappingIsUsable(mapping: ColumnMapping): boolean {
  return mapping.name !== null || mapping.firstName !== null || mapping.lastName !== null;
}

/** Assemble a guest's name from whichever columns exist. */
export function readName(row: CsvRow, mapping: ColumnMapping): string {
  if (mapping.name) {
    const whole = row[mapping.name]?.trim() ?? '';
    if (whole !== '') return whole;
  }

  const first = mapping.firstName ? (row[mapping.firstName]?.trim() ?? '') : '';
  const last = mapping.lastName ? (row[mapping.lastName]?.trim() ?? '') : '';
  return [first, last].filter((part) => part !== '').join(' ');
}

/** Values people actually type to mean yes. */
const TRUTHY = new Set(['yes', 'y', 'true', '1', 'x', 'host', 'primary']);

export function readBoolean(value: string | undefined): boolean {
  return TRUTHY.has((value ?? '').trim().toLowerCase());
}
