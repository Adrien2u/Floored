import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  catalogItem,
  catalogByCategory,
  suggestedDancefloorSideMm,
  suggestedBarCount,
  SEAT_PITCH_MM,
  ROW_PITCH_MM,
} from './catalog';
import { seatCount, elementBounds, seatingBlockSize } from '$lib/document/element';
import { inches, feet, toInches } from '$lib/geometry/units';
import { CLEARANCE } from '$lib/geometry/clearance';

const at = { x: 5000, y: 5000 };

describe('the catalog matches the sourced dimensions', () => {
  // These figures come from docs/RESEARCH.md §3. A planner checks them within a
  // minute of opening the app, so they are asserted rather than trusted.

  it('sizes a 60-inch round correctly and seats 8', () => {
    const item = catalogItem('round-60');
    expect(item).toBeDefined();
    if (!item) return;

    const element = item.create('x', at);
    expect(element.type === 'roundTable' && element.diameterMm).toBe(inches(60));
    expect(seatCount(element)).toBe(8);
  });

  it('seats a 72-inch round at 10', () => {
    const element = catalogItem('round-72')?.create('x', at);
    expect(element?.type === 'roundTable' && element.diameterMm).toBe(inches(72));
    expect(element && seatCount(element)).toBe(10);
  });

  it('sizes an 8ft banquet table at 96 by 30 inches, seating 8', () => {
    const element = catalogItem('banquet-8')?.create('x', at);
    expect(element?.type === 'rectTable' && element.widthMm).toBe(inches(96));
    expect(element?.type === 'rectTable' && element.depthMm).toBe(inches(30));
    expect(element && seatCount(element)).toBe(8);
  });

  it('gives a cocktail round no seated cover', () => {
    // Standing height: guests gather, they do not dine. Counting it as seating
    // would overstate the plan's capacity.
    const element = catalogItem('cocktail-36')?.create('x', at);
    expect(element?.type === 'roundTable' && element.diameterMm).toBe(inches(36));
  });

  it('uses seat and row pitches that clear the ADA minimum', () => {
    expect(SEAT_PITCH_MM).toBe(inches(22));
    expect(ROW_PITCH_MM).toBe(inches(36));
    // Row spacing must at least equal an accessible route.
    expect(ROW_PITCH_MM).toBeGreaterThanOrEqual(CLEARANCE.adaAisleMin);
  });
});

describe('placement', () => {
  it('centres a round table on the pointer', () => {
    const element = catalogItem('round-60')?.create('x', at);
    expect(element?.type === 'roundTable' && element.center).toEqual(at);
  });

  it('centres a rectangular table on the pointer too', () => {
    // Dropping an object should put it where the pointer is, not hang it off
    // the corner — the difference is obvious the first time it is wrong.
    const element = catalogItem('banquet-8')?.create('x', at);
    expect(element).toBeDefined();
    if (!element) return;

    const bounds = elementBounds(element);
    expect(bounds.x + bounds.width / 2).toBe(at.x);
    expect(bounds.y + bounds.height / 2).toBe(at.y);
  });

  it('gives every catalog item a distinct id', () => {
    const ids = CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates an unlocked element on the furniture layer', () => {
    for (const item of CATALOG) {
      const element = item.create('x', at);
      expect(element.locked).toBe(false);
      expect(element.layer).toBe('furniture');
    }
  });

  it('creates elements that survive a JSON round trip', () => {
    for (const item of CATALOG) {
      const element = item.create('x', at);
      expect(JSON.parse(JSON.stringify(element))).toEqual(element);
    }
  });
});

describe('seating blocks', () => {
  it('counts rows times columns', () => {
    const element = catalogItem('ceremony-block')?.create('x', at);
    expect(element && seatCount(element)).toBe(48);
  });

  it('sizes a theatre block at 120 seats', () => {
    const element = catalogItem('theatre-block')?.create('x', at);
    expect(element && seatCount(element)).toBe(120);
  });

  it('measures the block from seat centres plus one seat', () => {
    const element = catalogItem('ceremony-block')?.create('x', at);
    expect(element?.type).toBe('seatingBlock');
    if (element?.type !== 'seatingBlock') return;

    const size = seatingBlockSize(element);
    // 8 columns at 22" centres spans 7 gaps, plus a seat's own width.
    expect(size.widthMm).toBe(7 * inches(22) + 457);
    expect(size.depthMm).toBe(5 * inches(36) + 457);
  });

  it('keeps a 120-seat block to a handful of elements, not 120', () => {
    // The whole point of ADR-0012.
    const element = catalogItem('theatre-block')?.create('x', at);
    expect(element).toBeDefined();
    expect(element && seatCount(element)).toBe(120);
  });
});

describe('categories', () => {
  it('groups items for the catalog rail', () => {
    expect(catalogByCategory('table').length).toBeGreaterThan(0);
    expect(catalogByCategory('seating').length).toBeGreaterThan(0);
    expect(catalogByCategory('fixture').length).toBeGreaterThan(0);
  });

  it('returns nothing for an unknown id rather than throwing', () => {
    expect(catalogItem('nope')).toBeUndefined();
  });
});

describe('planning guides', () => {
  it('sizes a dancefloor from the guest count', () => {
    // 150 guests: about 50 dancing, 4.5 sq ft each = 225 sq ft = a 15ft square,
    // rounded up to whole 3ft panels.
    const side = suggestedDancefloorSideMm(150);
    expect(toInches(side) / 12).toBeCloseTo(15, 0);
  });

  it('rounds a dancefloor up to whole 3ft panels', () => {
    // 200 guests: ~67 dancing at 4.5 sq ft each = 300 sq ft, a 17.3ft square,
    // rounded up to six panels.
    //
    // Compared against feet(18) rather than by taking a modulo of the converted
    // value: feet(18) stores as 5486 mm (304.8 x 18 = 5486.4), so converting
    // back yields 17.9987 ft and no modulo of it is ever exactly zero. That is
    // ADR-0006 quantization, not a bug — but it means imperial assertions have
    // to be made against the constructor, not against a round-trip.
    expect(suggestedDancefloorSideMm(200)).toBe(feet(18));
  });

  it('returns nothing for no guests', () => {
    expect(suggestedDancefloorSideMm(0)).toBe(0);
    expect(suggestedBarCount(0)).toBe(0);
  });

  it('suggests at least one bar for any event', () => {
    expect(suggestedBarCount(20)).toBe(1);
    expect(suggestedBarCount(150)).toBe(1);
  });

  it('adds a bar per 150 guests', () => {
    expect(suggestedBarCount(300)).toBe(2);
    expect(suggestedBarCount(450)).toBe(3);
  });

  it('sizes the catalog dancefloor consistently with its own guide', () => {
    // The 16ft dancefloor in the catalog should suit a mid-size event.
    const element = catalogItem('dancefloor-16')?.create('x', at);
    expect(element?.type === 'fixture' && element.widthMm).toBe(feet(16));
  });
});
