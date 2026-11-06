# Estante

Estante convierte el Markdown de un proyecto de software en un **libro de estudio**. Puedes leerlo desde el navegador o el teléfono, consultar el glosario, subrayar y repasar con tarjetas de preguntas.

Creé Estante para estudiar mis propios proyectos de *vibe coding*. Con ayuda de la IA puedo construir herramientas con tecnologías que todavía no domino y explorar soluciones que quizá no habría encontrado por mi cuenta. Luego vuelvo al código para entender cómo encajan las piezas, qué hace cada una y por qué se eligieron esa arquitectura y esas estrategias. Así puedo explicar cómo funciona el proyecto de principio a fin y defender mis decisiones en una entrevista técnica.

## Cómo usarlo

### 1. Clona Estante

Necesitas Git, Bun y Node.js 22.23.4 o superior. Con clonar basta para usarlo. Haz un fork si quieres mantener tu propia versión de la app en GitHub.

```bash
git clone https://github.com/AlanSan1195/estante.git
cd estante
bun install
bunx playwright install chromium
```

Estante usa Chromium para renderizar los diagramas Mermaid.

### 2. Añade un libro

Si ya tienes un Markdown de tu proyecto, cópialo a `projects/` con el nombre `INFO_PROJECT_<NOMBRE>.md`.

```bash
cp ../mi-proyecto/guia.md projects/INFO_PROJECT_MI_PROYECTO.md
```

También puedes pedirle a tu agente que lea el código y escriba el libro. Si usas Claude Code, ejecuta este comando desde la raíz de Estante.

```text
/libro ../mi-proyecto
```

En Codex u otro agente, pídele que analice `../mi-proyecto` y genere el Markdown siguiendo la [guía para generar un libro](docs/generar-libro.md). Para escribirlo a mano, usa la [plantilla Markdown](docs/formato-libro.md#plantilla). La IA es opcional. Estante construye el libro a partir del archivo que le das.

### 3. Revisa y abre tu biblioteca

```bash
bun run books:check
bun run dev
```

Abre la URL que muestra la terminal, normalmente [localhost:4321](http://localhost:4321). Si aún no añadiste un libro, la biblioteca mostrará el [tutorial de Estante](examples/).

## Lleva tus libros al teléfono

Para instalar Estante y leer sin conexión, publica tu biblioteca en un sitio con HTTPS. Ejecuta el comando de tu proveedor.

```bash
bun run deploy            # Vercel
bun run deploy --netlify  # Netlify
```

La primera vez, el proveedor te pedirá iniciar sesión y vincular el sitio. Abre la URL publicada y añade Estante a la pantalla de inicio. En **Biblioteca**, toca la nube de un libro para descargarlo y leerlo sin conexión.

Git ignora los libros de `projects/`. Al desplegar, sí se suben al sitio y quedan accesibles para quien tenga la URL, salvo que actives un control de acceso.
