import { describe, it, expect } from 'vitest';
import {
  createSeatingPlan,
  createGuest,
  findGuest,
  guestsAt,
  guestInSeat,
  unseatedGuests,
  seatedCount,
  groupMembers,
  groupHost,
  groupsAt,
  seatGuest,
  swapSeats,
  unseatGuest,
  clearTable,
  moveTableGuests,
  pruneAssignments,
  areSeparated,
  addSeparation,
  removeSeparation,
  seatingConflicts,
  type SeatingPlan,
} from './guest';

function planWith(...guests: ReturnType<typeof createGuest>[]): SeatingPlan {
  return { ...createSeatingPlan(), guests };
}

const seat = (elementId: string, seatIndex: number) => ({ elementId, seatIndex });

describe('seating and unseating', () => {
  it('seats a guest', () => {
    const plan = seatGuest(planWith(createGuest('g1', 'Amara')), 'g1', seat('t1', 0));
    expect(findGuest(plan, 'g1')?.seat).toEqual(seat('t1', 0));
  });

  it('displaces whoever was in the seat rather than refusing', () => {
    // Dropping onto an occupied seat is deliberate. Refusing it silently
    // leaves the user dragging at a seat that never accepts them.
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 0));
    plan = seatGuest(plan, 'b', seat('t1', 0));

    expect(findGuest(plan, 'b')?.seat).toEqual(seat('t1', 0));
    expect(findGuest(plan, 'a')?.seat).toBeNull();
  });

  it('keeps the displaced guest visible in the unseated list', () => {
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 0));
    plan = seatGuest(plan, 'b', seat('t1', 0));

    expect(unseatedGuests(plan).map((g) => g.id)).toEqual(['a']);
  });

  it('unseats a guest', () => {
    let plan = seatGuest(planWith(createGuest('g1', 'Amara')), 'g1', seat('t1', 0));
    plan = unseatGuest(plan, 'g1');
    expect(findGuest(plan, 'g1')?.seat).toBeNull();
  });

  it('ignores an unknown guest', () => {
    const plan = planWith(createGuest('g1', 'Amara'));
    expect(seatGuest(plan, 'ghost', seat('t1', 0))).toBe(plan);
  });

  it('never mutates the plan it was given', () => {
    const plan = planWith(createGuest('g1', 'Amara'));
    seatGuest(plan, 'g1', seat('t1', 0));
    expect(plan.guests[0]?.seat).toBeNull();
  });
});

describe('swapping', () => {
  it('exchanges two guests seats', () => {
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 0));
    plan = seatGuest(plan, 'b', seat('t2', 3));

    plan = swapSeats(plan, 'a', 'b');
    expect(findGuest(plan, 'a')?.seat).toEqual(seat('t2', 3));
    expect(findGuest(plan, 'b')?.seat).toEqual(seat('t1', 0));
  });

  it('swaps back exactly, which is where the reference system failed', () => {
    // Its swap layer recorded the reverse instead of cancelling, so swapping
    // twice did not return to the start. Reassigning the real data has no such
    // failure mode — but it is worth pinning.
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 0));
    plan = seatGuest(plan, 'b', seat('t2', 3));
    const before = plan;

    plan = swapSeats(swapSeats(plan, 'a', 'b'), 'a', 'b');
    expect(plan).toEqual(before);
  });

  it('swaps a seated guest with an unseated one', () => {
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 0));

    plan = swapSeats(plan, 'a', 'b');
    expect(findGuest(plan, 'a')?.seat).toBeNull();
    expect(findGuest(plan, 'b')?.seat).toEqual(seat('t1', 0));
  });

  it('is a no-op for the same guest twice', () => {
    const plan = seatGuest(planWith(createGuest('a', 'Amara')), 'a', seat('t1', 0));
    expect(swapSeats(plan, 'a', 'a')).toBe(plan);
  });
});

describe('table operations', () => {
  function twoTables(): SeatingPlan {
    let plan = planWith(
      createGuest('a', 'Amara'),
      createGuest('b', 'Ben'),
      createGuest('c', 'Cass')
    );
    plan = seatGuest(plan, 'a', seat('t1', 0));
    plan = seatGuest(plan, 'b', seat('t1', 1));
    plan = seatGuest(plan, 'c', seat('t2', 0));
    return plan;
  }

  it('lists guests at a table in seat order', () => {
    let plan = twoTables();
    plan = seatGuest(plan, 'c', seat('t1', 5));

    expect(guestsAt(plan, 't1').map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds the guest in a specific seat', () => {
    expect(guestInSeat(twoTables(), 't1', 1)?.id).toBe('b');
    expect(guestInSeat(twoTables(), 't1', 9)).toBeUndefined();
  });

  it('clears a table without deleting its guests', () => {
    const plan = clearTable(twoTables(), 't1');

    expect(guestsAt(plan, 't1')).toEqual([]);
    expect(plan.guests).toHaveLength(3);
    expect(unseatedGuests(plan)).toHaveLength(2);
  });

  it('moves everyone between two tables, keeping seat indices', () => {
    const plan = moveTableGuests(twoTables(), 't1', 't2');

    expect(guestsAt(plan, 't2').map((g) => g.id)).toEqual(['a', 'b']);
    expect(guestsAt(plan, 't1').map((g) => g.id)).toEqual(['c']);
    expect(findGuest(plan, 'b')?.seat?.seatIndex).toBe(1);
  });

  it('moves guests back exactly when the move is repeated', () => {
    const before = twoTables();
    const there = moveTableGuests(before, 't1', 't2');
    expect(moveTableGuests(there, 't1', 't2')).toEqual(before);
  });

  it('is a no-op moving a table onto itself', () => {
    const plan = twoTables();
    expect(moveTableGuests(plan, 't1', 't1')).toBe(plan);
  });

  it('counts seated guests', () => {
    expect(seatedCount(twoTables())).toBe(3);
  });
});

describe('groups', () => {
  function withGroup(): SeatingPlan {
    return {
      ...createSeatingPlan(),
      groups: [{ id: 'acme', name: 'Acme Catering', keepTogether: true }],
      guests: [
        createGuest('a', 'Amara', { groupId: 'acme' }),
        createGuest('h', 'Hana', { groupId: 'acme', isHost: true }),
        createGuest('z', 'Zed', { groupId: null }),
      ],
    };
  }

  it('lists the host first, since their seat decides where the group goes', () => {
    expect(groupMembers(withGroup(), 'acme').map((g) => g.id)).toEqual(['h', 'a']);
  });

  it('finds the host', () => {
    expect(groupHost(withGroup(), 'acme')?.name).toBe('Hana');
  });

  it('has no host when none is flagged', () => {
    const plan = {
      ...withGroup(),
      guests: withGroup().guests.map((g) => ({ ...g, isHost: false })),
    };
    expect(groupHost(plan, 'acme')).toBeUndefined();
  });

  it('reports the groups represented at a table', () => {
    let plan = withGroup();
    plan = seatGuest(plan, 'h', seat('t1', 0));
    plan = seatGuest(plan, 'z', seat('t1', 1));

    expect(groupsAt(plan, 't1').map((g) => g.id)).toEqual(['acme']);
  });
});

describe('separations', () => {
  const plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));

  it('records a rule in both directions', () => {
    const withRule = addSeparation(plan, 'a', 'b', 'divorced');
    expect(areSeparated(withRule, 'a', 'b')).toBe(true);
    expect(areSeparated(withRule, 'b', 'a')).toBe(true);
  });

  it('ignores a duplicate, however it is ordered', () => {
    let withRule = addSeparation(plan, 'a', 'b');
    withRule = addSeparation(withRule, 'b', 'a');
    expect(withRule.separations).toHaveLength(1);
  });

  it('refuses to separate a guest from themselves', () => {
    expect(addSeparation(plan, 'a', 'a').separations).toEqual([]);
  });

  it('removes a rule in either direction', () => {
    const withRule = addSeparation(plan, 'a', 'b');
    expect(removeSeparation(withRule, 'b', 'a').separations).toEqual([]);
  });

  it('reports a conflict when two separated guests share a table', () => {
    let p = addSeparation(plan, 'a', 'b', 'divorced');
    p = seatGuest(p, 'a', seat('t1', 0));
    p = seatGuest(p, 'b', seat('t1', 4));

    const conflicts = seatingConflicts(p);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.elementId).toBe('t1');
    expect(conflicts[0]?.reason).toBe('divorced');
  });

  it('reports nothing when they sit at different tables', () => {
    let p = addSeparation(plan, 'a', 'b');
    p = seatGuest(p, 'a', seat('t1', 0));
    p = seatGuest(p, 'b', seat('t2', 0));

    expect(seatingConflicts(p)).toEqual([]);
  });

  it('reports nothing while either guest is unseated', () => {
    let p = addSeparation(plan, 'a', 'b');
    p = seatGuest(p, 'a', seat('t1', 0));
    expect(seatingConflicts(p)).toEqual([]);
  });
});

describe('pruning orphaned assignments', () => {
  // Shrinking a table from ten seats to eight leaves the guest in seat 9
  // pointing at nothing. They must become unseated rather than disappear.

  it('unseats a guest whose seat no longer exists', () => {
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 2));
    plan = seatGuest(plan, 'b', seat('t1', 9));

    const result = pruneAssignments(plan, new Map([['t1', 8]]));

    expect(findGuest(result.plan, 'a')?.seat).toEqual(seat('t1', 2));
    expect(findGuest(result.plan, 'b')?.seat).toBeNull();
  });

  it('reports who was orphaned, so the UI can say so', () => {
    let plan = planWith(createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'b', seat('t1', 9));

    const result = pruneAssignments(plan, new Map([['t1', 8]]));
    expect(result.orphaned.map((g) => g.id)).toEqual(['b']);
  });

  it('unseats everyone at a table that no longer exists', () => {
    let plan = planWith(createGuest('a', 'Amara'));
    plan = seatGuest(plan, 'a', seat('deleted', 0));

    const result = pruneAssignments(plan, new Map());
    expect(findGuest(result.plan, 'a')?.seat).toBeNull();
    expect(result.orphaned).toHaveLength(1);
  });

  it('never deletes a guest', () => {
    let plan = planWith(createGuest('a', 'Amara'));
    plan = seatGuest(plan, 'a', seat('gone', 0));

    expect(pruneAssignments(plan, new Map()).plan.guests).toHaveLength(1);
  });

  it('leaves a valid plan untouched', () => {
    let plan = planWith(createGuest('a', 'Amara'));
    plan = seatGuest(plan, 'a', seat('t1', 0));

    const result = pruneAssignments(plan, new Map([['t1', 8]]));
    expect(result.orphaned).toEqual([]);
    expect(result.plan.guests).toEqual(plan.guests);
  });
});

describe('the assignment lock', () => {
  // Separate from an element's own lock: furniture still being moved can have
  // settled seating, and settled furniture can have open seating.

  function locked(): SeatingPlan {
    let plan = planWith(createGuest('a', 'Amara'), createGuest('b', 'Ben'));
    plan = seatGuest(plan, 'a', seat('t1', 0));
    return { ...plan, assignmentsLocked: true };
  }

  it('refuses to seat', () => {
    const plan = locked();
    expect(seatGuest(plan, 'b', seat('t1', 1))).toBe(plan);
  });

  it('refuses to unseat', () => {
    const plan = locked();
    expect(unseatGuest(plan, 'a')).toBe(plan);
  });

  it('refuses to swap', () => {
    const plan = locked();
    expect(swapSeats(plan, 'a', 'b')).toBe(plan);
  });

  it('refuses to clear a table', () => {
    const plan = locked();
    expect(clearTable(plan, 't1')).toBe(plan);
  });

  it('refuses to move guests between tables', () => {
    const plan = locked();
    expect(moveTableGuests(plan, 't1', 't2')).toBe(plan);
  });

  it('still prunes orphans, because those seats genuinely stopped existing', () => {
    // The lock protects against reorganisation, not against reality. A seat
    // that no longer exists cannot be honoured whatever the lock says.
    const plan = locked();
    const result = pruneAssignments(plan, new Map());
    expect(result.orphaned).toHaveLength(1);
  });
});
