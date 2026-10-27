/**
 * Modo Deslizar: las páginas se mueven como un carrusel. Solo transform por cuadro.
 * `offset` es negativo al avanzar (la página actual sale hacia la izquierda) y positivo al
 * retroceder (la anterior entra desde la izquierda).
 */

import type { PageLayer } from './layers';

export class SlideRenderer {
  private moving: PageLayer[] = [];

  begin(direction: 'forward' | 'backward', current: PageLayer, other: PageLayer): void {
    this.moving = [current, other];
    current.el.style.zIndex = '3';
    other.el.style.zIndex = '2';
    current.el.classList.add('is-sliding');
    other.el.classList.add('is-sliding', direction === 'forward' ? 'is-next' : 'is-prev');
  }

  render(direction: 'forward' | 'backward', offset: number, width: number): void {
    const [current, other] = this.moving;
    if (!current || !other) return;
    current.el.style.transform = `translate3d(${offset}px, 0, 0)`;
    const base = direction === 'forward' ? width : -width;
    other.el.style.transform = `translate3d(${base + offset}px, 0, 0)`;
  }

  end(): void {
    for (const layer of this.moving) {
      layer.resetEffects();
      layer.el.classList.remove('is-sliding', 'is-next', 'is-prev');
    }
    this.moving = [];
  }
}
