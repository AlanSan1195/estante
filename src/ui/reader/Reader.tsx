import { useEffect, useRef, useState } from 'react';
import { isFinishedPercent } from '../../core/domain/location';
import { normalizePreferences } from '../../core/domain/preferences';
import { createReaderEngine, type ReaderEngine } from '../../reader-engine/engine';
import { currentEnvironment, EDGE_GUARD_PX, needsEdgeGuard } from '../pwa/platform';
import {
  fetchManifest,
  pageCountCache,
  preferencesRepository,
  progressRepository,
  progressSaver,
  requestPersistentStorage,
} from '../services';
import { usePrefs } from '../stores/prefsStore';
import { useReader } from '../stores/readerStore';
import { useStudy } from '../stores/studyStore';
import { Chrome } from './Chrome';
import { decorateChapter } from './decorate';

interface ReaderProps {
  slug: string;
  title: string;
}

/** Isla del lector: carga el libro, crea el motor y conecta sus eventos con el estado de la UI. */
export default function Reader({ slug, title }: ReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const status = useReader((s) => s.status);
  const error = useReader((s) => s.error);

  useEffect(() => {
    const root = rootRef.current;
    const surface = surfaceRef.current;
    if (!root || !surface) return;
    let cancelled = false;
    let instance: ReaderEngine | null = null;
    const reader = useReader.getState();
    reader.reset();
    const study = useStudy.getState();
    const studyLoaded = study.load(slug).catch(() => {});
    const deepLink = readDeepLink();

    (async () => {
      try {
        const [manifest, saved, progress] = await Promise.all([
          fetchManifest(slug),
          preferencesRepository.load().catch(() => null),
          progressRepository.get(slug).catch(() => null),
        ]);
        if (cancelled) return;
        const prefs = normalizePreferences(saved);
        // En pantallas anchas el código se lee mejor sin ajustar líneas.
        if (!saved && window.innerWidth >= 700) prefs.codeWrap = false;
        usePrefs.getState().hydrate(prefs);
        reader.setManifest(manifest);

        instance = createReaderEngine({
          root,
          surface,
          slug,
          manifest,
          prefs,
          initialLocation: progress?.location ?? null,
          pageCountCache,
          decorate: decorateChapter,
          edgeGuard: needsEdgeGuard(currentEnvironment()) ? EDGE_GUARD_PX : 0,
        });
        instance.on('location', (position) => {
          useReader.getState().setPosition(position);
          progressSaver.schedule({
            bookSlug: slug,
            location: position.location,
            percent: position.percent,
            updatedAt: Date.now(),
            finished: position.atEnd || isFinishedPercent(position.percent),
          });
        });
        instance.on('pages', (pages) => useReader.getState().setPages(pages));
        instance.on('tapCenter', () => {
          const state = useReader.getState();
          const studyState = useStudy.getState();
          if (studyState.toolbar || studyState.termPopover) {
            useStudy.setState({ toolbar: null, termPopover: null });
            return;
          }
          if (state.sheet) state.openSheet(null);
          else state.toggleChrome();
        });
        instance.on('turn', () => {
          const state = useReader.getState();
          useStudy.setState({ toolbar: null, termPopover: null });
          if (state.chromeVisible && !state.sheet) state.setChrome(false);
        });
        instance.on('term', ({ termId, rect }) => useStudy.getState().openTerm(termId, rect));
        instance.on('highlight', ({ highlightId, rect }) => {
          useStudy.setState({ termPopover: null });
          useStudy.getState().setToolbar({ kind: 'highlight', highlightId, rect });
        });
        instance.on('question', ({ questionId }) => {
          if (usePrefs.getState().prefs.hideAnswers) useStudy.getState().toggleRevealed(questionId);
        });
        instance.on('check', ({ itemId, checked }) => {
          useStudy
            .getState()
            .setCheck(itemId, checked)
            .catch(() => {});
        });
        instance.on('jump', ({ from }) => useReader.getState().setJumpBack(from));
        instance.on('openViewer', (viewer) => useReader.getState().openViewer(viewer));
        instance.on('error', ({ message }) => useReader.getState().setError(message));
        setEngine(instance);
        await instance.ready;
        if (cancelled) return;
        // Las anotaciones llegan de IndexedDB en paralelo: se pintan en cuanto estén, sin retrasar
        // el momento en que el libro se puede leer.
        studyLoaded.then(() => {
          if (!cancelled) instance?.redecorate();
        });
        if (deepLink && manifest.chapters.some((c) => c.id === deepLink.chapterId)) {
          clearDeepLink();
          await instance
            .goToBlock(deepLink.chapterId, deepLink.blockId, { recordJump: Boolean(progress) })
            .catch(() => {});
        }
        if (cancelled) return;
        syncThemeColor(root);
        if (useReader.getState().status !== 'error') useReader.getState().setReady();
        requestPersistentStorage().catch(() => {});
      } catch (e) {
        if (!cancelled) useReader.getState().setError((e as Error).message);
      }
    })();

    const flush = () => {
      progressSaver.flush().catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    // Al salir con la transición de Astro, la página se aparta enseguida (data-closing, en
    // leer/[slug].astro) y luego se encoge hasta su portada (ui/bookTransition.ts).
    const onLeave = () => {
      flush();
      document.documentElement.dataset.closing = 'true';
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    document.addEventListener('astro:before-preparation', onLeave);
    return () => {
      cancelled = true;
      flush();
      instance?.destroy();
      useStudy.getState().reset();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('astro:before-preparation', onLeave);
    };
  }, [slug]);

  // Subrayados, checklists y respuestas reveladas → todas las copias del capítulo.
  useEffect(
    () =>
      useStudy.subscribe((state, previous) => {
        if (state.decorVersion !== previous.decorVersion) engine?.redecorate();
      }),
    [engine],
  );

  // Preferencias → motor y almacenamiento.
  useEffect(
    () =>
      usePrefs.subscribe((state, previous) => {
        if (!state.hydrated || state.prefs === previous.prefs || !previous.hydrated) return;
        engine
          ?.setPrefs(state.prefs)
          .then(() => {
            if (rootRef.current) syncThemeColor(rootRef.current);
          })
          .catch(() => {});
        preferencesRepository.save(state.prefs).catch(() => {});
      }),
    [engine],
  );

  return (
    <div className="reader" ref={rootRef} data-testid="reader">
      <div ref={surfaceRef} />
      {status === 'loading' ? (
        <div className="rc-status" role="status" aria-label="Cargando libro">
          <div className="rc-spinner" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="rc-status" role="alert">
          {error}
        </div>
      ) : null}
      <Chrome engine={engine} title={title} />
    </div>
  );
}

/** `/leer/<slug>?b=<blockId>` abre el libro en ese bloque (desde Práctica o la búsqueda global). */
function readDeepLink(): { chapterId: string; blockId: string } | null {
  const blockId = new URLSearchParams(window.location.search).get('b');
  if (!blockId) return null;
  const chapterId = blockId.split('.')[0] ?? '';
  return chapterId ? { chapterId, blockId } : null;
}

function clearDeepLink(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('b');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

/** La barra de estado de iOS toma el color del papel. */
function syncThemeColor(root: HTMLElement): void {
  const color = getComputedStyle(root).getPropertyValue('--page-bg').trim();
  if (!color) return;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = color;
  }
  document.documentElement.dataset.mode = root.dataset.mode ?? '';
}
