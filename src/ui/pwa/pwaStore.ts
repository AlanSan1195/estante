import { create } from 'zustand';

/** Evento de Chrome/Android para ofrecer la instalación (no está en los tipos del DOM). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installSheetOpen: boolean;
  /** Aviso de Chrome guardado para lanzarlo desde un botón propio. */
  installPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  /** Hay un service worker nuevo esperando: se muestra "Hay una versión nueva · Actualizar". */
  updateReady: boolean;
  applyUpdate: (() => void) | null;
  openInstallSheet(): void;
  closeInstallSheet(): void;
  /** Lanza el diálogo nativo de instalación (Chrome/Android). */
  promptInstall(): Promise<boolean>;
  setUpdate(apply: () => void): void;
}

export const usePwa = create<PwaState>((set, get) => ({
  installSheetOpen: false,
  installPrompt: null,
  installed: false,
  updateReady: false,
  applyUpdate: null,
  openInstallSheet: () => set({ installSheetOpen: true }),
  closeInstallSheet: () => set({ installSheetOpen: false }),
  promptInstall: async () => {
    const prompt = get().installPrompt;
    if (!prompt) return false;
    set({ installPrompt: null });
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (choice.outcome === 'accepted') set({ installed: true, installSheetOpen: false });
    return choice.outcome === 'accepted';
  },
  setUpdate: (apply) => set({ updateReady: true, applyUpdate: apply }),
}));

// Chrome dispara el evento una sola vez y pronto: se escucha al cargar el módulo, antes de que se
// monte ninguna isla, y se guarda para el botón "Instalar".
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwa.setState({ installPrompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () =>
    usePwa.setState({ installed: true, installPrompt: null, installSheetOpen: false }),
  );
}

/** Banderas "ya se mostró" (una sola vez por dispositivo). */
export const INSTALL_SHEET_SHOWN = 'estante:install-sheet-shown';
export const INSTALL_HINT_SHOWN = 'estante:install-hint-shown';

export function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // Sin almacenamiento no se insiste: mejor no mostrar que mostrar siempre.
  }
}

export function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Sin almacenamiento: se volverá a mostrar en otra visita.
  }
}
