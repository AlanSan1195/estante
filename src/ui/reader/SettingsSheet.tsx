import type { ReactNode } from 'react';
import {
  type Appearance,
  FONT_SCALE_STEPS,
  type FontFamily,
  type Margins,
  type PageTurn,
  READER_THEMES,
} from '../../core/domain/preferences';
import { FONT_STACKS, resolveMode, systemPrefersDark } from '../../reader-engine/typography';
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
}: {
  value: T;
  options: Option<T>[];
  onChange(value: T): void;
  label: string;
}) {
  return (
    <fieldset className="rc-segmented">
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

const MODES: Option<Appearance>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
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

export function SettingsSheet() {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const stepFont = usePrefs((s) => s.stepFont);
  const openSheet = useReader((s) => s.openSheet);
  const mode = resolveMode(prefs.appearance, systemPrefersDark());
  const minScale = FONT_SCALE_STEPS[0];
  const maxScale = FONT_SCALE_STEPS[FONT_SCALE_STEPS.length - 1];

  return (
    <Sheet title="Temas y ajustes" testId="settings-sheet" onClose={() => openSheet(null)}>
      <div className="rc-settings">
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
              >
                <span
                  className="rc-theme-swatch"
                  style={{
                    background: swatch.bg,
                    color: swatch.ink,
                    fontFamily: FONT_STACKS[prefs.fontFamily],
                    fontWeight: info.weight,
                  }}
                >
                  Aa
                </span>
                <span>{info.name}</span>
              </button>
            );
          })}
        </fieldset>

        <p className="rc-group-title">Apariencia</p>
        <div className="rc-group">
          <Row label="Modo">
            <Segmented
              label="Modo"
              value={prefs.appearance}
              options={MODES}
              onChange={(appearance) => update({ appearance })}
            />
          </Row>
        </div>

        <p className="rc-group-title">Personalizar</p>
        <div className="rc-group">
          <Row label="Fuente" stacked>
            <Segmented
              label="Fuente"
              value={prefs.fontFamily}
              options={FONTS}
              onChange={(fontFamily) => update({ fontFamily })}
            />
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
    </Sheet>
  );
}
