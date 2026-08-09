/**
 * Importing a guest list, and re-importing an updated one.
 *
 * The rule from ADR-0013: **import reconciles, it never replaces.** A planner
 * receives an updated list days before the event, after seating is done. If
 * importing it clears the seating, the tool is worthless at exactly the moment
 * it matters most.
 *
 * So an import produces a *plan of changes* first. The user sees what will
 * happen — how many added, how many changed, who is leaving — and only then
 * applies it. Nothing surprises them, and nothing is lost silently.
 */

import type { CsvRow, ColumnMapping } from './csv';
import { readName, readBoolean } from './csv';
import type { Guest, Group, SeatingPlan, GuestId } from './guest';
import { createGuest } from './guest';

export interface ImportOptions {
  readonly mapping: ColumnMapping;
  /** Supplies ids. Injected so tests are deterministic. */
  readonly newId?: () => string;
}

export interface ImportChange {
  readonly kind: 'add' | 'update' | 'remove' | 'unchanged';
  readonly name: string;
  /** Present for update and remove. */
  readonly guestId?: GuestId;
  /** Fields that differ, for an update. */
  readonly changedFields?: readonly string[];
  /** True when this guest currently holds a seat. */
  readonly seated?: boolean;
}

export interface ImportPreview {
  readonly changes: readonly ImportChange[];
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly unchanged: number;
  /** Departing guests who currently hold a seat — the ones worth confirming. */
  readonly seatedRemovals: number;
  /** Rows that produced no usable name. */
  readonly skippedRows: number;
}

/**
 * The key used to recognise the same person across imports.
 *
 * An explicit id column wins. Failing that, email — stable and unique in
 * practice. Failing that, the name, which is the weakest of the three: it is
 * how "Kate Brown" becomes a stranger when she is re-exported as
 * "Kate Brown-Smith". The preview exists partly so that shows up as a removal
 * plus an addition rather than happening quietly.
 */
export function sourceKeyFor(row: CsvRow, mapping: ColumnMapping): string {
  const explicit = mapping.key ? (row[mapping.key]?.trim() ?? '') : '';
  if (explicit !== '') return `id:${explicit.toLowerCase()}`;

  const email = mapping.email ? (row[mapping.email]?.trim() ?? '') : '';
  if (email !== '') return `email:${email.toLowerCase()}`;

  return `name:${readName(row, mapping).toLowerCase()}`;
}

/** Read one row into the fields of a guest, without an id or a seat. */
function readFields(row: CsvRow, mapping: ColumnMapping) {
  const get = (column: string | null) => (column ? (row[column]?.trim() ?? '') : '');

  return {
    name: readName(row, mapping),
    email: get(mapping.email),
    groupName: get(mapping.group),
    isHost: mapping.host ? readBoolean(row[mapping.host]) : false,
    meal: get(mapping.meal),
    dietary: get(mapping.dietary),
    accessibility: get(mapping.accessibility),
    notes: get(mapping.notes),
  };
}

/** Fields compared when deciding whether an existing guest changed. */
const COMPARED = ['name', 'email', 'meal', 'dietary', 'accessibility', 'notes'] as const;

/**
 * Work out what an import would do, without doing it.
 *
 * Nothing here touches the plan. The result is what the confirmation screen
 * shows, and `applyImport` performs exactly the changes it describes.
 */
export function previewImport(
  plan: SeatingPlan,
  rows: readonly CsvRow[],
  mapping: ColumnMapping
): ImportPreview {
  const byKey = new Map(plan.guests.map((g) => [g.sourceKey, g]));
  const seenKeys = new Set<string>();
  const changes: ImportChange[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const fields = readFields(row, mapping);
    if (fields.name === '') {
      skippedRows += 1;
      continue;
    }

    const key = sourceKeyFor(row, mapping);
    seenKeys.add(key);
    const existing = byKey.get(key);

    if (!existing) {
      changes.push({ kind: 'add', name: fields.name });
      continue;
    }

    const changed = COMPARED.filter((field) => existing[field] !== fields[field]);
    changes.push(
      changed.length === 0
        ? { kind: 'unchanged', name: fields.name, guestId: existing.id }
        : {
            kind: 'update',
            name: fields.name,
            guestId: existing.id,
            changedFields: changed,
            seated: existing.seat !== null,
          }
    );
  }

  for (const guest of plan.guests) {
    if (seenKeys.has(guest.sourceKey)) continue;
    changes.push({
      kind: 'remove',
      name: guest.name,
      guestId: guest.id,
      seated: guest.seat !== null,
    });
  }

  const count = (kind: ImportChange['kind']) => changes.filter((c) => c.kind === kind).length;

  return {
    changes,
    added: count('add'),
    updated: count('update'),
    removed: count('remove'),
    unchanged: count('unchanged'),
    seatedRemovals: changes.filter((c) => c.kind === 'remove' && c.seated).length,
    skippedRows,
  };
}

export interface ApplyOptions extends ImportOptions {
  /**
   * Remove guests absent from the new list.
   *
   * Off by default. A guest list exported with a filter applied would otherwise
   * delete everyone who was filtered out, and losing real seating to a
   * spreadsheet mistake is the worst outcome this module can produce.
   */
  readonly removeMissing?: boolean;
}

export interface ImportResult {
  readonly plan: SeatingPlan;
  readonly preview: ImportPreview;
}

/**
 * Apply an import.
 *
 * **Seat assignments survive.** An updated guest keeps their seat; only their
 * details change. New guests arrive unseated, which is honest — the app does
 * not know where they should sit, and guessing would quietly reorganise a plan
 * the user had finished.
 */
export function applyImport(
  plan: SeatingPlan,
  rows: readonly CsvRow[],
  options: ApplyOptions
): ImportResult {
  const { mapping } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const preview = previewImport(plan, rows, mapping);

  if (plan.assignmentsLocked) {
    // The lock exists to stop an import reorganising settled seating. Details
    // may still be corrected; nobody is added, removed, or moved.
    return { plan: applyFieldUpdatesOnly(plan, rows, mapping), preview };
  }

  const byKey = new Map(plan.guests.map((g) => [g.sourceKey, g]));
  const groups = new Map(plan.groups.map((g) => [g.name.toLowerCase(), g]));
  const seenKeys = new Set<string>();
  const guests: Guest[] = [];

  for (const row of rows) {
    const fields = readFields(row, mapping);
    if (fields.name === '') continue;

    const key = sourceKeyFor(row, mapping);
    if (seenKeys.has(key)) continue; // a duplicate row in the source
    seenKeys.add(key);

    const groupId = ensureGroup(groups, fields.groupName, newId);
    const existing = byKey.get(key);

    guests.push(
      existing
        ? {
            ...existing,
            name: fields.name,
            email: fields.email,
            meal: fields.meal,
            dietary: fields.dietary,
            accessibility: fields.accessibility,
            notes: fields.notes,
            groupId,
            isHost: fields.isHost,
            // seat deliberately untouched.
          }
        : createGuest(newId(), fields.name, {
            email: fields.email,
            groupId,
            isHost: fields.isHost,
            meal: fields.meal,
            dietary: fields.dietary,
            accessibility: fields.accessibility,
            notes: fields.notes,
            sourceKey: key,
          })
    );
  }

  // Guests absent from the new list are kept unless removal was asked for.
  if (!options.removeMissing) {
    for (const guest of plan.guests) {
      if (!seenKeys.has(guest.sourceKey)) guests.push(guest);
    }
  }

  const usedGroupIds = new Set(guests.map((g) => g.groupId));
  return {
    plan: {
      ...plan,
      guests,
      groups: [...groups.values()].filter((group) => usedGroupIds.has(group.id)),
      // Separations naming a departed guest are dropped: a rule about someone
      // who is not coming is noise in the conflict list.
      separations: plan.separations.filter(
        (s) => guests.some((g) => g.id === s.a) && guests.some((g) => g.id === s.b)
      ),
    },
    preview,
  };
}

function ensureGroup(groups: Map<string, Group>, name: string, newId: () => string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return null;

  const key = trimmed.toLowerCase();
  const existing = groups.get(key);
  if (existing) return existing.id;

  const group: Group = { id: newId(), name: trimmed, keepTogether: true };
  groups.set(key, group);
  return group.id;
}

/** Correct details only — used when assignments are locked. */
function applyFieldUpdatesOnly(
  plan: SeatingPlan,
  rows: readonly CsvRow[],
  mapping: ColumnMapping
): SeatingPlan {
  const byKey = new Map<string, ReturnType<typeof readFields>>();
  for (const row of rows) {
    const fields = readFields(row, mapping);
    if (fields.name !== '') byKey.set(sourceKeyFor(row, mapping), fields);
  }

  return {
    ...plan,
    guests: plan.guests.map((guest) => {
      const fields = byKey.get(guest.sourceKey);
      if (!fields) return guest;
      return {
        ...guest,
        name: fields.name,
        email: fields.email,
        meal: fields.meal,
        dietary: fields.dietary,
        accessibility: fields.accessibility,
        notes: fields.notes,
      };
    }),
  };
}
