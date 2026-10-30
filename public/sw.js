/*
 * Service worker de Estante.
 *
 *  - App shell: páginas, JS/CSS, fuentes latinas, iconos, catálogo y portadas, precargados en
 *    `shell-<versión>`. La versión y la lista las escribe el build (src/integration/precache.ts).
 *  - Navegación: red primero; sin red, la copia del shell; si tampoco hay, /offline/.
 *  - Libros descargados: `books-<slug>`, cache-first. Solo se guardan al pulsar "Descargar" en la
 *    Biblioteca; `?offline=<hash>` fuerza la red para descargar o actualizar.
 */

// El build reemplaza esta línea por la lista real. En `astro dev` el SW no se registra.
const PRECACHE = /* __ESTANTE_PRECACHE__ */ { version: 'dev', files: [] };

const SHELL = `shell-${PRECACHE.version}`;
const SHELL_PREFIX = 'shell-';
const BOOKS_PREFIX = 'books-';
const OFFLINE_URL = '/offline/';
/** Con red lenta no se espera indefinidamente: pasado este tiempo se sirve la copia del shell. */
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await Promise.all(
        PRECACHE.files.map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) throw new Error(`No se pudo precargar ${url} (${response.status})`);
          await cache.put(url, await withoutRedirect(response));
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(SHELL_PREFIX) && name !== SHELL)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// La página pide activar la versión nueva cuando el usuario pulsa "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request, url));
  } else if (url.pathname.startsWith('/books/')) {
    event.respondWith(bookFile(request, url));
  } else if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(immutable(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

async function navigate(request, url) {
  const network = fetch(request);
  network.catch(() => {}); // si gana la copia del shell, el fallo posterior de la red no importa
  try {
    const cached = await shellPage(url.pathname);
    if (!cached) return await network;
    return await Promise.race([network, delay(NAVIGATION_TIMEOUT_MS).then(() => cached)]);
  } catch {
    // Sin red: el lector de un libro que no está descargado no podría mostrar nada.
    const reader = url.pathname.match(/^\/leer\/([^/]+)\/?$/);
    if (reader && !(await isDownloaded(decodeURIComponent(reader[1])))) return offlinePage();
    return (await shellPage(url.pathname)) || offlinePage();
  }
}

async function bookFile(request, url) {
  // Descarga o actualización explícita: siempre a la red.
  if (url.searchParams.has('offline')) return fetch(request);
  if (url.pathname === '/books/index.json') return networkFirst(request);

  const slug = decodeURIComponent(url.pathname.split('/')[2] || '');
  const name = BOOKS_PREFIX + slug;
  if (slug && (await caches.has(name))) {
    const cache = await caches.open(name);
    const hit = await cache.match(url.pathname, { ignoreSearch: true });
    if (hit) return hit;
  }
  // Las portadas también viven en el shell para que el estante se vea bien sin red.
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.open(SHELL);
    return (await shell.match(url.pathname, { ignoreSearch: true })) || Response.error();
  }
}

/** Archivos con hash en el nombre: nunca cambian, así que basta la primera copia. */
async function immutable(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL);
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

/** Busca la página en el shell con y sin barra final (`/leer/mi-app` ↔ `/leer/mi-app/`). */
async function shellPage(pathname) {
  const cache = await caches.open(SHELL);
  const variants = pathname.endsWith('/')
    ? [pathname, pathname.slice(0, -1) || '/']
    : [pathname, `${pathname}/`];
  for (const variant of variants) {
    const hit = await cache.match(variant, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

async function isDownloaded(slug) {
  const name = BOOKS_PREFIX + slug;
  if (!(await caches.has(name))) return false;
  const cache = await caches.open(name);
  return Boolean(await cache.match(`/books/${slug}/manifest.json`));
}

async function offlinePage() {
  const cache = await caches.open(SHELL);
  return (
    (await cache.match(OFFLINE_URL)) ||
    new Response('<!doctype html><meta charset="utf-8"><title>Sin conexión</title><p>Sin conexión.</p>', {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  );
}

/**
 * Safari rechaza navegaciones servidas por un SW con una respuesta que vino de una redirección
 * (p. ej. un host que añade o quita la barra final): se guarda una copia "limpia".
 */
async function withoutRedirect(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
