/**
 * Geometría pura del paso de página tipo "curl" (pliegue plano con sombreado).
 *
 * Modelo: la página es un rectángulo [0,W]×[0,H] cosido por el lomo (x = 0). Se levanta una
 * esquina C (arriba o abajo a la derecha) y se lleva hasta el punto P. La línea de pliegue es la
 * mediatriz del segmento C–P: todo lo que queda del lado de C se dobla y se refleja sobre esa línea.
 *
 * - `unfolded`: parte de la página que sigue plana (se aplica como clip-path a la página que gira).
 * - `folded`: parte que se dobla, en coordenadas de la página ANTES de reflejarla (clip-path de la
 *   solapa; la matriz de reflexión la lleva al otro lado del pliegue).
 * - `matrix`: reflexión respecto a la línea de pliegue en formato CSS `matrix(a, b, c, d, e, f)`.
 *
 * Nada aquí toca el DOM: son funciones deterministas y se prueban con `bun test`.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PageSize {
  width: number;
  height: number;
}

export type Corner = 'top' | 'bottom';

/** Matriz CSS `matrix(a, b, c, d, e, f)`: x' = a·x + c·y + e ; y' = b·x + d·y + f. */
export type CssMatrix = [number, number, number, number, number, number];

export interface FoldGeometry {
  corner: Point;
  /** P ya restringido (la página no se "rompe" al estirarla más allá del lomo). */
  point: Point;
  /** Vector unitario perpendicular al pliegue, de P hacia C (lado que se dobla). */
  normal: Point;
  /** Punto medio de C–P: está sobre la línea de pliegue. */
  mid: Point;
  /** Polígono plano (coordenadas de página). Vacío si la página ya giró por completo. */
  unfolded: Point[];
  /** Polígono doblado antes de reflejar (coordenadas de página). */
  folded: Point[];
  matrix: CssMatrix;
  /** 0 = página plana, 1 = página girada del todo (P en x = −W). */
  progress: number;
  /** Distancia de C a la línea de pliegue (= |C−P| / 2): hasta dónde llega la solapa. */
  depth: number;
  /** Ángulo (rad) para orientar tiras de sombra: su eje +y local apunta a `normal`. */
  stripAngle: number;
}

const EPSILON = 0.5;

export function anchorCorner(startY: number, height: number): Corner {
  return startY < height / 2 ? 'top' : 'bottom';
}

export function cornerPoint(size: PageSize, corner: Corner): Point {
  return { x: size.width, y: corner === 'top' ? 0 : size.height };
}

/** Posición de P cuando la página giró por completo y quedó sobre la anterior (pliegue en el lomo). */
export function turnedPoint(size: PageSize, corner: Corner): Point {
  return { x: -size.width, y: cornerPoint(size, corner).y };
}

/** 0 cuando P está en la esquina, 1 cuando la página giró del todo. */
export function turnProgress(size: PageSize, x: number): number {
  if (size.width <= 0) return 0;
  return clamp((size.width - x) / (2 * size.width), 0, 1);
}

/**
 * Restricción física: la esquina no puede alejarse del lomo más que el ancho de la página (lado de
 * la esquina) ni más que la diagonal (lado opuesto). Proyecta P sobre esas circunferencias.
 */
export function constrainPoint(size: PageSize, corner: Corner, p: Point): Point {
  const { width: w, height: h } = size;
  const sameEdge: Point = { x: 0, y: corner === 'top' ? 0 : h };
  const oppositeEdge: Point = { x: 0, y: corner === 'top' ? h : 0 };
  let point = projectInsideCircle(p, sameEdge, w);
  point = projectInsideCircle(point, oppositeEdge, Math.hypot(w, h));
  return point;
}

function projectInsideCircle(p: Point, center: Point, radius: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) return p;
  const k = radius / distance;
  return { x: center.x + dx * k, y: center.y + dy * k };
}

export function computeFold(size: PageSize, corner: Corner, rawPoint: Point): FoldGeometry | null {
  const c = cornerPoint(size, corner);
  const p = constrainPoint(size, corner, rawPoint);
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return null;

  const normal = { x: dx / length, y: dy / length };
  const mid = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };
  const rect = rectangle(size);
  const folded = clipPolygonByHalfPlane(rect, mid, normal, true);
  const unfolded = clipPolygonByHalfPlane(rect, mid, normal, false);

  return {
    corner: c,
    point: p,
    normal,
    mid,
    unfolded: polygonArea(unfolded) < EPSILON ? [] : unfolded,
    folded: polygonArea(folded) < EPSILON ? [] : folded,
    matrix: reflectionMatrix(mid, normal),
    progress: turnProgress(size, p.x),
    depth: length / 2,
    stripAngle: Math.atan2(-normal.x, normal.y),
  };
}

export function rectangle(size: PageSize): Point[] {
  return [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: size.width, y: size.height },
    { x: 0, y: size.height },
  ];
}

/**
 * Sutherland–Hodgman con un único semiplano. `keepPositive` conserva los puntos con
 * (X − point)·normal ≥ 0, es decir, el lado hacia el que apunta la normal.
 */
export function clipPolygonByHalfPlane(
  polygon: readonly Point[],
  point: Point,
  normal: Point,
  keepPositive: boolean,
): Point[] {
  const sign = keepPositive ? 1 : -1;
  const side = (v: Point) => sign * ((v.x - point.x) * normal.x + (v.y - point.y) * normal.y);
  const output: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i] as Point;
    const next = polygon[(i + 1) % polygon.length] as Point;
    const sc = side(current);
    const sn = side(next);
    if (sc >= 0) output.push(current);
    if ((sc >= 0 && sn < 0) || (sc < 0 && sn >= 0)) {
      const t = sc / (sc - sn);
      output.push({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
      });
    }
  }
  return dedupe(output);
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 1 &&
    first &&
    last &&
    Math.abs(first.x - last.x) < 1e-6 &&
    Math.abs(first.y - last.y) < 1e-6
  ) {
    out.pop();
  }
  return out;
}

export function polygonArea(polygon: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point;
    const b = polygon[(i + 1) % polygon.length] as Point;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/** Reflexión respecto a la recta que pasa por `mid` con normal unitaria `normal`. */
export function reflectionMatrix(mid: Point, normal: Point): CssMatrix {
  const { x: nx, y: ny } = normal;
  const d = mid.x * nx + mid.y * ny;
  return [1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, 2 * d * nx, 2 * d * ny];
}

export function applyMatrix(m: CssMatrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function reflectPoint(p: Point, mid: Point, normal: Point): Point {
  return applyMatrix(reflectionMatrix(mid, normal), p);
}

export function polygonToClipPath(polygon: readonly Point[]): string {
  if (polygon.length === 0) return 'polygon(0 0, 0 0, 0 0)';
  return `polygon(${polygon.map((p) => `${round(p.x)}px ${round(p.y)}px`).join(', ')})`;
}

export function matrixToCss(m: CssMatrix): string {
  return `matrix(${m.map((value) => round(value, 5)).join(', ')})`;
}

/** Transform CSS de una tira alineada con el pliegue: eje x a lo largo del pliegue, +y hacia C. */
export function stripTransform(geometry: FoldGeometry, length: number): string {
  return `translate(${round(geometry.mid.x)}px, ${round(geometry.mid.y)}px) rotate(${round(geometry.stripAngle, 5)}rad) translate(${round(-length / 2)}px, 0)`;
}

/** Elevación natural de la esquina: nula con la página plana o girada, máxima a mitad de giro. */
export function cornerLift(size: PageSize, x: number): number {
  return 0.12 * size.height * Math.sin(Math.PI * turnProgress(size, x));
}

function liftSign(corner: Corner): number {
  return corner === 'bottom' ? -1 : 1;
}

/** Punto P con la elevación natural aplicada a una x dada (más un desplazamiento vertical extra). */
export function liftedPoint(size: PageSize, corner: Corner, x: number, extraY = 0): Point {
  const c = cornerPoint(size, corner);
  return { x, y: c.y + liftSign(corner) * cornerLift(size, x) + extraY };
}

export type TurnDirection = 'forward' | 'backward';

/**
 * Traduce el arrastre del dedo a P.
 * - Adelante: la esquina sigue al dedo (P.x = base.x + dx).
 * - Atrás: la página anterior entra desde el lomo; el pliegue sigue al dedo (P.x = base.x + 2·dx).
 * El movimiento vertical del dedo se amortigua a la mitad para que el pliegue no "baile".
 */
export function dragPoint(
  size: PageSize,
  corner: Corner,
  direction: TurnDirection,
  base: Point,
  delta: Point,
): Point {
  const factor = direction === 'forward' ? 1 : 2;
  const baseLift = liftedPoint(size, corner, base.x);
  const residualY = base.y - baseLift.y;
  const x = base.x + factor * delta.x;
  return liftedPoint(size, corner, x, residualY + delta.y * 0.5);
}

/** Distancia (px del dedo) en la que el pliegue alcanza al dedo: mínimo y fracción del hueco. */
const CATCH_UP_MIN = 24;
const CATCH_UP_FRACTION = 0.45;

/**
 * Traduce el arrastre a P cuando el dedo agarró la hoja en `start` (en cualquier punto, no solo en
 * la esquina). El pliegue sale del borde (adelante) o del lomo (atrás) y alcanza al dedo en los
 * primeros píxeles del gesto; desde ahí queda justo bajo el dedo. Así la hoja responde en cuanto el
 * dedo empieza a deslizar, sin importar dónde se apoyó.
 *
 * La inclinación depende de la altura del agarre: en el centro vertical el pliegue es recto (gira
 * todo el borde); cerca de arriba o abajo se levanta la esquina, como en `liftedPoint`.
 */
export function followPoint(
  size: PageSize,
  corner: Corner,
  direction: TurnDirection,
  start: Point,
  finger: Point,
): Point {
  const { width: w, height: h } = size;
  const from = direction === 'forward' ? w : 0;
  const gap = from - start.x;
  const travel = direction === 'forward' ? start.x - finger.x : finger.x - start.x;
  const catchUp = Math.max(CATCH_UP_MIN, Math.abs(gap) * CATCH_UP_FRACTION);
  const lag = (1 - clamp(travel / catchUp, 0, 1)) ** 2;
  const crease = clamp(finger.x + gap * lag, 0, w);
  // Con el pliegue vertical en `crease`, P (la esquina reflejada) queda en 2·crease − w.
  const x = 2 * crease - w;
  const tilt = h > 0 ? clamp(Math.abs(start.y - h / 2) / (h / 2), 0, 1) : 0;
  const c = cornerPoint(size, corner);
  return {
    x,
    y: c.y + liftSign(corner) * tilt * cornerLift(size, x) + (finger.y - start.y) * 0.5,
  };
}

/** Recorrido de un giro automático (toque en una zona lateral): t ∈ [0,1], de la esquina al lomo. */
export function autoTurnPoint(size: PageSize, corner: Corner, t: number): Point {
  const x = size.width - 2 * size.width * clamp(t, 0, 1);
  return liftedPoint(size, corner, x);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
