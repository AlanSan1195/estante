/**
 * Gestos del lector con Pointer Events.
 *
 * Reglas (como Apple Books):
 * - El arrastre solo empieza si el dedo se apoya dentro del 18 % de cada borde.
 * - Un toque en el 25 % izquierdo o derecho retrocede o avanza (animado).
 * - Un toque en el centro muestra u oculta los controles.
 * - Una pulsación larga en el centro no hace nada: deja que el sistema seleccione texto.
 * - Un toque sobre un elemento interactivo (enlace, código, tabla…) se delega al elemento.
 *
 * Las decisiones son funciones puras (`zoneOf`, `classifyTap`, `shouldCompleteTurn`) y se
 * prueban sin DOM. `GestureController` solo conecta esas reglas con los eventos del navegador.
 */

export type Zone = 'left-edge' | 'right-edge' | 'left-tap' | 'right-tap' | 'center';
export type TapAction = 'prev' | 'next' | 'center' | 'none';

export const EDGE_FRACTION = 0.18;
export const TAP_FRACTION = 0.25;
export const TAP_MAX_MOVEMENT = 10;
export const TAP_MAX_DURATION = 350;
export const LONG_PRESS_MS = 450;
export const DRAG_START_DISTANCE = 6;
export const COMPLETE_DISTANCE_FRACTION = 0.3;
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
  if (f < EDGE_FRACTION) return 'left-edge';
  if (f > 1 - EDGE_FRACTION) return 'right-edge';
  if (f < TAP_FRACTION) return 'left-tap';
  if (f > 1 - TAP_FRACTION) return 'right-tap';
  return 'center';
}

export function isEdge(zone: Zone): boolean {
  return zone === 'left-edge' || zone === 'right-edge';
}

/** Dirección del arrastre según el borde de inicio y el sentido del movimiento. */
export function dragDirection(zone: Zone, dx: number): 'forward' | 'backward' | null {
  if (zone === 'right-edge' && dx < 0) return 'forward';
  if (zone === 'left-edge' && dx > 0) return 'backward';
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
    case 'left-edge':
    case 'left-tap':
      return 'prev';
    case 'right-edge':
    case 'right-tap':
      return 'next';
    default:
      return 'center';
  }
}

/**
 * ¿Se completa el giro al soltar? `travel` es lo recorrido en el sentido del giro (px, positivo
 * hacia completar) y `velocity` la velocidad en ese mismo sentido (px/ms).
 */
export function shouldCompleteTurn(travel: number, velocity: number, width: number): boolean {
  if (velocity > FLICK_VELOCITY) return true;
  if (velocity < -FLICK_VELOCITY) return false;
  return travel > width * COMPLETE_DISTANCE_FRACTION;
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
    if (zone === 'center') {
      const active = this.active;
      active.longTimer = setTimeout(() => {
        active.longPress = true;
      }, LONG_PRESS_MS);
    }
  };

  private onMove = (event: PointerEvent) => {
    const active = this.active;
    if (!active || event.pointerId !== active.id) return;
    const point = this.local(event);
    this.tracker.add(point.x, point.y, event.timeStamp);
    const delta = { x: point.x - active.startX, y: point.y - active.startY };

    if (!active.dragging) {
      if (Math.hypot(delta.x, delta.y) > TAP_MAX_MOVEMENT) this.clearLongPress(active);
      if (active.guarded || !isEdge(active.zone) || Math.abs(delta.x) < DRAG_START_DISTANCE) return;
      if (Math.abs(delta.y) > Math.abs(delta.x) * 1.5) return;
      const direction = dragDirection(active.zone, delta.x);
      if (!direction || !this.handlers.canTurn(direction)) return;
      active.dragging = true;
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
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    const action = classifyTap({
      zone: active.zone,
      distance: Math.hypot(delta.x, delta.y),
      duration: event.timeStamp - active.startTime,
      delegated: active.delegated,
      longPress: active.longPress,
      hasSelection: Boolean(selection && !selection.isCollapsed && selection.toString().trim()),
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
