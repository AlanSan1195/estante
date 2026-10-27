/**
 * Resorte críticamente amortiguado: llega al objetivo lo antes posible sin rebotar.
 * La solución analítica permite avanzar con cualquier dt (cuadros irregulares de Safari) sin
 * perder estabilidad. La animación es interrumpible: `cancel()` devuelve la posición y la
 * velocidad actuales para que un dedo "atrape" la página a mitad de camino.
 */

export interface SpringState {
  value: number;
  /** Unidades por segundo. */
  velocity: number;
}

export interface SpringOptions {
  /** Frecuencia angular (rad/s). Más alto = más rápido. */
  omega: number;
  /** Distancia a la que se considera terminado. */
  restDistance: number;
  /** Velocidad a la que se considera terminado. */
  restVelocity: number;
}

export const DEFAULT_SPRING: SpringOptions = { omega: 18, restDistance: 0.5, restVelocity: 8 };

export function stepSpring(
  state: SpringState,
  target: number,
  dtSeconds: number,
  omega = DEFAULT_SPRING.omega,
): SpringState {
  const delta = state.value - target;
  const v = state.velocity;
  const exp = Math.exp(-omega * dtSeconds);
  const k = v + omega * delta;
  const nextDelta = (delta + k * dtSeconds) * exp;
  const nextVelocity = (v - omega * k * dtSeconds) * exp;
  return { value: target + nextDelta, velocity: nextVelocity };
}

export function atRest(state: SpringState, target: number, options = DEFAULT_SPRING): boolean {
  return (
    Math.abs(state.value - target) < options.restDistance &&
    Math.abs(state.velocity) < options.restVelocity
  );
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface SpringAnimation {
  /** Detiene la animación y devuelve dónde estaba. */
  cancel(): { position: Vec2; velocity: Vec2 };
  readonly done: Promise<boolean>;
}

export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

export const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
  now: () => performance.now(),
};

/** Anima un punto 2D con dos resortes independientes (x, y). `done` resuelve true si llegó. */
export function animateSpring2D(
  from: Vec2,
  velocity: Vec2,
  to: Vec2,
  onFrame: (position: Vec2) => void,
  options: Partial<SpringOptions> = {},
  scheduler: FrameScheduler = rafScheduler,
): SpringAnimation {
  const opts = { ...DEFAULT_SPRING, ...options };
  let sx: SpringState = { value: from.x, velocity: velocity.x };
  let sy: SpringState = { value: from.y, velocity: velocity.y };
  let last = scheduler.now();
  let handle = 0;
  let finished = false;
  let resolve: (arrived: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => {
    resolve = r;
  });

  const tick = (time: number) => {
    const dt = Math.min(0.064, Math.max(0.001, (time - last) / 1000));
    last = time;
    sx = stepSpring(sx, to.x, dt, opts.omega);
    sy = stepSpring(sy, to.y, dt, opts.omega);
    if (atRest(sx, to.x, opts) && atRest(sy, to.y, opts)) {
      finished = true;
      onFrame({ x: to.x, y: to.y });
      resolve(true);
      return;
    }
    onFrame({ x: sx.value, y: sy.value });
    handle = scheduler.request(tick);
  };
  handle = scheduler.request(tick);

  return {
    done,
    cancel() {
      if (!finished) {
        scheduler.cancel(handle);
        finished = true;
        resolve(false);
      }
      return {
        position: { x: sx.value, y: sy.value },
        velocity: { x: sx.velocity, y: sy.velocity },
      };
    },
  };
}

/** Interpolación con curva (para giros automáticos con duración fija). */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export interface TimedAnimation {
  cancel(): number;
  readonly done: Promise<boolean>;
}

/** Anima t de 0 a 1 en `duration` ms con easing; `cancel()` devuelve el t alcanzado. */
export function animateTimed(
  duration: number,
  onFrame: (t: number) => void,
  ease: (t: number) => number = easeInOutCubic,
  scheduler: FrameScheduler = rafScheduler,
): TimedAnimation {
  const start = scheduler.now();
  let handle = 0;
  let finished = false;
  let t = 0;
  let resolve: (arrived: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => {
    resolve = r;
  });
  const tick = (time: number) => {
    const raw = Math.min(1, (time - start) / duration);
    t = ease(raw);
    onFrame(t);
    if (raw >= 1) {
      finished = true;
      resolve(true);
      return;
    }
    handle = scheduler.request(tick);
  };
  handle = scheduler.request(tick);
  return {
    done,
    cancel() {
      if (!finished) {
        scheduler.cancel(handle);
        finished = true;
        resolve(false);
      }
      return t;
    },
  };
}
