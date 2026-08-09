import { describe, it, expect } from 'vitest';
import { safeFilename } from './download';

describe('safeFilename', () => {
  it('uses the plan name', () => {
    expect(safeFilename('Spring Gala', 'pdf')).toBe('Spring-Gala.pdf');
  });

  it('strips characters an operating system would refuse', () => {
    // Every one of these is illegal in a filename somewhere, and users type
    // them into event names without a second thought.
    expect(safeFilename('Smith/Jones: 50th?', 'pdf')).toBe('SmithJones-50th.pdf');
  });

  it('collapses whitespace rather than leaving gaps', () => {
    expect(safeFilename('The   Autumn    Ball', 'svg')).toBe('The-Autumn-Ball.svg');
  });

  it('trims leading and trailing dots and dashes', () => {
    // A leading dot makes the file hidden on Unix; a trailing dot is invalid
    // on Windows.
    expect(safeFilename('...Gala...', 'pdf')).toBe('Gala.pdf');
  });

  it('falls back to a generic name when nothing usable is left', () => {
    expect(safeFilename('///', 'pdf')).toBe('floor-plan.pdf');
    expect(safeFilename('', 'floored')).toBe('floor-plan.floored');
  });

  it('caps the length, since some filesystems will not take an essay', () => {
    const long = 'a'.repeat(200);
    const result = safeFilename(long, 'pdf');
    expect(result.length).toBeLessThanOrEqual(84);
  });

  it('keeps unicode a filesystem can handle', () => {
    expect(safeFilename('Fête d’été', 'pdf')).toBe('Fête-d’été.pdf');
  });
});
