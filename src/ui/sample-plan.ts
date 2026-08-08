/**
 * A sample plan, for exercising the renderer before the editing tools exist.
 *
 * Real dimensions throughout — a 60 × 40 ft ballroom laid out the way a planner
 * would: stage at the top, dancefloor centred, tables around it, bar on the
 * left. Rendering something plausible is what makes the output judgeable.
 *
 * Phase 8 replaces this with the real template set.
 */

import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';

const TABLE_DIAMETER = inches(60);
const SEATS_PER_TABLE = 8;

export function sampleBallroom(): FlooredDocument {
  const roomW = feet(60);
  const roomH = feet(40);

  let doc = createDocument({
    name: 'Spring Gala',
    eventDate: '2026-05-16',
    unitSystem: 'imperial',
  });

  doc = addElement(doc, {
    id: 'room',
    type: 'room',
    layer: 'room',
    rotationDeg: 0,
    locked: true,
    label: 'Ballroom',
    points: [
      { x: 0, y: 0 },
      { x: roomW, y: 0 },
      { x: roomW, y: roomH },
      { x: 0, y: roomH },
    ],
  });

  const fixtures: FloorElement[] = [
    {
      id: 'stage',
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: 'Stage',
      kind: 'stage',
      origin: { x: roomW / 2 - feet(10), y: feet(1) },
      widthMm: feet(20),
      depthMm: feet(5),
    },
    {
      id: 'dancefloor',
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: 'Dancefloor',
      kind: 'dancefloor',
      origin: { x: roomW / 2 - feet(8), y: roomH / 2 - feet(8) },
      widthMm: feet(16),
      depthMm: feet(16),
    },
    {
      id: 'bar',
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: 'Bar',
      kind: 'bar',
      origin: { x: feet(1), y: roomH / 2 - feet(6) },
      widthMm: feet(4),
      depthMm: feet(12),
    },
  ];

  for (const fixture of fixtures) doc = addElement(doc, fixture);

  // Tables ringing the dancefloor, spaced so the gaps clear the 54" minimum.
  const positions: { x: number; y: number }[] = [];
  const columns = [feet(8), feet(18), roomW / 2, roomW - feet(18), roomW - feet(8)];
  const rows = [feet(10), roomH - feet(10)];

  for (const y of rows) {
    for (const x of columns) {
      // Leave the dancefloor clear.
      const nearCentre = Math.abs(x - roomW / 2) < feet(10) && Math.abs(y - roomH / 2) < feet(12);
      if (!nearCentre) positions.push({ x, y });
    }
  }

  positions.forEach((center, i) => {
    doc = addElement(doc, {
      id: `t${String(i + 1)}`,
      type: 'roundTable',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: `T${String(i + 1)}`,
      center,
      diameterMm: TABLE_DIAMETER,
      seats: SEATS_PER_TABLE,
    });
  });

  return doc;
}
