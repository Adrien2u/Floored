import { describe, it, expect } from 'vitest';
import { autoAssign, assignGroupToTable, type TableCapacity } from './assign';
import {
  createSeatingPlan,
  createGuest,
  seatGuest,
  addSeparation,
  guestsAt,
  unseatedGuests,
  seatingConflicts,
  findGuest,
  type SeatingPlan,
} from './guest';

const tables = (...spec: [string, number][]): TableCapacity[] =>
  spec.map(([elementId, seats]) => ({ elementId, seats }));

function planOf(
  guests: { id: string; name: string; group?: string; host?: boolean }[]
): SeatingPlan {
  const groupNames = [...new Set(guests.map((g) => g.group).filter((g): g is string => !!g))];

  return {
    ...createSeatingPlan(),
    groups: groupNames.map((name) => ({ id: name, name, keepTogether: true })),
    guests: guests.map((g) =>
      createGuest(g.id, g.name, { groupId: g.group ?? null, isHost: g.host ?? false })
    ),
  };
}

describe('filling seats', () => {
  it('seats everyone when there is room', () => {
    const plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cass' },
    ]);

    const result = autoAssign(plan, tables(['t1', 8]));
    expect(result.seated).toBe(3);
    expect(unseatedGuests(result.plan)).toEqual([]);
  });

  it('reports who it could not seat, rather than dropping them', () => {
    const plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cass' },
    ]);

    const result = autoAssign(plan, tables(['t1', 2]));
    expect(result.seated).toBe(2);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]?.reason).toContain('No seats');
  });

  it('leaves an empty plan alone', () => {
    const result = autoAssign(createSeatingPlan(), tables(['t1', 8]));
    expect(result.seated).toBe(0);
    expect(result.unplaced).toEqual([]);
  });

  it('does nothing when there are no tables', () => {
    const plan = planOf([{ id: 'a', name: 'Amara' }]);
    const result = autoAssign(plan, []);
    expect(result.seated).toBe(0);
    expect(result.unplaced).toHaveLength(1);
  });
});

describe('never disturbing what the planner already decided', () => {
  // An algorithm that reorganises finished work to improve its own score gets
  // abandoned after one use.

  it('leaves seated guests exactly where they are', () => {
    let plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
    ]);
    plan = seatGuest(plan, 'a', { elementId: 't2', seatIndex: 5 });

    const result = autoAssign(plan, tables(['t1', 8], ['t2', 8]));
    expect(findGuest(result.plan, 'a')?.seat).toEqual({ elementId: 't2', seatIndex: 5 });
  });

  it('fills around an occupied seat rather than over it', () => {
    let plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
      { id: 'c', name: 'Cass' },
    ]);
    plan = seatGuest(plan, 'a', { elementId: 't1', seatIndex: 0 });

    const result = autoAssign(plan, tables(['t1', 3]));
    const seatIndices = guestsAt(result.plan, 't1').map((g) => g.seat?.seatIndex);
    expect(new Set(seatIndices).size).toBe(3);
  });

  it('does nothing at all when assignments are locked', () => {
    const plan = { ...planOf([{ id: 'a', name: 'Amara' }]), assignmentsLocked: true };
    const result = autoAssign(plan, tables(['t1', 8]));

    expect(result.plan).toBe(plan);
    expect(result.seated).toBe(0);
  });
});

describe('groups', () => {
  it('seats a group together at one table', () => {
    const plan = planOf([
      { id: 'a', name: 'Amara', group: 'Acme' },
      { id: 'b', name: 'Ben', group: 'Acme' },
      { id: 'c', name: 'Cass', group: 'Acme' },
    ]);

    const result = autoAssign(plan, tables(['t1', 8], ['t2', 8]));
    const t1 = guestsAt(result.plan, 't1').length;
    const t2 = guestsAt(result.plan, 't2').length;
    expect(Math.max(t1, t2)).toBe(3);
    expect(Math.min(t1, t2)).toBe(0);
  });

  it('places the largest group first, so it is not left with scraps', () => {
    const plan = planOf([
      { id: 's1', name: 'Solo' },
      { id: 'a', name: 'A', group: 'Big' },
      { id: 'b', name: 'B', group: 'Big' },
      { id: 'c', name: 'C', group: 'Big' },
      { id: 'd', name: 'D', group: 'Big' },
    ]);

    // Two tables of four: the group of four must take one whole table.
    const result = autoAssign(plan, tables(['t1', 4], ['t2', 4]));
    expect(result.seated).toBe(5);

    const bigTable = ['t1', 't2'].find((t) => guestsAt(result.plan, t).length === 4);
    expect(bigTable).toBeDefined();
  });

  it('refuses to split a group by default, and says so', () => {
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'b', name: 'B', group: 'Acme' },
      { id: 'c', name: 'C', group: 'Acme' },
    ]);

    const result = autoAssign(plan, tables(['t1', 2], ['t2', 2]));
    expect(result.seated).toBe(0);
    expect(result.unplaced).toHaveLength(3);
    expect(result.unplaced[0]?.reason).toContain('3 seats free together');
  });

  it('splits a group when explicitly allowed, and reports it', () => {
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'b', name: 'B', group: 'Acme' },
      { id: 'c', name: 'C', group: 'Acme' },
    ]);

    const result = autoAssign(plan, tables(['t1', 2], ['t2', 2]), {
      keepGroupsTogether: false,
    });

    expect(result.seated).toBe(3);
    expect(result.splitGroups).toContain('Acme');
  });

  it('prefers the table that fits the group most snugly', () => {
    // Leaving a ten-seat table half empty to seat a pair is how a room runs
    // out of tables with people still standing.
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Pair' },
      { id: 'b', name: 'B', group: 'Pair' },
    ]);

    const result = autoAssign(plan, tables(['big', 10], ['small', 2]));
    expect(guestsAt(result.plan, 'small')).toHaveLength(2);
    expect(guestsAt(result.plan, 'big')).toHaveLength(0);
  });

  it('seats the host first within their group', () => {
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'h', name: 'Host', group: 'Acme', host: true },
    ]);

    const result = autoAssign(plan, tables(['t1', 8]));
    expect(guestsAt(result.plan, 't1')[0]?.id).toBe('h');
  });
});

describe('separations', () => {
  it('never seats two separated guests at the same table', () => {
    let plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
    ]);
    plan = addSeparation(plan, 'a', 'b', 'divorced');

    const result = autoAssign(plan, tables(['t1', 8], ['t2', 8]));
    expect(result.seated).toBe(2);
    expect(seatingConflicts(result.plan)).toEqual([]);
  });

  it('leaves a guest unseated rather than breaking a rule', () => {
    let plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
    ]);
    plan = addSeparation(plan, 'a', 'b');

    // Only one table: the second guest cannot be placed without a conflict.
    const result = autoAssign(plan, tables(['t1', 8]));
    expect(result.seated).toBe(1);
    expect(result.unplaced[0]?.reason).toContain('separation');
  });

  it('respects a rule against someone already seated', () => {
    let plan = planOf([
      { id: 'a', name: 'Amara' },
      { id: 'b', name: 'Ben' },
    ]);
    plan = addSeparation(plan, 'a', 'b');
    plan = seatGuest(plan, 'a', { elementId: 't1', seatIndex: 0 });

    const result = autoAssign(plan, tables(['t1', 8], ['t2', 8]));
    expect(findGuest(result.plan, 'b')?.seat?.elementId).toBe('t2');
  });

  it('will not seat a group at a table that conflicts', () => {
    let plan = planOf([
      { id: 'x', name: 'Ex' },
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'b', name: 'B', group: 'Acme' },
    ]);
    plan = addSeparation(plan, 'x', 'a');
    plan = seatGuest(plan, 'x', { elementId: 't1', seatIndex: 0 });

    const result = autoAssign(plan, tables(['t1', 8], ['t2', 8]));
    expect(guestsAt(result.plan, 't2')).toHaveLength(2);
    expect(seatingConflicts(result.plan)).toEqual([]);
  });
});

describe('assigning a group to a chosen table', () => {
  it('seats the whole group there', () => {
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'b', name: 'B', group: 'Acme' },
    ]);

    const result = assignGroupToTable(plan, 'Acme', { elementId: 't4', seats: 8 });
    expect(guestsAt(result.plan, 't4')).toHaveLength(2);
  });

  it('seats the host first, so the seat that matters fills before the table does', () => {
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'h', name: 'Host', group: 'Acme', host: true },
    ]);

    const result = assignGroupToTable(plan, 'Acme', { elementId: 't4', seats: 8 });
    expect(guestsAt(result.plan, 't4')[0]?.id).toBe('h');
  });

  it('reports who did not fit', () => {
    const plan = planOf([
      { id: 'a', name: 'A', group: 'Acme' },
      { id: 'b', name: 'B', group: 'Acme' },
      { id: 'c', name: 'C', group: 'Acme' },
    ]);

    const result = assignGroupToTable(plan, 'Acme', { elementId: 't4', seats: 2 });
    expect(result.seated).toBe(2);
    expect(result.unplaced[0]?.reason).toBe('Table is full');
  });

  it('does nothing when assignments are locked', () => {
    const plan = { ...planOf([{ id: 'a', name: 'A', group: 'Acme' }]), assignmentsLocked: true };
    expect(assignGroupToTable(plan, 'Acme', { elementId: 't4', seats: 8 }).plan).toBe(plan);
  });
});

describe('a realistic run', () => {
  it('seats a 60-guest list of mixed groups across eight tables', () => {
    const guests: { id: string; name: string; group?: string; host?: boolean }[] = [];

    // Six companies of varying size, plus singles.
    const sizes = [8, 6, 5, 4, 3, 2];
    sizes.forEach((size, g) => {
      for (let i = 0; i < size; i++) {
        guests.push({
          id: `g${String(g)}-${String(i)}`,
          name: `Guest ${String(g)}-${String(i)}`,
          group: `Company ${String(g)}`,
          host: i === 0,
        });
      }
    });
    for (let i = 0; i < 32; i++) guests.push({ id: `s${String(i)}`, name: `Single ${String(i)}` });

    const plan = planOf(guests);
    const room = tables(
      ...Array.from({ length: 8 }, (_, i) => [`t${String(i)}`, 8] as [string, number])
    );

    const result = autoAssign(plan, room);

    expect(result.seated).toBe(60);
    expect(unseatedGuests(result.plan)).toEqual([]);
    expect(result.splitGroups).toEqual([]);
    expect(seatingConflicts(result.plan)).toEqual([]);

    // No table over its capacity.
    for (let i = 0; i < 8; i++) {
      expect(guestsAt(result.plan, `t${String(i)}`).length).toBeLessThanOrEqual(8);
    }
  });
});
