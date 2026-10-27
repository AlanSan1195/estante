/**
 * Aplica la geometría del curl al DOM. Por cuadro solo cambia clip-path, transform y opacidad:
 * nada de layout ni de React. La página que gira se recorta a su parte plana; la solapa es una copia
 * reflejada sobre el pliegue con el texto espejado tenue; dos tiras con degradado dan la sombra
 * proyectada sobre la página de abajo y el brillo de curvatura de la solapa.
 */

import type { FlapLayer, PageLayer } from './layers';
import {
  type FoldGeometry,
  matrixToCss,
  type PageSize,
  polygonToClipPath,
  stripTransform,
} from './pageCurl';

export interface CurlElements {
  flap: FlapLayer;
  cast: HTMLDivElement;
}

export class CurlRenderer {
  private turning: PageLayer | null = null;
  private under: PageLayer | null = null;

  constructor(private readonly elements: CurlElements) {}

  begin(turning: PageLayer, under: PageLayer): void {
    this.turning = turning;
    this.under = under;
    under.el.style.zIndex = '1';
    turning.el.style.zIndex = '3';
    this.elements.cast.style.zIndex = '2';
    this.elements.flap.el.style.zIndex = '4';
    turning.el.classList.add('is-turning');
    under.el.classList.add('is-under');
    this.elements.flap.el.classList.add('is-active');
    this.elements.cast.classList.add('is-active');
  }

  render(geometry: FoldGeometry | null, size: PageSize): void {
    const turning = this.turning;
    if (!turning) return;
    const { flap, cast } = this.elements;
    if (!geometry) {
      turning.el.style.clipPath = '';
      flap.el.style.opacity = '0';
      cast.style.opacity = '0';
      return;
    }
    turning.el.style.clipPath = polygonToClipPath(geometry.unfolded);

    const diagonal = Math.hypot(size.width, size.height) * 2;
    flap.el.style.opacity = geometry.folded.length ? '1' : '0';
    flap.el.style.clipPath = polygonToClipPath(geometry.folded);
    flap.el.style.transform = matrixToCss(geometry.matrix);

    const fade = 1 - geometry.progress;
    const shade = flap.shade.style;
    shade.width = `${diagonal}px`;
    shade.height = `${Math.max(1, geometry.depth)}px`;
    shade.transform = stripTransform(geometry, diagonal);

    const castDepth = Math.min(90, Math.max(14, geometry.depth * 0.45));
    cast.style.width = `${diagonal}px`;
    cast.style.height = `${castDepth}px`;
    cast.style.transform = stripTransform(geometry, diagonal);
    cast.style.opacity = (0.25 + 0.75 * fade).toFixed(3);
  }

  end(): void {
    const { flap, cast } = this.elements;
    for (const layer of [this.turning, this.under]) {
      if (!layer) continue;
      layer.resetEffects();
      layer.el.classList.remove('is-turning', 'is-under');
    }
    flap.el.classList.remove('is-active');
    cast.classList.remove('is-active');
    flap.el.style.clipPath = '';
    flap.el.style.transform = '';
    flap.el.style.opacity = '0';
    cast.style.opacity = '0';
    this.turning = null;
    this.under = null;
  }
}
