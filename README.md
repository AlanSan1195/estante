# Estante

Biblioteca personal de estudio: cada proyecto que construyes se convierte en un **libro** que lees en el iPhone (o cualquier móvil) como en Apple Books, para entender y defender cómo está hecho.

La fuente de cada libro es un único Markdown, `INFO_PROYECT_<NOMBRE>.md`. La app no inventa contenido: el orden y el texto del MD son la autoridad. El build lo estructura en capítulos, secciones, glosario y banco de preguntas, y lo publica como archivos estáticos.

## Usa tu propio Estante

Estante es personal: cada quien tiene su copia, sus libros y su despliegue. No hay servidor ni cuentas. La IA que escribe los libros la pone y la paga quien la usa.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAlanSan1195%2Festante&project-name=estante&repository-name=estante) [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/AlanSan1195/estante)

1. **Despliega:** pulsa uno de los botones. Los dos copian este repo en tu cuenta de GitHub y publican el sitio con HTTPS. Cada `git push` vuelve a publicar.
2. **Prepara tu copia en local:**

   ```bash
   git clone https://github.com/<tu-usuario>/estante && cd estante && bun install
   ```

   ```bash
   bunx playwright install chromium
   ```

   Chromium se usa para renderizar diagramas Mermaid y para las pruebas e2e.
3. **Cambia los libros:** borra los míos de `projects/` (o déjalos de ejemplo) y genera los tuyos con tu agente (ver [Añadir un libro](#añadir-un-libro)).
4. **Publica:** haz push. Abre tu URL en la computadora y, en Inicio, toca **Ábrela en tu teléfono**: escanea el QR y añádela a la pantalla de inicio ([Instalar en el teléfono](#instalar-en-el-teléfono)).

Para traer las mejoras de la app, conecta este repo como `upstream`:

```bash
git remote add upstream https://github.com/AlanSan1195/estante
```

```bash
git pull upstream main
```

Con las mejoras también llegan mis libros nuevos de `projects/`. Bórralos si no los quieres.

## Añadir un libro

**Con un agente (recomendado).** En Claude Code, desde la raíz de este repo, usa `/libro ../mi-proyecto` (o la URL de un repo). El agente lee el código, escribe `projects/INFO_PROYECT_<NOMBRE>.md` con el formato correcto, lo valida y te pregunta antes de hacer commit. Con otros agentes (Codex…), pídele que siga [`docs/generar-libro.md`](docs/generar-libro.md).

**A mano:**

1. Copia el MD a `projects/`, por ejemplo `projects/INFO_PROYECT_TWICK.md`. También vale una subcarpeta por proyecto, y nombres con espacios o con la copia de Finder (`INFO_PROYECT_TWICK 2.md` → slug `twick-2`).
2. Opcional: añade una portada `projects/<slug>.cover.jpg` (o `.png` / `.webp`). Si no la hay, se genera una portada SVG.
3. Opcional: añade un frontmatter YAML para ajustar metadatos:

   ```yaml
   ---
   title: Twick
   subtitle: Libro de estudio
   author: Alan Sandoval
   color: "#4338ca"        # paleta de la portada
   repo: usuario/twick     # las referencias a archivos enlazan a GitHub
   branch: main
   root: /ruta/absoluta/al/proyecto   # si la raíz no se detecta sola
   ---
   ```

Con `bun run dev` corriendo, guardar el MD recompila el libro y recarga el navegador.

## Qué entiende el parser

El formato completo, con una plantilla, está en [`docs/formato-libro.md`](docs/formato-libro.md). Lo esencial:
- `## N. Título` son capítulos y `### N.M` secciones.
- Las etiquetas en negrita (`**Implementado:**`, `**Por verificar:**`…) son callouts.
- `[x](src/archivo.ts:15)` es una referencia a archivo.
- Una tabla bajo "Glosario" es el glosario.
- `**N. ¿Pregunta?** Respuesta` es el banco de preguntas de Práctica.

## Comandos

```bash
bun install
```

```bash
bun run dev            # servidor de desarrollo (compila projects/ y vigila cambios)
```

```bash
bun run build          # build estático en dist/
```

```bash
bun run books:check    # estadísticas y avisos de cada libro, sin escribir nada (--strict sale con 1 si hay avisos)
```

```bash
bun test               # núcleo (MD real de Twick como fixture) y motor de lectura
```

```bash
bun run test:e2e       # lector, estante y estudio en WebKit con el descriptor de iPhone 15 (build + preview)
```

```bash
bun run check          # astro check + Biome + reglas de arquitectura (dependency-cruiser)
```

```bash
bun run icons          # regenera los iconos PNG y el favicon desde assets/icons/estante.svg
```

## Arquitectura

Hexagonal en el núcleo, pragmática en la interfaz:

```
src/
├─ core/                 núcleo: TypeScript puro, sin Astro, React ni node:*
│  ├─ domain/            Book, Chapter, Block, Location, Leitner, preferencias, formato publicado
│  ├─ ports/             ProjectSource, DocumentParser, CodeHighlighter, DiagramRenderer, CoverGenerator,
│  │                     BookRenderer, BookRepository, ContentEnricher, Progress/Annotation/Practice/PreferencesRepository
│  └─ application/       compileLibrary (caso de uso del build), validateBook, publishBook
├─ adapters/build/       fs, remark, Shiki, Mermaid, portada SVG, HTML, repositorio estático, enriquecedor no-op
├─ adapters/browser/     IndexedDB (idb): progreso, preferencias, conteo de páginas, anotaciones, práctica
├─ integration/          integración de Astro = raíz de composición del build
├─ reader-engine/        motor de lectura en TS puro: paginación, curl, deslizar, desplazamiento, gestos
├─ ui/                   React: lector (chrome, hojas, visores, estudio), estante (library/), práctica, búsqueda;
│                        stores de Zustand; services.ts = raíz del navegador
├─ components/           barra de pestañas de vidrio (Astro, sin JS)
├─ layouts/ · pages/     rutas: / (Inicio), /biblioteca, /practica, /buscar, /leer/<slug>[?b=<bloque>]
└─ styles/               tokens, temas, tipografía del libro y vidrio
```

`dependency-cruiser` hace cumplir las fronteras: `src/core` no importa nada de fuera del núcleo, y `src/reader-engine` no importa React, UI ni adaptadores.

## El lector

- **Paginación:** cada capítulo se dibuja con CSS multi-column (una columna = una página) y la página i se muestra con `translate3d(−i·W)`. Medir los fragmentos de cada bloque da el mapa bloque ↔ página, así que cambiar la letra o rotar el teléfono conserva la ubicación.
- **Curl:** pliegue plano sobre la mediatriz entre la esquina y el dedo, con `clip-path` y una matriz de reflexión; la solapa es la página espejada y tenue. Solo cambian `clip-path`, `transform` y opacidad por cuadro: React no participa.
- **Gestos:** arrastre desde el 18 % de cada borde, toque en los laterales para pasar página y en el centro para los controles. Código y tablas se amplían con su botón ⤢. Los diagramas, con un toque.
- **Páginas globales ("259 de 1420"):** se cuentan en segundo plano y se guardan en IndexedDB por tipografía y tamaño de pantalla.

## Estante y estudio

- **Inicio y Biblioteca:** portadas con progreso ("Nuevo", "7 %", "Terminado"), orden por recientes, título o progreso, menú ••• (terminado, reiniciar, detalles) y barra de pestañas de vidrio. Al abrir un libro, la portada se expande hacia el lector con View Transitions (`<ClientRouter/>`); al cerrarlo vuelve a su sitio. Inicio y Biblioteca siguen la apariencia del sistema.
- **Glosario:** el primer uso de cada término en un capítulo está subrayado con puntos; tocarlo abre su definición. La hoja Glosario busca por término o alias y salta a la primera aparición.
- **Banco de preguntas:** las respuestas se ven desenfocadas hasta tocarlas (ajuste "Ocultar respuestas"). La pestaña Práctica las convierte en tarjetas con nota 0/1/2 y cajas de Leitner.
- **Marcadores, subrayados y checklists:** se guardan en IndexedDB. Los subrayados se anclan al bloque, a los offsets y a la cita, así que sobreviven a cambios del MD, y se pintan en todas las copias del capítulo con un decorador (`engine.redecorate()`).
- **Búsqueda:** MiniSearch sin acentos sobre `search.json`, dentro del libro (menú ≡) y en todo el estante (`/buscar`). Los resultados abren `/leer/<slug>?b=<bloque>` con la píldora para volver.

Cambios previstos que solo exigen **un adaptador nuevo**:
- subir MD desde la UI (`ProjectSource`);
- explicaciones con IA (`ContentEnricher`);
- sincronizar el progreso entre dispositivos (`ProgressRepository`);
- guardar los libros sin conexión de otra forma (`OfflineRepository`).

## App instalable y sin conexión

- **Manifest e iconos:** `public/manifest.webmanifest` (standalone, fondo negro) con iconos normales y *maskable*, más `apple-touch-icon.png`. Se generan con `bun run icons`.
- **Service worker propio** (`public/sw.js`):
  - Al terminar el build, la integración escribe dentro del SW la lista del *app shell* y su versión (un hash del contenido). La lista incluye páginas, JS/CSS, fuentes latinas, iconos, catálogo y portadas.
  - Las navegaciones van primero a la red. Sin red se usa la copia guardada, y si no la hay, `/offline/`.
  - Solo se registra en producción: `astro dev` no lo usa.
- **Descarga por libro:** la nube de cada portada indica el estado. Vacía = no descargado, anillo = descargando, ✓ = disponible sin conexión, punto azul = hay una versión nueva. También está en el menú ••• (Descargar / Quitar descarga). Cada libro vive en la caché `books-<slug>` (puerto `OfflineRepository`, adaptador sobre Cache Storage) y la descarga es atómica.
- **Actualizaciones:** cuando se publica una versión nueva aparece "Hay una versión nueva · Actualizar". No se activa sola, así que no cambia el código a mitad de una lectura.
- **Safari iOS sin instalar:**
  - La hoja "Añadir a pantalla de inicio" se abre una vez y luego queda en Inicio.
  - El lector muestra una vez el aviso "Instálala para la mejor experiencia".
  - Hay una franja de 20 px en el borde izquierdo sin arrastre, para no pelear con el gesto "atrás".
- **Android/Chrome:** botón "Instalar Estante", que usa `beforeinstallprompt`.

## Publicar (Vercel o Netlify)

Instalar la app y leer sin conexión exige **HTTPS**, así que hace falta un hosting. Los botones de [Usa tu propio Estante](#usa-tu-propio-estante) hacen todo en un paso. También puedes importar el repo a mano en [vercel.com/new](https://vercel.com/new) o en Netlify.

| Host | Configuración en el repo | Notas |
|---|---|---|
| Vercel | `vercel.json` | Detecta Astro y usa Bun. Toma Node 24 de `engines`. |
| Netlify | `netlify.toml` + `public/_headers` | Usa Bun 1.3.14 y Node 24 (`BUN_VERSION`, `NODE_VERSION`). |
| Cloudflare Pages | `public/_headers` | No tiene botón: conecta el repo en su panel, con comando `bun run build` y salida `dist`. |
| GitHub Pages | — | No funciona tal cual: el sitio viviría en `/estante/` y la app usa rutas absolutas. |

En todos los hosts las cabeceras son las mismas:
- `sw.js` sin caché y con `Service-Worker-Allowed`;
- `/_astro/*` inmutable y `/books/*` con caché corta;
- `noindex` para que no aparezca en buscadores, que también está en el `<meta>` y en `robots.txt`.

Cada `git push` a `main` vuelve a publicar. Si un libro trae diagramas Mermaid nuevos, ejecuta antes `bun run build` en tu computadora y sube también lo nuevo de `.estante-cache/`. Los hosts no tienen navegador para renderizarlos, y sin la caché esos diagramas se verían como código. `/libro` ya lo hace por ti.

El sitio no aparece en buscadores, pero lo puede abrir cualquiera que tenga la URL. Si quieres que sea privado, pon delante la protección de tu host o Cloudflare Access.

## Instalar en el teléfono

La instalación y la lectura sin conexión necesitan **HTTPS**, así que hazlas con la URL de tu despliegue. Por la red local (`http://192.168…`) el lector funciona, pero el navegador no registra el service worker. Para no teclear la URL en el teléfono, ábrela en la computadora: Inicio muestra **Ábrela en tu teléfono** con un QR.

- **iPhone / iPad (Safari):**
  1. Abre la URL.
  2. Toca **Compartir** (en iOS 26 está dentro del botón •••).
  3. Elige **Añadir a pantalla de inicio** y confirma con **Añadir**.
  4. Ábrela desde el ícono.
  5. En la Biblioteca, toca la nube de cada libro para tenerlo sin conexión.
- **Android (Chrome):**
  1. Abre la URL.
  2. Toca **Instalar Estante** en Inicio, o en el menú **⋮ → Instalar aplicación**.
  3. Descarga los libros con la nube.

## Formato publicado

Esto es lo que escribe el build y lo que consumen el lector y el service worker. Los tipos están en `src/core/domain/published.ts`.

```
public/books/
  index.json                 catálogo (LibraryCatalog)
  <slug>/manifest.json       índice, glosario, preguntas, checklists, palabras (BookManifest)
  <slug>/<capitulo>.html     fragmento HTML por capítulo
  <slug>/search.json         documentos de búsqueda por bloque
  <slug>/cover.svg|jpg|…     portada
```

Una ubicación de lectura es `{ chapterId, blockId, charOffset }`, nunca un número de página. Cada bloque del HTML lleva `data-b` (id estable) y `data-w` (palabras previas dentro del capítulo). El porcentaje se calcula como `(chapter.wordStart + data-w + fracción del bloque) / totalWords`.
