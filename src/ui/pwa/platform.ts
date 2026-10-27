/**
 * ¿Dónde corre la app y cómo se instala? Funciones puras sobre los datos del navegador, para poder
 * probarlas sin un dispositivo.
 */

export interface InstallEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayStandalone: boolean;
  /** `navigator.standalone` (solo Safari en iOS). */
  navigatorStandalone?: boolean | undefined;
}

export type InstallPlatform =
  /** Ya instalada: abierta desde la pantalla de inicio. */
  | 'standalone'
  /** iPhone/iPad: se instala desde Compartir → Añadir a pantalla de inicio. */
  | 'ios'
  /** Android: Chrome ofrece instalar (beforeinstallprompt) o el menú ⋮. */
  | 'android'
  | 'desktop';

export function isStandalone(env: InstallEnvironment): boolean {
  return env.displayStandalone || env.navigatorStandalone === true;
}

/** Incluye el iPad con iPadOS, que se presenta como "MacIntel" con pantalla táctil. */
export function isIOS(env: InstallEnvironment): boolean {
  return (
    /iPad|iPhone|iPod/.test(env.userAgent) ||
    (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
  );
}

export function installPlatform(env: InstallEnvironment): InstallPlatform {
  if (isStandalone(env)) return 'standalone';
  if (isIOS(env)) return 'ios';
  if (/Android/i.test(env.userAgent)) return 'android';
  return 'desktop';
}

/**
 * En Safari iOS sin instalar, deslizar desde el borde izquierdo es el gesto "atrás" del sistema:
 * el lector deja ahí una franja sin arrastre para no pelear con él. Instalada no hace falta.
 */
export function needsEdgeGuard(env: InstallEnvironment): boolean {
  return installPlatform(env) === 'ios';
}

/** Ancho de esa franja, en píxeles CSS. */
export const EDGE_GUARD_PX = 20;

export function currentEnvironment(): InstallEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    displayStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    navigatorStandalone: nav.standalone,
  };
}
