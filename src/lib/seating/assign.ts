/**
 * Auto-assigning guests to seats.
 *
 * A greedy pass with a small amount of backtracking, not a general solver.
 * Seating with separation rules is graph colouring, which is NP-hard in the
 * general case — but a real guest list is not the general case. Groups do most
 * of the work, separations are rare, and a planner would rather have a good
 * arrangement instantly and adjust two tables by hand than wait for a proof.
 *
 * Two properties matter more than optimality:
 *
 *   **It never moves a seated guest.** Auto-assign fills empty seats around
 *   whatever the planner has already decided. An algorithm that reorganises
 *   finished work to improve its own score would be abandoned after one use.
 *
 *   **It says what it could not do.** Guests left unseated, and constraints it
 *   could not honour, are returned rather than silently dropped.
 */

import type { ElementId } from '$lib/document/element';
import type { Guest, GuestId, SeatingPlan } from './guest';
import { areSeparated, groupMembers, seatGuest, guestsAt } from './guest';

/** A table with seats available to fill. */
export interface TableCapacity {
  readonly elementId: ElementId;
  readonly seats: number;
}

export interface AssignOptions {
  /**
   * Keep groups whole even when splitting would seat more people.
   *
   * On by default: a planner who marked a group would rather be told it does
   * not fit than discover half of it across the room.
   */
  readonly keepGroupsTogether?: boolean;
}

export interface AssignResult {
  readonly plan: SeatingPlan;
  readonly seated: number;
  /** Guests who could not be placed, and why. */
  readonly unplaced: readonly { guest: Guest; reason: string }[];
  /** Groups that had to be split across tables. */
  readonly splitGroups: readonly string[];
}

/** Seats still free at a table, in index order. */
function freeSeats(plan: SeatingPlan, table: TableCapacity): number[] {
  const taken = new Set(guestsAt(plan, table.elementId).map((g) => g.seat?.seatIndex));
  const free: number[] = [];
  for (let i = 0; i < table.seats; i++) if (!taken.has(i)) free.push(i);
  return free;
}

/** Would seating this guest here break a separation already at the table? */
function conflictsAt(plan: SeatingPlan, elementId: ElementId, guestId: GuestId): boolean {
  return guestsAt(plan, elementId).some((seated) => areSeparated(plan, seated.id, guestId));
}

/**
 * Fill empty seats with unseated guests.
 *
 * Groups are placed largest first. A large group is the hardest thing to fit,
 * and fitting the hard things first is what stops the last group of eight from
 * finding only singles scattered across the room.
 */
export function autoAssign(
  plan: SeatingPlan,
  tables: readonly TableCapacity[],
  options: AssignOptions = {}
): AssignResult {
  if (plan.assignmentsLocked) {
    return { plan, seated: 0, unplaced: [], splitGroups: [] };
  }

  const keepTogether = options.keepGroupsTogether ?? true;
  const unplaced: { guest: Guest; reason: string }[] = [];
  const splitGroups: string[] = [];

  let working = plan;
  let seated = 0;

  // Unseated guests, bundled by group. Ungrouped guests are bundles of one.
  const bundles = bundleUnseated(working);
  bundles.sort((a, b) => b.guests.length - a.guests.length);

  for (const bundle of bundles) {
    const placement = placeBundle(working, bundle, tables, keepTogether);

    working = placement.plan;
    seated += placement.seated;
    unplaced.push(...placement.unplaced);
    if (placement.split && bundle.groupName) splitGroups.push(bundle.groupName);
  }

  return { plan: working, seated, unplaced, splitGroups };
}

interface Bundle {
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly guests: readonly Guest[];
}

function bundleUnseated(plan: SeatingPlan): Bundle[] {
  const bundles: Bundle[] = [];
  const grouped = new Set<string>();

  for (const group of plan.groups) {
    // Host first: their seat decides where the group goes.
    const members = groupMembers(plan, group.id).filter((g) => g.seat === null);
    if (members.length === 0) continue;

    grouped.add(group.id);
    bundles.push({ groupId: group.id, groupName: group.name, guests: members });
  }

  for (const guest of plan.guests) {
    if (guest.seat !== null) continue;
    if (guest.groupId !== null && grouped.has(guest.groupId)) continue;
    bundles.push({ groupId: null, groupName: null, guests: [guest] });
  }

  return bundles;
}

function placeBundle(
  plan: SeatingPlan,
  bundle: Bundle,
  tables: readonly TableCapacity[],
  keepTogether: boolean
): {
  plan: SeatingPlan;
  seated: number;
  unplaced: { guest: Guest; reason: string }[];
  split: boolean;
} {
  const size = bundle.guests.length;

  // Prefer the table whose free space fits the group most snugly. Leaving a
  // ten-seat table half empty to seat a pair is how a room runs out of tables
  // with people still standing.
  const candidates = tables
    .map((table) => ({ table, free: freeSeats(plan, table) }))
    .filter((c) => c.free.length > 0)
    .sort((a, b) => a.free.length - b.free.length);

  const whole = candidates.find(
    (c) =>
      c.free.length >= size &&
      bundle.guests.every((g) => !conflictsAt(plan, c.table.elementId, g.id))
  );

  if (whole) {
    let working = plan;
    bundle.guests.forEach((guest, i) => {
      const seatIndex = whole.free[i];
      if (seatIndex === undefined) return;
      working = seatGuest(working, guest.id, { elementId: whole.table.elementId, seatIndex });
    });
    return { plan: working, seated: size, unplaced: [], split: false };
  }

  if (keepTogether && size > 1) {
    return {
      plan,
      seated: 0,
      unplaced: bundle.guests.map((guest) => ({
        guest,
        reason: `No table has ${String(size)} seats free together`,
      })),
      split: false,
    };
  }

  // Split across tables, still respecting separations.
  let working = plan;
  let seated = 0;
  const unplaced: { guest: Guest; reason: string }[] = [];

  for (const guest of bundle.guests) {
    const spot = tables
      .map((table) => ({ table, free: freeSeats(working, table) }))
      .filter((c) => c.free.length > 0 && !conflictsAt(working, c.table.elementId, guest.id))
      .sort((a, b) => a.free.length - b.free.length)[0];

    if (!spot) {
      unplaced.push({
        guest,
        reason: hasAnyFreeSeat(working, tables)
          ? 'Every free seat conflicts with a separation rule'
          : 'No seats left',
      });
      continue;
    }

    const seatIndex = spot.free[0];
    if (seatIndex === undefined) continue;
    working = seatGuest(working, guest.id, { elementId: spot.table.elementId, seatIndex });
    seated += 1;
  }

  return { plan: working, seated, unplaced, split: size > 1 && seated > 0 };
}

function hasAnyFreeSeat(plan: SeatingPlan, tables: readonly TableCapacity[]): boolean {
  return tables.some((table) => freeSeats(plan, table).length > 0);
}

/**
 * Seat one group at a specific table — the "seat this company at table 4" case.
 *
 * Placing the host first, so the seat the planner cares about is the one that
 * fills before the table runs out.
 */
export function assignGroupToTable(
  plan: SeatingPlan,
  groupId: string,
  table: TableCapacity
): AssignResult {
  if (plan.assignmentsLocked) {
    return { plan, seated: 0, unplaced: [], splitGroups: [] };
  }

  const members = groupMembers(plan, groupId).filter((g) => g.seat === null);
  const free = freeSeats(plan, table);

  let working = plan;
  let seated = 0;
  const unplaced: { guest: Guest; reason: string }[] = [];

  members.forEach((guest, i) => {
    const seatIndex = free[i];
    if (seatIndex === undefined) {
      unplaced.push({ guest, reason: 'Table is full' });
      return;
    }
    working = seatGuest(working, guest.id, { elementId: table.elementId, seatIndex });
    seated += 1;
  });

  return { plan: working, seated, unplaced, splitGroups: [] };
}
