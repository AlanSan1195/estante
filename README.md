# Estante

Biblioteca personal de estudio: cada proyecto que construyes se convierte en un **libro** que lees en el iPhone (o cualquier móvil) como en Apple Books, para entender y defender cómo está hecho.

La fuente de cada libro es un único Markdown, `INFO_PROYECT_<NOMBRE>.md`. La app no inventa contenido: el orden y el texto del MD son la autoridad. El build lo estructura en capítulos, secciones, glosario y banco de preguntas, y lo publica como archivos estáticos.

## Usa tu propio Estante

Estante es personal: cada quien tiene sus libros y su despliegue. Este repo trae **solo la app**. Tus libros viven en `projects/`, que está en `.gitignore`: nunca suben a git ni viajan con un fork o un clon. La IA que escribe los libros la pone y la paga quien la usa. Mientras no tengas libros, la app muestra un tutorial ([`examples/`](examples/INFO_PROYECT_ESTANTE.md)).

1. **Clona la app e instala:**

   ```bash
   git clone https://github.com/AlanSan1195/estante && cd estante && bun install
   ```

   ```bash
   bunx playwright install chromium
   ```

   Chromium se usa para renderizar diagramas Mermaid en tu computadora y para las pruebas e2e.
2. **Crea tus libros** con tu agente o a mano (ver [Añadir un libro](#añadir-un-libro)). Para leerlos en local, usa `bun run dev`.
3. **Publica** con `bun run deploy` (Vercel) o `bun run deploy --netlify`. El build se hace en tu computadora, porque ahí están tus libros, y la CLI sube el resultado. La primera vez te pide iniciar sesión y elegir o crear el proyecto (ver [Publicar](#publicar-vercel-o-netlify)).
4. **Instala en el teléfono:** abre tu URL en la computadora y, en Inicio, toca **Ábrela en tu teléfono**. Escanea el QR y añádela a la pantalla de inicio ([Instalar en el teléfono](#instalar-en-el-teléfono)).

Para traer las mejoras de la app, haz `git pull`. Nunca hay conflictos con tus libros, porque no están en git. Para respaldarlos, cada MD suele vivir también en el repo de su proyecto. Si quieres, `projects/` puede ser un repo privado propio.

## Añadir un libro

**Con un agente (recomendado).** En Claude Code, desde la raíz de este repo, usa `/libro ../mi-proyecto` (o la URL de un repo). El agente lee el código, escribe `projects/INFO_PROYECT_<NOMBRE>.md` con el formato correcto, lo valida y te pregunta antes de publicarlo. Con otros agentes (Codex…), pídele que siga [`docs/generar-libro.md`](docs/generar-libro.md).

**A mano:**

1. Copia el MD a `projects/`, por ejemplo `projects/INFO_PROYECT_MI_APP.md`. También vale una subcarpeta por proyecto, y nombres con espacios o con la copia de Finder (`INFO_PROYECT_MI_APP 2.md` → slug `mi-app-2`).
2. Opcional: añade una portada `projects/<slug>.cover.jpg` (o `.png` / `.webp` / `.svg`). Si no la hay, se genera una portada SVG.
3. Opcional: añade un frontmatter YAML para ajustar metadatos:

   ```yaml
   ---
   title: Mi app
   subtitle: Libro de estudio
   author: Tu nombre
   color: "#4338ca"        # paleta de la portada
   repo: usuario/mi-app    # las referencias a archivos enlazan a GitHub
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
bun test               # núcleo (libro sintético de fixture) y motor de lectura
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
- **Gestos:** arrastre desde cualquier punto de la página (izquierda avanza, derecha retrocede), toque en los laterales para pasar página y en el centro para los controles. Código y tablas se amplían con su botón ⤢. Los diagramas, con un toque.
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

Instalar la app y leer sin conexión exige **HTTPS**, así que hace falta un hosting. Como tus libros solo están en tu computadora, el build se hace ahí y se sube ya construido con `bun run deploy` (`scripts/deploy.ts`):

```bash
bun run deploy            # Vercel: vercel pull + vercel build --prod + vercel deploy --prebuilt --prod
```

```bash
bun run deploy --netlify  # Netlify: bun run build + netlify deploy --prod --no-build --dir dist
```

- **Primera vez:** la CLI te pide iniciar sesión y elegir o crear el proyecto. El enlace queda en `.vercel/` o `.netlify/`, que están ignorados.
- **Sin libros:** si `projects/` está vacío, el comando se detiene para no publicar solo el tutorial (`--allow-empty` lo fuerza).
- **Diagramas:** Mermaid se renderiza en tu computadora con Chromium y se guarda en `.estante-cache/`, que no se versiona.
- **Sin builds desde git:** `vercel.json` (`git.deploymentEnabled: false`) y `netlify.toml` (`ignore = "exit 0"`) los desactivan. Un push no publica nada, porque en el servidor no están tus libros y saldría solo el tutorial.

| Host | Configuración en el repo |
|---|---|
| Vercel | `vercel.json`: Bun, salida `dist`, cabeceras y Node 24 tomado de `engines` |
| Netlify | `netlify.toml` + `public/_headers` |
| Otro estático (Cloudflare Pages…) | Sube `dist/` tras `bun run build`. `public/_headers` sirve en Cloudflare. GitHub Pages no funciona tal cual: el sitio viviría en `/estante/` y la app usa rutas absolutas. |

En todos los hosts las cabeceras son las mismas:
- `sw.js` sin caché y con `Service-Worker-Allowed`;
- `/_astro/*` inmutable y `/books/*` con caché corta;
- `noindex` para que no aparezca en buscadores, que también está en el `<meta>` y en `robots.txt`.

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
