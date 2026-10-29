import { type ReactNode, useState } from 'react';
import {
  type Appearance,
  FONT_SCALE_STEPS,
  type FontFamily,
  type Margins,
  type PageTurn,
  READER_THEMES,
} from '../../core/domain/preferences';
import {
  bodyFontStack,
  FONT_STACKS,
  resolveMode,
  systemPrefersDark,
} from '../../reader-engine/typography';
import { AutoModeIcon, MoonIcon, SlidersIcon, SunIcon } from '../glass/icons';
import { usePrefs } from '../stores/prefsStore';
import { useReader } from '../stores/readerStore';
import { Sheet } from './Sheet';
import { THEME_INFO } from './themes';

interface Option<T> {
  value: T;
  label: string;
  style?: React.CSSProperties;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: Option<T>[];
  onChange(value: T): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="rc-segmented" disabled={disabled}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          style={option.style}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="rc-switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  format,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format(v: number): string;
  onChange(v: number): void;
  label: string;
}) {
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <fieldset className="rc-stepper">
      <legend className="visually-hidden">{label}</legend>
      <button
        type="button"
        aria-label={`Menos ${label.toLowerCase()}`}
        onClick={() => set(value - step)}
        disabled={value <= min}
      >
        −
      </button>
      <output>{format(value)}</output>
      <button
        type="button"
        aria-label={`Más ${label.toLowerCase()}`}
        onClick={() => set(value + step)}
        disabled={value >= max}
      >
        +
      </button>
    </fieldset>
  );
}

function Row({
  label,
  stacked = false,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`rc-row${stacked ? ' is-stacked' : ''}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}

const MODES: { value: Appearance; label: string; icon: ReactNode }[] = [
  { value: 'auto', label: 'Auto', icon: <AutoModeIcon /> },
  { value: 'light', label: 'Claro', icon: <SunIcon /> },
  { value: 'dark', label: 'Oscuro', icon: <MoonIcon /> },
];

const FONTS: Option<FontFamily>[] = [
  { value: 'literata', label: 'Literata', style: { fontFamily: FONT_STACKS.literata } },
  {
    value: 'source-serif',
    label: 'Source Serif',
    style: { fontFamily: FONT_STACKS['source-serif'] },
  },
  { value: 'inter', label: 'Inter', style: { fontFamily: FONT_STACKS.inter } },
];

const MARGINS: Option<Margins>[] = [
  { value: 'narrow', label: 'Estrechos' },
  { value: 'normal', label: 'Normales' },
  { value: 'wide', label: 'Amplios' },
];

const TURNS: Option<PageTurn>[] = [
  { value: 'curl', label: 'Curl' },
  { value: 'slide', label: 'Deslizar' },
  { value: 'scroll', label: 'Desplazar' },
];

/**
 * Temas y ajustes, al estilo de Apple Books: una hoja baja (la página sigue visible detrás) con
 * tamaño, modo y temas; el resto de ajustes vive en la subpantalla "Personalizar".
 */
export function SettingsSheet() {
  const [view, setView] = useState<'themes' | 'customize'>('themes');
  const openSheet = useReader((s) => s.openSheet);
  return (
    <Sheet
      title={view === 'themes' ? 'Temas y ajustes' : 'Personalizar'}
      testId="settings-sheet"
      live
      onBack={view === 'customize' ? () => setView('themes') : undefined}
      onClose={() => openSheet(null)}
    >
      {view === 'themes' ? (
        <ThemesView onCustomize={() => setView('customize')} />
      ) : (
        <CustomizeView />
      )}
    </Sheet>
  );
}

function ThemesView({ onCustomize }: { onCustomize(): void }) {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const stepFont = usePrefs((s) => s.stepFont);
  const mode = resolveMode(prefs.appearance, systemPrefersDark());
  const minScale = FONT_SCALE_STEPS[0];
  const maxScale = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];

  return (
    <div className="rc-settings is-themes">
      <div className="rc-quick-row">
        <div className="rc-size-row">
          <button
            type="button"
            aria-label="Reducir tamaño de letra"
            data-testid="font-smaller"
            disabled={prefs.fontScale <= minScale}
            onClick={() => stepFont(-1)}
          >
            A
          </button>
          <button
            type="button"
            aria-label="Aumentar tamaño de letra"
            data-testid="font-larger"
            disabled={prefs.fontScale >= maxScale}
            onClick={() => stepFont(1)}
          >
            A
          </button>
        </div>
        <fieldset className="rc-modes">
          <legend className="visually-hidden">Modo</legend>
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              title={option.label}
              aria-pressed={prefs.appearance === option.value}
              onClick={() => update({ appearance: option.value })}
            >
              {option.icon}
            </button>
          ))}
        </fieldset>
      </div>

      <fieldset className="rc-themes">
        <legend className="visually-hidden">Temas</legend>
        {READER_THEMES.map((theme) => {
          const info = THEME_INFO[theme];
          const swatch = info[mode];
          return (
            <button
              key={theme}
              type="button"
              className="rc-theme"
              aria-pressed={prefs.theme === theme}
              data-theme-option={theme}
              onClick={() => update({ theme })}
              style={{
                background: swatch.bg,
                color: swatch.ink,
                fontFamily: bodyFontStack({ theme, fontFamily: prefs.fontFamily }),
                fontWeight: info.weight,
              }}
            >
              <span className="rc-theme-aa" aria-hidden="true">
                Aa
              </span>
              <span>{info.name}</span>
            </button>
          );
        })}
      </fieldset>

      <button
        type="button"
        className="rc-customize"
        data-testid="settings-customize"
        onClick={onCustomize}
      >
        <SlidersIcon />
        Personalizar
      </button>
    </div>
  );
}

function CustomizeView() {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const themeFont = prefs.theme === 'dev';

  return (
    <div className="rc-settings">
      <div className="rc-group">
        <Row label="Fuente" stacked>
          <Segmented
            label="Fuente"
            value={prefs.fontFamily}
            options={FONTS}
            disabled={themeFont}
            onChange={(fontFamily) => update({ fontFamily })}
          />
          {themeFont ? (
            <small className="rc-row-note">El tema Dev usa su propia fuente pixel.</small>
          ) : null}
        </Row>
        <Row label="Interlineado">
          <Stepper
            label="Interlineado"
            value={prefs.lineHeight}
            min={1.3}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(lineHeight) => update({ lineHeight })}
          />
        </Row>
        <Row label="Márgenes" stacked>
          <Segmented
            label="Márgenes"
            value={prefs.margins}
            options={MARGINS}
            onChange={(margins) => update({ margins })}
          />
        </Row>
        <Row label="Justificar">
          <Switch
            label="Justificar"
            checked={prefs.justify}
            onChange={(justify) => update({ justify })}
          />
        </Row>
        <Row label="Texto en negrita">
          <Switch
            label="Texto en negrita"
            checked={prefs.bold}
            onChange={(bold) => update({ bold })}
          />
        </Row>
      </div>

      <p className="rc-group-title">Paso de página</p>
      <div className="rc-group">
        <Row label="Estilo" stacked>
          <Segmented
            label="Estilo de paso de página"
            value={prefs.pageTurn}
            options={TURNS}
            onChange={(pageTurn) => update({ pageTurn })}
          />
        </Row>
      </div>

      <p className="rc-group-title">Código</p>
      <div className="rc-group">
        <Row label="Ajustar líneas">
          <Switch
            label="Ajustar líneas de código"
            checked={prefs.codeWrap}
            onChange={(codeWrap) => update({ codeWrap })}
          />
        </Row>
        <Row label="Tamaño">
          <Stepper
            label="Tamaño del código"
            value={prefs.codeScale}
            min={0.65}
            max={1.1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)} %`}
            onChange={(codeScale) => update({ codeScale })}
          />
        </Row>
      </div>

      <p className="rc-group-title">Estudio</p>
      <div className="rc-group">
        <Row label="Ocultar respuestas">
          <Switch
            label="Ocultar respuestas del banco de preguntas"
            checked={prefs.hideAnswers}
            onChange={(hideAnswers) => update({ hideAnswers })}
          />
        </Row>
      </div>
    </div>
  );
}
