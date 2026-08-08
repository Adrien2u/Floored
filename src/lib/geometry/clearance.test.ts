import { describe, it, expect } from 'vitest';
import {
  CLEARANCE,
  OCCUPANT_LOAD_SQ_FT,
  gapBetweenCircles,
  gradeTableGap,
  gradeAisle,
  occupantLoad,
  seatingCapacityByArea,
} from './clearance';
import { inches, feet } from './units';
import { area } from './polygon';

const p = (x: number, y: number) => ({ x, y });

describe('published constants', () => {
  it('matches the sourced values in RESEARCH.md', () => {
    expect(CLEARANCE.adaAisleMin).toBe(inches(36));
    expect(CLEARANCE.serviceAisle).toBe(inches(60));
    expect(CLEARANCE.betweenTablesMin).toBe(inches(54));
    expect(CLEARANCE.betweenTablesComfortable).toBe(inches(60));
    expect(CLEARANCE.betweenTablesGenerous).toBe(inches(72));
    expect(CLEARANCE.adaKneeClearance).toBe(inches(27));
  });

  it('uses the NFPA 101 occupant load factors', () => {
    expect(OCCUPANT_LOAD_SQ_FT.unconcentrated).toBe(15);
    expect(OCCUPANT_LOAD_SQ_FT.concentrated).toBe(7);
  });
});

describe('gapBetweenCircles', () => {
  const r = inches(60) / 2;

  it('measures edge to edge, not centre to centre', () => {
    // Two 60" rounds with centres 120" apart leave a 60" gap.
    expect(gapBetweenCircles(p(0, 0), r, p(inches(120), 0), r)).toBe(inches(60));
  });

  it('returns zero when tables touch', () => {
    expect(gapBetweenCircles(p(0, 0), r, p(inches(60), 0), r)).toBe(0);
  });

  it('returns a negative gap when tables overlap', () => {
    expect(gapBetweenCircles(p(0, 0), r, p(inches(40), 0), r)).toBeLessThan(0);
  });

  it('works on the diagonal', () => {
    const gap = gapBetweenCircles(p(0, 0), r, p(3000, 4000), r);
    expect(gap).toBe(5000 - inches(60));
  });
});

describe('gradeTableGap', () => {
  it('flags anything under 54 inches as a violation', () => {
    const result = gradeTableGap(inches(48));
    expect(result.severity).toBe('violation');
    expect(result.requiredMm).toBe(inches(54));
  });

  it('calls 54 to 60 inches tight', () => {
    expect(gradeTableGap(inches(54)).severity).toBe('tight');
    expect(gradeTableGap(inches(57)).severity).toBe('tight');
  });

  it('accepts 60 inches and above', () => {
    expect(gradeTableGap(inches(60)).severity).toBe('ok');
    expect(gradeTableGap(inches(72)).severity).toBe('ok');
  });

  it('does not attach a requirement when the gap passes', () => {
    expect(gradeTableGap(inches(60)).requiredMm).toBeUndefined();
  });

  it('treats overlap as a violation too', () => {
    expect(gradeTableGap(-100).severity).toBe('violation');
  });
});

describe('gradeAisle', () => {
  it('treats the ADA minimum as the hard floor', () => {
    expect(gradeAisle(inches(35)).severity).toBe('violation');
    expect(gradeAisle(inches(36)).severity).toBe('tight');
  });

  it('wants 60 inches for service and egress', () => {
    expect(gradeAisle(inches(59)).severity).toBe('tight');
    expect(gradeAisle(inches(60)).severity).toBe('ok');
  });
});

describe('occupantLoad', () => {
  it('estimates a real 60 x 40 ft ballroom at 160 people', () => {
    const room = [p(0, 0), p(feet(60), 0), p(feet(60), feet(40)), p(0, feet(40))];
    // 2400 sq ft / 15 = 160
    expect(occupantLoad(area(room))).toBe(160);
  });

  it('gives a higher load for concentrated use', () => {
    const room = [p(0, 0), p(feet(60), 0), p(feet(60), feet(40)), p(0, feet(40))];
    expect(occupantLoad(area(room), 'concentrated')).toBe(342);
  });

  it('rounds down, because a life-safety limit is never rounded up', () => {
    // 2399 sq ft / 15 = 159.93 -> 159
    const almost = feet(59.975) * feet(40);
    expect(occupantLoad(almost)).toBe(159);
  });

  it('returns zero for zero or negative area', () => {
    expect(occupantLoad(0)).toBe(0);
    expect(occupantLoad(-500)).toBe(0);
  });
});

describe('seatingCapacityByArea', () => {
  it('seats fewer guests than the occupant load allows', () => {
    const room = [p(0, 0), p(feet(60), 0), p(feet(60), feet(40)), p(0, feet(40))];
    const areaMm2 = area(room);
    // 2400 / 12 = 200 comfortable, 2400 / 10 = 240 minimum.
    expect(seatingCapacityByArea(areaMm2)).toBe(200);
    expect(seatingCapacityByArea(areaMm2, 'min')).toBe(240);
  });

  it('returns zero for an empty room', () => {
    expect(seatingCapacityByArea(0)).toBe(0);
  });
});
