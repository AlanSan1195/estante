---
name: libro
description: Genera el libro de estudio de un proyecto (projects/INFO_PROYECT_<NOMBRE>.md) leyendo su código, con el formato que entiende Estante, y lo valida con books:check. Úsala cuando pidan crear, generar o rehacer el libro o el INFO_PROYECT de un proyecto, o con /libro <ruta-o-url>.
---

# /libro

Genera el libro de estudio del proyecto indicado en los argumentos: una ruta local, por ejemplo `../mi-proyecto`, o la URL de un repositorio. Si no hay argumento, pregunta cuál.

Sigue al pie de la letra `docs/generar-libro.md` de este repo. Ese archivo es la única fuente del procedimiento y también lo usan otros agentes. El formato exacto está en `docs/formato-libro.md`.

Puntos que no se negocian:

- Escribe solo `projects/INFO_PROYECT_<NOMBRE>.md` (y, si hay diagramas, `.estante-cache/diagrams` vía `bun run build`). No toques el código de la app.
- Copia el código desde los archivos reales. Cada afirmación importante lleva una referencia `ruta:línea` comprobada.
- Termina con `bun run books:check --strict` sin avisos.
- Pide confirmación antes de hacer commit o push.
