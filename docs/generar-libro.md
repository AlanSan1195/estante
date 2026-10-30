# Generar un libro con tu propia IA

Este procedimiento lo sigue un agente de código (Claude Code, Codex u otro) para escribir el libro de estudio de un proyecto. Estante no llama a ninguna IA: la pone y la paga quien ejecuta el agente. En Claude Code está empaquetado como la skill `/libro` (`.claude/skills/libro/SKILL.md`).

**Entrada:** la ruta de un proyecto (`../mi-proyecto`) o la URL de un repositorio.
**Salida:** `projects/INFO_PROYECT_<NOMBRE>.md` en este repo, con el formato de [`docs/formato-libro.md`](formato-libro.md), validado con `bun run books:check --strict`.

## 1. Preparar

1. Lee `docs/formato-libro.md` completo. La plantilla del final es el formato exacto que hay que producir.
2. Si la entrada es una URL, clónala con `git clone --depth 1 <url>` en una carpeta temporal, **fuera** de este repo.
3. Anota el commit (`git -C <proyecto> rev-parse --short HEAD`) y el remoto (`git -C <proyecto> remote get-url origin`). Si el remoto es de GitHub, irá en el frontmatter como `repo: usuario/proyecto`.
4. Elige `<NOMBRE>` en mayúsculas a partir del nombre del proyecto (`mi-proyecto` → `INFO_PROYECT_MI_PROYECTO.md`). Si ya existe ese archivo en `projects/`, pregunta antes de sobrescribirlo.

## 2. Leer el proyecto

Lee, en este orden:

- `README`, manifiestos (`package.json`, `pyproject.toml`, `go.mod`…) y configuración (build, despliegue, variables de entorno de ejemplo);
- los puntos de entrada y el recorrido de una petición o caso de uso principal, de punta a punta;
- los módulos centrales (dominio, estado, API, persistencia, seguridad);
- las pruebas, para saber qué está verificado y qué no.

No leas `node_modules`, builds, binarios ni secretos (`.env`). No copies credenciales al libro.

## 3. Escribir el libro

Estructura recomendada, en capítulos `## N.`:

1. Qué es y qué resuelve el producto (con un guion de 30 segundos entre comillas “…”).
2. Stack y herramientas, con el porqué de cada una.
3. Arquitectura y fronteras, con un diagrama `mermaid`.
4. Recorrido de punta a punta del caso de uso principal.
5. Un capítulo por cada pieza importante (estado, servidor, datos, seguridad, rendimiento…).
6. Pruebas: qué está cubierto y qué no.
7. Límites y mejoras posibles.
8. Glosario: tabla bajo un encabezado con "Glosario".
9. Banco de preguntas: entre 20 y 60 preguntas con el formato `**N. ¿…?** respuesta`.
10. Checklist final de repaso (`- [ ] …`).

Antes del primer capítulo va un `## Índice de estudio` con un enlace `#ancla` por capítulo.

**Reglas de veracidad.** Son obligatorias, porque el libro sirve para defender el proyecto ante otra persona:

- Cada afirmación técnica importante lleva una referencia `[archivo](ruta/relativa.ts:línea)` que la respalda. Comprueba que el archivo existe y que la línea apunta a lo que dices.
- El código de los bloques se **copia** del archivo real, recortado si hace falta. Nunca se escribe código que el proyecto no tiene.
- Distingue lo comprobado de lo supuesto: `**Implementado:**` para lo que está en el código, `**Interpretación técnica:**` para tu lectura y `**Por verificar:**` para lo que no pudiste confirmar.
- Las respuestas del banco de preguntas se apoyan en el código y nombran el archivo cuando ayuda.
- El glosario solo define términos que el libro usa.
- Si no ejecutaste el proyecto ni sus pruebas, dilo en la introducción.
- No prometas tamaños ni tiempos fijos en títulos ni en textos: nada de «explicado en una página» o «en cinco minutos». El libro se lee en pantallas muy distintas y la paginación cambia: un capítulo que cabe en una página de escritorio ocupa varias en un iPhone.

## 4. Validar

Desde la raíz de este repo:

1. `bun run books:check --strict`. Corrige el MD hasta que salga sin avisos. Revisa que las estadísticas del libro nuevo muestren preguntas, términos y referencias distintos de 0.
2. Muestra al usuario las estadísticas del libro.

`projects/` y `.estante-cache/` están en `.gitignore`: la biblioteca es personal y **no se versiona**. No hagas `git add` de libros ni de diagramas.

## 5. Publicar

Pregunta antes de publicar, porque sube la biblioteca al sitio del usuario. Con el visto bueno:

```bash
bun run deploy
```

Ese comando hace el build en la computadora, donde están los libros y se renderizan los diagramas (requiere `bunx playwright install chromium` una vez), y lo sube a Vercel. Con `--netlify` lo sube a Netlify. La primera vez, la CLI del host pide al usuario iniciar sesión: eso lo hace el usuario, no el agente. Después, el libro aparece en la Biblioteca. En el teléfono, toca su nube para tenerlo sin conexión.
