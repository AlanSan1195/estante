import type { ReaderTheme } from '../../core/domain/preferences';

/** Nombre visible y muestra de color de cada tema (debe coincidir con src/styles/themes.css). */
export const THEME_INFO: Record<
  ReaderTheme,
  {
    name: string;
    light: { bg: string; ink: string };
    dark: { bg: string; ink: string };
    weight: number;
  }
> = {
  original: {
    name: 'Original',
    light: { bg: '#ffffff', ink: '#1d1d1f' },
    dark: { bg: '#121214', ink: '#e9e9ec' },
    weight: 500,
  },
  tranquilo: {
    name: 'Tranquilo',
    light: { bg: '#e7e7e9', ink: '#3a3a3e' },
    dark: { bg: '#2b2b2e', ink: '#b9b9be' },
    weight: 500,
  },
  papel: {
    name: 'Papel',
    light: { bg: '#f1ebe0', ink: '#2f2a23' },
    dark: { bg: '#1f1c18', ink: '#dcd4c6' },
    weight: 500,
  },
  negrita: {
    name: 'Negrita',
    light: { bg: '#ffffff', ink: '#000000' },
    dark: { bg: '#000000', ink: '#ffffff' },
    weight: 750,
  },
  calma: {
    name: 'Calma',
    light: { bg: '#f2e5d0', ink: '#4a3b2a' },
    dark: { bg: '#352b22', ink: '#eadcc4' },
    weight: 500,
  },
  enfoque: {
    name: 'Enfoque',
    light: { bg: '#fffbf0', ink: '#2b2925' },
    dark: { bg: '#1b1a18', ink: '#f1e6d2' },
    weight: 500,
  },
};
