---
repo: AlanSan1195/estante
author: Estante
color: "#0a7aff"
---

# Estante: cómo crear tu primer libro

Este libro aparece porque tu estante todavía está vacío. Cuando añadas tu primer libro a `projects/`, desaparecerá solo. Mientras tanto, te sirve para probar el lector: pasa páginas desde el borde, abre el menú ≡, toca un término subrayado y responde las preguntas del final en la pestaña Práctica.

**Consejo:** lee este libro en el teléfono una vez instalada la app. Es la mejor forma de ver cómo quedarán los tuyos.

## Índice de estudio

1. [Qué es Estante](#1-qué-es-estante).
2. [Tu primer libro](#2-tu-primer-libro).
3. [El formato del libro](#3-el-formato-del-libro).
4. [Leer y estudiar](#4-leer-y-estudiar).
5. [Publicar y usar en el teléfono](#5-publicar-y-usar-en-el-teléfono).
6. [Glosario](#6-glosario).
7. [Banco de preguntas](#7-banco-de-preguntas).

## 1. Qué es Estante

Estante convierte el documento de estudio de cada proyecto que construyes en un libro, para que entiendas y puedas defender cómo está hecho. La fuente de cada libro es un único Markdown, `INFO_PROYECT_<NOMBRE>.md`. La app no inventa contenido: estructura lo que escribiste en capítulos, glosario y banco de preguntas.

“Estante es mi biblioteca de estudio: cada proyecto que construyo se vuelve un libro que leo en el teléfono, con glosario y preguntas para practicar.”

**Importante:** tu biblioteca es personal. La carpeta `projects/` está en `.gitignore`, así que tus libros nunca suben a git ni viajan con un fork o un clon de la app.

### 1.1 Qué hay en el repo

| Carpeta | Para qué sirve |
|---|---|
| `projects/` | Tus libros. Solo existen en tu computadora. |
| `examples/` | Este tutorial, que se muestra mientras no tengas libros. |
| `docs/` | El formato del libro y el procedimiento para generarlo con un agente. |
| `src/` | La app: parser, lector, biblioteca y PWA. |

## 2. Tu primer libro

La forma más rápida es pedírselo a tu agente de código. En Claude Code, desde la raíz de este repo:

```bash
/libro ../mi-proyecto
```

La skill [libro](.claude/skills/libro/SKILL.md) lee el código del proyecto, escribe `projects/INFO_PROYECT_MI_PROYECTO.md` con el formato correcto y lo valida. La IA la pones y la pagas tú. Estante no llama a ninguna. Con otros agentes, pídeles que sigan [generar-libro.md](docs/generar-libro.md).

### 2.1 A mano

Si ya tienes el documento, cópialo a `projects/` y comprueba qué entendió el parser:

```bash
bun run books:check
```

**Nota:** si `books:check` avisa `no-questions` o `no-glossary`, el libro se lee bien, pero Práctica y el glosario no tendrán nada de ese libro. El formato completo está en [formato-libro.md](docs/formato-libro.md).

## 3. El formato del libro

El parser reconoce unas pocas convenciones del Markdown. Estas son las que más importan:

| En el MD | En el libro |
|---|---|
| `## N. Título` | Un capítulo |
| `**Implementado:**`, `**Por verificar:**`… | Un callout con color |
| `[texto](src/archivo.ts:15)` | Un chip que enlaza al archivo en GitHub |
| Tabla bajo un encabezado "Glosario" | Las definiciones al tocar un término |
| `**N. ¿Pregunta?** Respuesta` | Una tarjeta de Práctica |

**Interpretación técnica:** el parser no usa IA. Produce bloques con ids estables, así que tus subrayados y tu progreso sobreviven cuando editas el MD.

**Por verificar:** si tu libro trae diagramas `mermaid`, se dibujan en tu computadora con Chromium. Instálalo una vez con `bunx playwright install chromium`.

## 4. Leer y estudiar

- Desliza desde el borde derecho o izquierdo para pasar página. Un toque en los lados también pasa página.
- Un toque en el centro muestra los controles. El menú ≡ abre el contenido, los marcadores, la búsqueda y los temas.
- Los términos del glosario aparecen subrayados con puntos la primera vez en cada capítulo. Tócalos para ver su definición.
- Las respuestas del banco de preguntas se ven desenfocadas hasta tocarlas. La pestaña Práctica las convierte en tarjetas con nota 0, 1 o 2.

## 5. Publicar y usar en el teléfono

Instalar la app exige una URL con HTTPS. Como tus libros solo están en tu computadora, el build se hace ahí y se sube ya construido:

```bash
bun run deploy
```

Ese comando ([deploy.ts](scripts/deploy.ts)) publica en Vercel. Con `--netlify` publica en Netlify. La primera vez, la CLI te pide iniciar sesión y elegir el proyecto.

**Límite real:** un `git push` no publica nada. En el servidor no están tus libros, y publicar desde ahí dejaría el sitio solo con este tutorial.

Después, abre tu URL en la computadora y toca **Ábrela en tu teléfono** en Inicio. Escanea el QR, añade la app a la pantalla de inicio y toca la nube de cada libro para leerlo sin conexión.

## 6. Glosario

| Término | Definición |
|---|---|
| Libro | Un `INFO_PROYECT_<NOMBRE>.md` convertido en capítulos, glosario y preguntas. |
| Callout | Párrafo destacado que empieza con una etiqueta en negrita, como **Implementado:**. |
| Práctica | Pestaña que convierte el banco de preguntas en tarjetas de repaso. |
| PWA / app instalable | Sitio web que se añade a la pantalla de inicio y funciona sin conexión. |
| Skill | Instrucciones empaquetadas para un agente de código, como `/libro`. |

## 7. Banco de preguntas

**1. ¿Dónde viven tus libros?** En `projects/`, solo en tu computadora. Está en `.gitignore`, así que no suben a git ni llegan a quien clone la app.

**2. ¿Cómo se crea un libro con IA?** Con la skill `/libro` en Claude Code, o pidiéndole a otro agente que siga `docs/generar-libro.md`. La IA la pagas tú.

**3. ¿Qué formato tiene una pregunta del banco?** Un párrafo que empieza con `**N. ¿Pregunta?**` en negrita y sigue con la respuesta.

**4. ¿Cómo se publica el estante?** Con `bun run deploy`, que hace el build en tu computadora y lo sube a Vercel, o a Netlify con `--netlify`.

**5. ¿Por qué un push no publica el sitio?** Porque en el servidor no están tus libros. Un build desde git solo mostraría este tutorial.

- [ ] Generé mi primer libro y `books:check` no muestra avisos.
- [ ] Publiqué con `bun run deploy` y abrí la app en el teléfono.
