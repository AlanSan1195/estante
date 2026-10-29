/**
 * Gestos del lector con Pointer Events.
 *
 * Reglas (como Apple Books):
 * - El arrastre empieza donde sea que se apoye el dedo: hacia la izquierda avanza, hacia la derecha
 *   retrocede. No hace falta buscar el borde; la hoja se agarra desde cualquier punto.
 * - Un toque en el 25 % izquierdo o derecho retrocede o avanza (animado).
 * - Un toque en el centro muestra u oculta los controles.
 * - Una pulsación larga no hace nada: deja que el sistema seleccione texto. Si con ella se
 *   seleccionó texto, mover el dedo ajusta la selección y no gira la página. Un arrastre rápido sí
 *   gira, y descarta la selección que el ratón pudo empezar en los primeros píxeles.
 * - Un toque sobre un elemento interactivo (enlace, código, tabla…) se delega al elemento.
 *
 * Las decisiones son funciones puras (`zoneOf`, `classifyTap`, `shouldCompleteTurn`) y se
 * prueban sin DOM. `GestureController` solo conecta esas reglas con los eventos del navegador.
 */

export type Zone = 'left' | 'right' | 'center';
export type TapAction = 'prev' | 'next' | 'center' | 'none';

export const TAP_FRACTION = 0.25;
export const TAP_MAX_MOVEMENT = 10;
export const TAP_MAX_DURATION = 350;
export const LONG_PRESS_MS = 450;
export const DRAG_START_DISTANCE = 6;
export const COMPLETE_DISTANCE_FRACTION = 0.3;
/** Si la hoja ya se ve girada más de la mitad, basta este recorrido del dedo (px) para completar. */
export const COMMIT_MIN_TRAVEL = 24;
export const COMMIT_TURNED_FRACTION = 0.5;
/** px/ms: un "flick" rápido completa el giro aunque el recorrido sea corto. */
export const FLICK_VELOCITY = 0.45;

/**
 * Toques que se delegan al elemento. El código y las tablas NO están: si llenan la página, tocar en
 * ellos debe seguir mostrando los controles; se amplían con su botón ⤢ (.rd-expand).
 */
export const INTERACTIVE_SELECTOR =
  'a[href], .xref, .ref, .term, mark.hl, .rd-expand, .b-diagram, .qa, input, label, button, select, textarea';

export function zoneOf(x: number, width: number): Zone {
  if (width <= 0) return 'center';
  const f = x / width;
  if (f < TAP_FRACTION) return 'left';
  if (f > 1 - TAP_FRACTION) return 'right';
  return 'center';
}

/** Dirección del arrastre según el sentido del movimiento (empiece donde empiece el dedo). */
export function dragDirection(dx: number): 'forward' | 'backward' | null {
  if (dx < 0) return 'forward';
  if (dx > 0) return 'backward';
  return null;
}

/**
 * ¿El dedo empezó dentro de la franja protegida del borde izquierdo? En Safari iOS sin instalar,
 * ahí empieza el gesto "atrás" del sistema: el motor no inicia un arrastre para no pelear con él
 * (los toques sí cuentan).
 */
export function isGuardedStart(clientX: number, guard: number): boolean {
  return guard > 0 && clientX < guard;
}

function hasTextSelection(): boolean {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

export interface TapInput {
  zone: Zone;
  distance: number;
  duration: number;
  delegated: boolean;
  longPress: boolean;
  hasSelection: boolean;
}

export function classifyTap(input: TapInput): TapAction {
  if (input.delegated || input.longPress || input.hasSelection) return 'none';
  if (input.distance > TAP_MAX_MOVEMENT || input.duration > TAP_MAX_DURATION) return 'none';
  switch (input.zone) {
    case 'left':
      return 'prev';
    case 'right':
      return 'next';
    default:
      return 'center';
  }
}

/**
 * ¿Se completa el giro al soltar? `travel` es lo recorrido en el sentido del giro (px, positivo
 * hacia completar), `velocity` la velocidad en ese mismo sentido (px/ms) y `turned` cuánto se ve
 * girada la hoja (0–1). Si ya pasó de la mitad, no vuelve atrás salvo que el gesto fuera mínimo
 * (un toque impreciso no debe pasar página).
 */
export function shouldCompleteTurn(
  travel: number,
  velocity: number,
  width: number,
  turned = 0,
): boolean {
  if (velocity > FLICK_VELOCITY) return true;
  if (velocity < -FLICK_VELOCITY) return false;
  if (travel > width * COMPLETE_DISTANCE_FRACTION) return true;
  return travel > COMMIT_MIN_TRAVEL && turned > COMMIT_TURNED_FRACTION;
}

/** Velocidad promedio de los últimos ~100 ms. */
export class VelocityTracker {
  private samples: { x: number; y: number; t: number }[] = [];

  constructor(private readonly windowMs = 100) {}

  reset(): void {
    this.samples = [];
  }

  add(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    const limit = t - this.windowMs;
    while (this.samples.length > 2 && (this.samples[0]?.t ?? t) < limit) this.samples.shift();
  }

  /** px/ms */
  velocity(): { x: number; y: number } {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last.t - first.t < 1) return { x: 0, y: 0 };
    const dt = last.t - first.t;
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  }
}

export interface GestureHandlers {
  /** Devuelve false si no hay página en esa dirección (inicio/fin del libro). */
  canTurn(direction: 'forward' | 'backward'): boolean;
  /** Un toque mientras hay una animación en curso: la página queda atrapada. */
  isAnimating(): boolean;
  catchAnimation(point: { x: number; y: number }): boolean;
  dragStart(direction: 'forward' | 'backward', start: { x: number; y: number }): void;
  dragMove(point: { x: number; y: number }, delta: { x: number; y: number }): void;
  dragEnd(velocity: { x: number; y: number }, delta: { x: number; y: number }): void;
  tap(action: Exclude<TapAction, 'none'>): void;
}

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  zone: Zone;
  delegated: boolean;
  /** Empezó en la franja protegida del borde: puede ser toque, nunca arrastre. */
  guarded: boolean;
  dragging: boolean;
  caught: boolean;
  longPress: boolean;
  longTimer: ReturnType<typeof setTimeout> | null;
}

/** Conecta Pointer Events de la superficie con los manejadores del motor. */
export class GestureController {
  private active: ActivePointer | null = null;
  private readonly tracker = new VelocityTracker();
  private suppressClickUntil = 0;
  private enabled = true;

  constructor(
    private readonly surface: HTMLElement,
    private readonly handlers: GestureHandlers,
    /** Ancho (px CSS) de la franja del borde izquierdo de la pantalla donde no se arrastra. */
    private readonly edgeGuard = 0,
  ) {
    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onCancel);
    surface.addEventListener('click', this.onClickCapture, true);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  destroy(): void {
    this.surface.removeEventListener('pointerdown', this.onDown);
    this.surface.removeEventListener('pointermove', this.onMove);
    this.surface.removeEventListener('pointerup', this.onUp);
    this.surface.removeEventListener('pointercancel', this.onCancel);
    this.surface.removeEventListener('click', this.onClickCapture, true);
    this.reset();
  }

  private local(event: PointerEvent): { x: number; y: number } {
    const rect = this.surface.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onDown = (event: PointerEvent) => {
    if (!this.enabled || !event.isPrimary || event.button > 0) return;
    const point = this.local(event);
    const width = this.surface.clientWidth;
    const target = event.target instanceof Element ? event.target : null;
    const delegated = Boolean(target?.closest(INTERACTIVE_SELECTOR));
    const zone = zoneOf(point.x, width);
    this.tracker.reset();
    this.tracker.add(point.x, point.y, event.timeStamp);

    const caught = this.handlers.isAnimating() && this.handlers.catchAnimation(point);
    this.active = {
      id: event.pointerId,
      startX: point.x,
      startY: point.y,
      startTime: event.timeStamp,
      zone,
      delegated,
      guarded: isGuardedStart(event.clientX, this.edgeGuard),
      dragging: caught,
      caught,
      longPress: false,
      longTimer: null,
    };
    if (caught) {
      this.capture(event.pointerId);
      return;
    }
    const active = this.active;
    active.longTimer = setTimeout(() => {
      active.longPress = true;
    }, LONG_PRESS_MS);
  };

  private onMove = (event: PointerEvent) => {
    const active = this.active;
    if (!active || event.pointerId !== active.id) return;
    const point = this.local(event);
    this.tracker.add(point.x, point.y, event.timeStamp);
    const delta = { x: point.x - active.startX, y: point.y - active.startY };

    if (!active.dragging) {
      if (Math.hypot(delta.x, delta.y) > TAP_MAX_MOVEMENT) this.clearLongPress(active);
      if (active.guarded || Math.abs(delta.x) < DRAG_START_DISTANCE) return;
      if (Math.abs(delta.y) > Math.abs(delta.x) * 1.5) return;
      if (active.longPress && hasTextSelection()) return;
      const direction = dragDirection(delta.x);
      if (!direction || !this.handlers.canTurn(direction)) return;
      active.dragging = true;
      window.getSelection()?.removeAllRanges();
      this.capture(event.pointerId);
      this.surface.classList.add('is-dragging');
      this.handlers.dragStart(direction, { x: active.startX, y: active.startY });
    }
    event.preventDefault();
    this.handlers.dragMove(point, delta);
  };

  private onUp = (event: PointerEvent) => {
    const active = this.active;
    if (!active || event.pointerId !== active.id) return;
    const point = this.local(event);
    // La muestra de soltar cuenta: si el dedo se detuvo antes de levantarse, no hay "flick".
    this.tracker.add(point.x, point.y, event.timeStamp);
    const delta = { x: point.x - active.startX, y: point.y - active.startY };
    this.clearLongPress(active);
    this.active = null;
    this.surface.classList.remove('is-dragging');

    if (active.dragging) {
      this.suppressClickUntil = event.timeStamp + 400;
      this.handlers.dragEnd(this.tracker.velocity(), delta);
      return;
    }
    const action = classifyTap({
      zone: active.zone,
      distance: Math.hypot(delta.x, delta.y),
      duration: event.timeStamp - active.startTime,
      delegated: active.delegated,
      longPress: active.longPress,
      hasSelection: hasTextSelection(),
    });
    if (action !== 'none') {
      if (action === 'center') this.suppressClickUntil = event.timeStamp + 50;
      this.handlers.tap(action);
    }
  };

  private onCancel = (event: PointerEvent) => {
    const active = this.active;
    if (!active || event.pointerId !== active.id) return;
    this.clearLongPress(active);
    this.active = null;
    this.surface.classList.remove('is-dragging');
    if (active.dragging) this.handlers.dragEnd({ x: 0, y: 0 }, { x: 0, y: 0 });
  };

  /** Tras un arrastre, el navegador puede disparar un click: se descarta. */
  private onClickCapture = (event: MouseEvent) => {
    if (event.timeStamp < this.suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private capture(pointerId: number): void {
    try {
      this.surface.setPointerCapture(pointerId);
    } catch {
      // El puntero pudo desaparecer (p. ej. pointercancel en iOS).
    }
  }

  private clearLongPress(active: ActivePointer): void {
    if (active.longTimer) clearTimeout(active.longTimer);
    active.longTimer = null;
  }

  private reset(): void {
    if (this.active) this.clearLongPress(this.active);
    this.active = null;
    this.surface.classList.remove('is-dragging');
  }
}
