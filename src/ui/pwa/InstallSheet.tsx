import type { ReactNode } from 'react';
import { InstallIcon, MoreIcon, PlusSquareIcon, ShareIcon } from '../glass/icons';
import { Sheet } from '../reader/Sheet';
import type { InstallPlatform } from './platform';
import { usePwa } from './pwaStore';
import { QrCode } from './QrCode';

/**
 * Hoja "Añadir a pantalla de inicio": pasos ilustrados en iOS, botón nativo en Chrome/Android y,
 * en escritorio, un QR para abrir la app en el teléfono e instalarla allí.
 */
export function InstallSheet({ platform }: { platform: InstallPlatform }) {
  const close = usePwa((s) => s.closeInstallSheet);
  const prompt = usePwa((s) => s.installPrompt);
  const promptInstall = usePwa((s) => s.promptInstall);
  const desktop = platform === 'desktop';

  return (
    <div className="pwa-overlay">
      <Sheet
        title={desktop ? 'Ábrela en tu teléfono' : 'Añadir a pantalla de inicio'}
        subtitle="Estante se abre como una app: a pantalla completa y sin conexión"
        testId="install-sheet"
        onClose={close}
      >
        <div className="pwa-install">
          {desktop ? (
            <div className="pwa-qr-block" data-testid="install-phone">
              <QrCode value={window.location.origin} />
              <p className="pwa-note">
                Escanéalo con la cámara. En iPhone, abre la página en Safari y toca{' '}
                <strong>Compartir → Añadir a pantalla de inicio</strong>. En Android, abre en Chrome
                y toca <strong>Instalar aplicación</strong>.
              </p>
            </div>
          ) : null}

          {prompt ? (
            <button
              type="button"
              className="pwa-primary"
              data-testid="install-native"
              onClick={() => {
                promptInstall().catch(() => {});
              }}
            >
              <InstallIcon /> Instalar Estante
            </button>
          ) : null}

          {platform === 'ios' ? (
            <ol className="pwa-steps" data-testid="install-steps-ios">
              <Step n={1} illustration={<SafariBar />}>
                Toca <strong>Compartir</strong> en la barra de Safari. En iOS 26 está dentro del
                botón <strong>•••</strong>.
              </Step>
              <Step n={2} illustration={<ShareRow />}>
                Desliza y elige <strong>Añadir a pantalla de inicio</strong>.
              </Step>
              <Step n={3} illustration={<HomeIcon />}>
                Confirma con <strong>Añadir</strong> y abre Estante desde su ícono.
              </Step>
            </ol>
          ) : null}

          {platform === 'android' && !prompt ? (
            <ol className="pwa-steps" data-testid="install-steps-android">
              <Step n={1} illustration={<ChromeMenu />}>
                Abre el menú <strong>⋮</strong> de Chrome.
              </Step>
              <Step n={2} illustration={<ShareRow label="Instalar aplicación" />}>
                Elige <strong>Instalar aplicación</strong> (o «Añadir a pantalla de inicio»).
              </Step>
            </ol>
          ) : null}

          {desktop && !prompt ? (
            <p className="pwa-note">
              Para instalarla también en esta computadora: en Chrome o Edge, el botón de instalar de
              la barra de direcciones; en Safari para Mac, <strong>Archivo → Añadir al Dock</strong>
              .
            </p>
          ) : null}

          <p className="pwa-note">
            Instalada, el borde izquierdo queda libre para pasar páginas (Safari lo usa para volver
            atrás) y puedes descargar libros para leerlos sin red.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

function Step({
  n,
  illustration,
  children,
}: {
  n: number;
  illustration: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="pwa-step">
      <span className="pwa-step-n" aria-hidden="true">
        {n}
      </span>
      <div className="pwa-step-art" aria-hidden="true">
        {illustration}
      </div>
      <p>{children}</p>
    </li>
  );
}

/** Barra inferior de Safari con el botón Compartir resaltado. */
function SafariBar() {
  return (
    <div className="pwa-art-bar">
      <span className="pwa-art-url">estante</span>
      <span className="pwa-art-pulse">
        <ShareIcon />
      </span>
      <span className="pwa-art-more">
        <MoreIcon />
      </span>
    </div>
  );
}

function ShareRow({ label = 'Añadir a pantalla de inicio' }: { label?: string }) {
  return (
    <div className="pwa-art-row">
      <span>{label}</span>
      <PlusSquareIcon />
    </div>
  );
}

function ChromeMenu() {
  return (
    <div className="pwa-art-bar">
      <span className="pwa-art-url">estante</span>
      <span className="pwa-art-pulse pwa-art-kebab">⋮</span>
    </div>
  );
}

function HomeIcon() {
  return (
    <div className="pwa-art-home">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <span>Estante</span>
    </div>
  );
}
