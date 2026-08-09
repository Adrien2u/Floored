/**
 * Service worker registration.
 *
 * Two rules, both from ADR-0008. The app must open with no network, and it must
 * **never** reload itself: a silent refresh mid-edit is data loss, and the plan
 * in front of the user is the only copy they can see.
 *
 * So an update is offered, not applied. The waiting worker sits there until the
 * user says yes.
 */

export interface UpdateHandle {
  /** Take the new version now. Reloads once the worker has taken control. */
  apply(): void;
}

export interface RegisterOptions {
  /** Called when a new version is downloaded and waiting. */
  onUpdateReady?: (handle: UpdateHandle) => void;
  /** Called once the app is cached and would open offline. */
  onOfflineReady?: () => void;
}

/** Where the worker lives, relative to the page — the app may not be at a root. */
const SCRIPT_URL = './sw.js';

export function registerServiceWorker(options: RegisterOptions = {}): void {
  if (!('serviceWorker' in navigator)) return;

  // Registration is deferred to load so it never competes with the first paint
  // for bandwidth on the visit that matters most.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(SCRIPT_URL).then((registration) => {
      if (registration.waiting) {
        offer(registration, options);
      }

      if (registration.active && !navigator.serviceWorker.controller) {
        // Active but not controlling this page: the shell is cached, and the
        // next visit opens offline.
        options.onOfflineReady?.();
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installed') return;

          if (navigator.serviceWorker.controller) {
            offer(registration, options);
          } else {
            options.onOfflineReady?.();
          }
        });
      });
    });
  });
}

function offer(registration: ServiceWorkerRegistration, options: RegisterOptions): void {
  options.onUpdateReady?.({
    apply() {
      const waiting = registration.waiting;
      if (!waiting) {
        window.location.reload();
        return;
      }

      // Reload only once the new worker is in charge, so the page that comes
      // back is the new version rather than the old one served from cache.
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.location.reload();
        },
        { once: true }
      );

      waiting.postMessage('SKIP_WAITING');
    },
  });
}
