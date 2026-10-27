import { useEffect, useState } from 'react';
import { InstallSheet } from './InstallSheet';
import { currentEnvironment, type InstallPlatform, installPlatform } from './platform';
import { INSTALL_HINT_SHOWN, INSTALL_SHEET_SHOWN, readFlag, usePwa, writeFlag } from './pwaStore';
import { registerServiceWorker } from './serviceWorker';

type View = 'shelf' | 'reader';

const HINT_MS = 5000;
const SHEET_DELAY_MS = 1200;

function currentView(): View {
  return document.documentElement.dataset.view === 'reader' ? 'reader' : 'shelf';
}

/**
 * Capa de la PWA, persistente entre páginas: registra el service worker, avisa de versiones
 * nuevas y, en Safari iOS sin instalar, sugiere instalar (una vez por dispositivo).
 */
export default function PwaLayer() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [view, setView] = useState<View>('shelf');
  const [hint, setHint] = useState(false);
  const sheetOpen = usePwa((s) => s.installSheetOpen);
  const updateReady = usePwa((s) => s.updateReady);
  const applyUpdate = usePwa((s) => s.applyUpdate);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    registerServiceWorker();
    setPlatform(installPlatform(currentEnvironment()));
    setView(currentView());
    const onPage = () => setView(currentView());
    document.addEventListener('astro:page-load', onPage);
    return () => document.removeEventListener('astro:page-load', onPage);
  }, []);

  // Primera visita al estante en Safari iOS: abrir la hoja de instalación una sola vez.
  useEffect(() => {
    if (platform !== 'ios' || view !== 'shelf' || readFlag(INSTALL_SHEET_SHOWN)) return;
    const timer = setTimeout(() => {
      writeFlag(INSTALL_SHEET_SHOWN);
      usePwa.getState().openInstallSheet();
    }, SHEET_DELAY_MS);
    return () => clearTimeout(timer);
  }, [platform, view]);

  // En el lector, un aviso discreto (también una sola vez) que abre la misma hoja.
  useEffect(() => {
    if (platform !== 'ios' || view !== 'reader' || readFlag(INSTALL_HINT_SHOWN)) {
      setHint(false);
      return;
    }
    writeFlag(INSTALL_HINT_SHOWN);
    setHint(true);
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [platform, view]);

  return (
    <>
      {hint ? (
        <button
          type="button"
          className="glass pwa-hint"
          data-testid="install-hint"
          onClick={() => {
            setHint(false);
            usePwa.getState().openInstallSheet();
          }}
        >
          Instálala para la mejor experiencia
        </button>
      ) : null}

      {updateReady && applyUpdate ? (
        <div className={`glass pwa-update is-${view}`} role="status" data-testid="update-banner">
          <span>Hay una versión nueva</span>
          <button
            type="button"
            disabled={updating}
            onClick={() => {
              setUpdating(true);
              applyUpdate();
            }}
          >
            {updating ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      ) : null}

      {sheetOpen && platform ? <InstallSheet platform={platform} /> : null}
    </>
  );
}
