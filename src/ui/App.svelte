<script lang="ts">
  import { formatLength, MM_PER_INCH } from '$lib/geometry/units';

  // Phase 0 placeholder: proves the geometry core is wired into the app shell.
  // Replaced by the real editor in Phase 3.
  const demoLengthMm = 60 * MM_PER_INCH; // a 60" round table
</script>

<main>
  <h1>Floored</h1>
  <p class="tagline">Event floor planning that stays free, works offline, and prints to scale.</p>
  <p class="proof">
    Geometry core online — 60&quot; round table reads as
    <strong>{formatLength(demoLengthMm, 'imperial')}</strong> /
    <strong>{formatLength(demoLengthMm, 'metric')}</strong>.
  </p>
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 4rem 1.5rem;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: clamp(2.5rem, 1.5rem + 4vw, 4rem);
    letter-spacing: -0.03em;
  }
  .tagline {
    margin: 0 0 2rem;
    color: var(--color-muted);
    font-size: 1.125rem;
  }
  .proof {
    padding: 1rem;
    border: 1px solid var(--color-line);
    border-radius: 0.5rem;
    font-size: 0.9375rem;
  }
</style>
