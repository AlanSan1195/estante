import { usePwa } from './pwaStore';

let registered = false;

/**
 * Registra `/sw.js` (solo en producción: en `astro dev` cachear módulos de Vite rompería la
 * recarga) y avisa cuando hay una versión nueva esperando. El nuevo SW no toma el control hasta
 * que el usuario pulsa "Actualizar": así no cambia el código a mitad de una lectura.
 */
export function registerServiceWorker(): void {
  if (registered || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  registered = true;

  const offerUpdate = (worker: ServiceWorker) => {
    usePwa.getState().setUpdate(() => {
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => {
      // Ya había uno nuevo esperando (se descargó en una visita anterior).
      if (registration.waiting && navigator.serviceWorker.controller) {
        offerUpdate(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // Sin controlador es la primera instalación: no hay nada que "actualizar".
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            offerUpdate(installing);
          }
        });
      });
      // Al volver a la app tras un rato, comprobar si se publicó algo nuevo.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    })
    .catch(() => {
      // Sin SW la app funciona igual, solo que sin lectura offline.
    });
}
