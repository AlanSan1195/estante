# Machtobs — Explicación técnica y guía de entrevista

> Documento preparado para que puedas explicar tu proyecto en una entrevista técnica. Explica qué es, qué arquitectura tiene, cómo funciona cada pieza, y qué conceptos conviene estudiar porque un entrevistador probablemente te pregunte por ellos.

---

## 1. Qué es el proyecto

**Machtobs** es una aplicación web (SPA) que configura OBS Studio automáticamente para streamers/grabadores que no saben de OBS. En lugar de pedirle al usuario que entienda bitrates, encoders y resoluciones:

1. Detecta su hardware (CPU, GPU, RAM, SO) de forma híbrida (navegador + confirmación manual).
2. Mide su velocidad de subida (test de Cloudflare).
3. Envía specs anónimas de hardware a una IA (Groq en producción) para obtener la configuración ideal de OBS.
4. Muestra un **diff** entre la configuración actual de OBS y la recomendada, con **explicaciones** de por qué cada ajuste importa.
5. Aplica la configuración a OBS con un clic vía WebSocket local, guardando un **respaldo** para poder restaurarla.

Además incluye dos módulos grandes: **perfilado de micrófono con IA** (detecta el modelo, busca specs oficiales en la web y recomienda filtros de audio como ruido, compuerta, compresor, limitador) y **perfilado de consolas** (PS5/Xbox/Switch: analiza la cadena consola → capturadora → monitor, detecta cuellos de botella y recomienda la configuración de captura). También tiene un **complemento nativo de OBS en C++** (`obs-plugin/`) para leer/aplicar ajustes de encoders que el protocolo WebSocket de OBS no expone.

---

## 2. Arquitectura

### 2.1. Tipo de arquitectura (cómo nombrarla en la entrevista)

Si te preguntan "¿qué tipo de arquitectura es?", puedes responder con una combinación de estas etiquetas, en orden de más importante a menos:

1. **Híbrida local + nube (local-first con backend cloud)**. El "plano de control" hacia OBS es 100% local (`ws://localhost:4455`); solo el "plano de datos" (specs anónimas de hardware) viaja a la nube para que la IA decida. Esta es la decisión arquitectónica central del proyecto.
2. **SPA con backend serverless (BFF — Backend For Frontend)**. `api/` son funciones serverless de Vercel que actúan como capa intermedia: ocultan secretos, validan, limitan cuota y normalizan la respuesta de la IA antes de llegar al navegador. El frontend nunca habla con Groq/Tavily directo.
3. **Patrón Facade en el cliente**. `appAPI` (`src/renderer/lib/app-api.ts`) es una fachada única que expone `obs.*`, `system.*` y `ai.*`, ocultando a los componentes los detalles de validación y fallback.
4. **Contrato compartido cliente-servidor**. `src/shared/` contiene los tipos y validadores usados **tanto por el frontend como por las funciones serverless**, evitando contratos duplicados.
5. **Degradación elegante (failover)**: si la IA remota falla o se agota la cuota, un motor local en TypeScript genera la recomendación (`localRecommendation.ts`, `localMicProfile.ts`, `localConsoleProfile.ts`). La app nunca se queda sin respuesta.

Diagrama de flujo:

```text
Navegador (React + Zustand)
   │
   ├─ ws://localhost:4455 ───────────────► OBS Studio (local, privado)
   │        (obs-websocket-js, control)
   │
   └─ HTTPS /api/* (same-origin en Vercel)► Funciones serverless (BFF)
                                              ├─ validación + rate limit (Upstash Redis)
                                              ├─ Groq (IA) + Tavily (búsqueda web)
                                              └─ si falla → motor local en src/shared/

   (dev)  Vite ── proxy /api ──► producción, o Vite ──► Ollama (IA local)
```

### 2.2. Capas del código

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| UI | `src/renderer/components/` | Componentes React por paso del asistente |
| Estado | `src/renderer/store.ts` | Estado global con Zustand |
| Fachada | `src/renderer/lib/app-api.ts` | API única hacia OBS, sistema e IA |
| Integración OBS | `src/renderer/lib/obs-manager.ts` (~2100 líneas) | Todas las llamadas a obs-websocket |
| Cliente IA | `src/renderer/lib/ai-remote.ts` | Llamadas a `/api/*` con validación de respuesta |
| Lógica compartida | `src/shared/` | Tipos, validadores y motores de recomendación local |
| Backend serverless | `api/` | Endpoints HTTP + `_lib/` (groq, http, rate-limit, web-sources) |
| Plugin OBS | `obs-plugin/` | Extensión nativa C++ (CMake) para encoders avanzados |

### 2.3. El flujo del usuario (wizard en 4 pasos)

`conectar → ajustes → detección → escenas`. Un "tab" con estado que se desbloquea progresivamente (`App.tsx:102-107`):

- **01 conectar**: se conecta a OBS por WebSocket (host `localhost`, puerto `4455`).
- **02 ajustes**: modo (stream+rec / stream / rec), plataforma (Twitch/YouTube), formulario de hardware, y si es consola → selector + detección de capturadora.
- **03 detección**: mide subida, analiza (IA con fallback local), muestra el diff en `OBSComparison`, configuración de audio, y el botón de importar/aplicar.
- **04 escenas**: asistente para crear escenas y fuentes (cámara, display, ventana, capturadora de consola, imagen).

---

## 3. Componentes técnicos clave (para explicar con confianza)

### 3.1. Conexión a OBS (WebSocket local)

- Se usa `obs-websocket-js` v5. En el navegador funciona porque solo depende de `WebSocket` global y `crypto.subtle` (necesarios para el handshake de autenticación SHA-256 del protocolo).
- **Seguridad clave**: el password de OBS, las escenas y la configuración **nunca salen de la máquina**. Al cloud solo llegan specs anónimas de hardware.
- **Por qué funciona desde una página HTTPS**: localhost y 127.0.0.1 son *potentially trustworthy origins* en la spec de mixed content → se permite `ws://localhost` desde HTTPS en Chrome/Edge/Firefox. **Safari no lo implementa**, por eso no se soporta. IPs de LAN (192.168.x.x) sí se bloquean → otra razón por la que solo se controla el OBS local.
- **Errores de conexión humanizados**: `obs-manager.ts:227-265` traduce códigos/errores crudos (auth failed, ECONNREFUSED, cierre 1006) a mensajes en español con pasos concretos.

### 3.2. Detección de hardware híbrida

El navegador es una sandbox y no inventa hardware. La estrategia (`system-info.ts`):

| Dato | Método | Limitación |
|---|---|---|
| GPU | WebGL `WEBGL_debug_renderer_info` | Viene en string ANGLE, hay que parsearlo |
| Procesadores | `navigator.hardwareConcurrency` | Estimación, puede ser menor al real |
| RAM | `navigator.deviceMemory` | Solo Chrome y **saturado en 8 GB** (anti-fingerprinting) |
| CPU model / RAM | **Formulario manual confirmado por el usuario** | Persistido en localStorage versionado |

→ La regla de diseño: las APIs del navegador solo dan *pistas* para pre-llenar el formulario; la decisión final la confirma el usuario. Los datos confirmados se guardan en `localStorage` con versión de esquema (`machtobs-hardware`, v2) para no reutilizar valores no confirmados de versiones viejas.

### 3.3. El BFF serverless (api/)

Cada endpoint sigue el mismo pipeline (`recommendation.ts`, `explanation.ts`, `audio-profile.ts`, `console-profile.ts`, `web-search.ts`):

```text
requireJsonPost (método POST + content-type + Origin permitido)
   → checkRateLimit (Upstash Redis, límite diario por install-id + IP)
   → validateRequest (validadores de src/shared)
   → llamada a IA (Groq) con prompt en español → JSON
   → normalizar/“reparar” la respuesta del modelo
   → validateResponse (otra vez los validadores compartidos)
   → devolver JSON con headers de rate limit
```

Puntos para destacar:

- **Rate limiting en serverless** (`rate-limit.ts`): en Vercel las funciones no tienen memoria compartida, por eso se usa **Upstash Redis** (REST). Clave doble: `install-id` (UUID generado y guardado en localStorage) + IP. Límite diario configurable (`MACHTOBS_AI_DAILY_LIMIT`, default 20). En dev con Ollama se salta el límite; con un contador en memoria solo si se habilita explícitamente (nunca en producción).
- **Validación en ambos lados**: el navegador valida antes de enviar y después de recibir; el servidor valida antes de llamar a la IA y después de recibir su respuesta. El contrato compartido `src/shared/validation.ts` (más de 1200 líneas) produce también los mensajes de error en español.
- **Reparación de respuestas de IA** (`recommendation.ts:38-96`): los modelos son impredecibles — escriben "1080p", "1920 x 1080" o "1920×1080" en vez de `1920x1080`. Hay un normalizador de resoluciones y un "repair" que recalcula encoder y bitrates de forma determinista a partir del hardware (la IA no decide libremente el encoder/bitrate: el backend lo impone según el hardware, plataforma y red). Esto hace el sistema tolerante a alucinaciones de formato.
- **Fallback del backend**: si falta config de Upstash, la IA remota falla "de forma segura" (rate limit rechazado → el cliente usa el motor local).

### 3.4. Seguridad en la búsqueda web (Tavily) — prompt injection

`api/_lib/web-sources.ts` es una pieza muy valiosa para mencionar en entrevista:

- **Allowlist de dominios** (solo fabricantes oficiales: elgato.com, shure.com, etc.). Cualquier resultado web que no venga de un dominio confiable se descarta.
- **Evidencia marcada como no confiable**: el contenido de la web se delimita con etiquetas `UNTRUSTED_WEB_EVIDENCE` y un instructivo en el prompt del sistema le dice al modelo que **nunca siga instrucciones que vengan de la web** (solo la use como datos). Es mitigación de prompt injection desde resultados de búsqueda.
- Validación estricta de URLs (solo `https:`, sin usuario/password/puerto, hostname confiable, sin IPs).

### 3.5. El motor local (fallback sin IA)

`src/shared/localRecommendation.ts` replica la lógica de un experto:

- **Elección de encoder** según vendor de GPU: `nvenc` (NVIDIA), `apple vt h264/hevc` (Apple Silicon), `qsv` (Intel), `amd`, `x264` (CPU).
- **Bitrate de stream** según plataforma y resolución, limitado por la subida medida (reserva 30% de margen, redondeo a saltos de 500 kbps — evita falsa precisión).
- **Techo de resolución de grabación** según RAM y presencia de encoder por hardware (ej. Apple Silicon de 16 GB → 1440p60 como máximo en modo stream+rec, para no saturar las dos codificaciones simultáneas).
- Respeta la configuración previa de OBS (`currentSettings`) como base, salvo que supere el techo seguro del hardware.
- Genera explicaciones ("reasoning") coherentes y hasta valida que la explicación de la IA no afirme lo contrario de la física (`isRecommendationExplanationConsistent` en `localRecommendation.ts:410`).

### 3.6. Aplicar la configuración a OBS + respaldo

`obs-manager.ts:656` (`configure`):

1. Lee la configuración actual (snapshot) y la guarda en `localStorage` como respaldo (`machtobs-backup`), validado al restaurar.
2. Configura el servidor de stream (`rtmp_custom` con el server de Twitch/YouTube).
3. Aplica resolución de lienzo/salida/FPS vía `SetVideoSettings`.
4. Escribe parámetros de perfil (`SetProfileParameter`): modo Simple o Advanced, encoders, bitrates, formato, etc.
5. Configura el audio (fuente de micrófono, filtros, mono, ducking) si viene en la recomendación.
6. Si el modo requiere Advanced Output y hay grabación, intenta aplicar los ajustes internos del encoder a través del **plugin nativo**; si no está instalado, avisa que esos valores quedan como "manuales" (no confunde al usuario con valores incorrectos).

### 3.7. El complemento nativo de OBS (obs-plugin/)

`obs-websocket` no expone los ajustes internos de los encoders (bitrate, rate control, keyframes, perfil, B-frames, AQ espacial) en Salida Avanzada. El plugin en C++ (CMake):

- Lee `streamEncoder.json` y `recordEncoder.json` del perfil, combinándolos con los defaults reales del encoder.
- Expone dos vendors al protocolo de OBS: `GetAdvancedOutputConfig` y `ApplyAdvancedOutputConfig` (vía `CallVendorRequest`).
- Escribe de forma segura con `obs_data_save_json_safe` (OBS guarda copia `.machtobs-backup`), rechaza cambios durante stream/grabación activos, y nunca lee/devolverá claves de stream ni escenas.
- El frontend intenta tres nombres de vendor para compatibilidad con versiones publicadas antes (`machtobs`, `match-to-obs`, `obsee`).

### 3.8. Perfilado de audio (micrófono)

- El nombre del dispositivo llega desde OBS; el backend intenta en cascada: **Tavily** (búsqueda de specs oficiales) → **Groq con modelo de búsqueda** (`GROQ_SEARCH_MODEL`) → **conocimiento del modelo**.
- Las reglas del prompt obligan a citar evidencia concreta y prohiben frases genéricas ("mejora la calidad") y prohiben inventar ganancias/umbrales a partir de la ficha técnica (el ruido de la habitación no está en la spec).
- En el endpoint `audio-profile.ts` se aplica `applyEvidenceBasedMicFilterPolicy` para decidir qué filtros aplicar, ajustar u omitir según el perfil y el modo.
- `localMicProfile.ts` es el fallback sin IA.

### 3.9. Perfilado de consolas

- Detecta capturadora/monitor vía `mediaDevices.enumerateDevices()` (con el baile de permisos: pedir `getUserMedia`, detener tracks inmediatamente, luego enumerar para obtener labels reales).
- Lee las **capacidades reales de la capturadora desde OBS** (no se adivinan por nombre): resolución/fps máximos de captura.
- La IA hace match de la cadena consola → capturadora → monitor, identifica el cuello de botella (normalmente la capturadora: distingue captura vs passthrough), da pasos para configurar la consola, y genera recomendaciones de OBS.

---

## 4. Decisiones de arquitectura con "por qué" (para defenderlas)

| Decisión | Por qué |
|---|---|
| El control de OBS es local, no en la nube | Privacidad (password y escenas nunca salen de la PC) y es lo único que permite el navegador (mixed content bloquea IPs de LAN) |
| Backend serverless como BFF | Oculta secretos, valida, limita cuota, y normaliza la salida de la IA; el frontend nunca toca las APIs de IA |
| Motor local como fallback | "Nunca sin respuesta": red caída o cuota agotada no dejan al usuario a medias |
| Validación compartida en `src/shared` | Un solo contrato, sin drift entre cliente y servidor; protege a OBS de inputs inválidos |
| Reparación de salida de IA en el backend | Los modelos son no-deterministas; los valores críticos (encoder, bitrate) se calculan determinísticamente por el servidor |
| IA local (Ollama) en desarrollo | `pnpm dev` ejecuta los mismos handlers de `api/` contra Ollama: misma lógica, cero cuota de producción |
| Zustand (no Redux) | Estado global moderado; API mínima con `create`; evita boilerplate |
| Respaldos en localStorage | Simple y suficiente para configuraciones pequeñas; versionado para migrar el esquema |
| CSP estricta + `assetsInlineLimit: 0` | Vite incrustaba fuentes como `data:` y la CSP las bloqueaba en producción; se desactivó el inline en vez de relajar la CSP |
| Plugin C++ nativo | Cubre el gap que `obs-websocket` no expone sin hackear archivos de perfil desde JS |

---

## 5. Stack y tooling (para enumerar rápido)

- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS 3, Zustand 5, Testing Library + Vitest.
- **Backend**: Funciones serverless de Vercel (Node), `groq-sdk`, Tavily REST, Upstash Redis REST.
- **Browser → OBS**: `obs-websocket-js` v5.
- **Medición de red**: `@cloudflare/speedtest` (upload en cascada: 100 KB → 1 MB → 10 MB; percentil 25 = subida sostenida).
- **Build/CI**: `pnpm run security:csp` (verifica CSP, hash del JSON-LD, WebSocket a localhost) → `typecheck:api` → `vite build`. `vercel.json` define headers de seguridad (CSP, X-Frame-Options, etc.).
- **Testing**: tests colocalizados `*.test.ts(x)`, unitarios y de componentes, más tests del backend en `api/`.

---

## 6. Temas de estudio para la entrevista

Estos son los conceptos que más probablemente te pregunten **porque están directamente en tu proyecto**. Repásalos y podrás responder con código real:

### 6.1. Nivel 1 — seguro que preguntan (déjalo dominado)

1. **WebSocket y el protocolo obs-websocket v5**: handshake, autenticación, request/response con `message-id`, `CallVendorRequest`, eventos. Saber por qué `obs-websocket-js` corre en el navegador (depende de `WebSocket` + `crypto.subtle`).
2. **Mixed content / Potentially Trustworthy Origins**: por qué `ws://localhost` desde HTTPS está permitido (y por qué no desde LAN), y por qué Safari no soporta la app.
3. **Rate limiting en arquitectura serverless**: por qué un Map en memoria no sirve en Vercel (instancias efímeras), el rol de Upstash Redis, claves dobles (install-id + IP), límite diario con TTL hasta medianoche.
4. **Validación en el límite (boundary validation)**: por qué validar en cliente y servidor, runtime validation vs tipos de TypeScript (los tipos solo existen en compilación), el patrón de "validators que producen el tipo".
5. **Fallback / degradación elegante**: el patrón try-remote → catch → local, con mensaje al usuario que explica que la IA no está disponible.
6. **CSP y seguridad de headers**: `default-src 'self'`, por qué el inline de assets rompe las fuentes, `frame-ancestors`, `object-src`, `base-uri`.
7. **Secretos en frontend vs backend**: la regla `VITE_*` (se incrusta en el bundle público) vs variables solo en Vercel.

### 6.2. Nivel 2 — si vas a una entrevista de frontend/React

8. **Zustand vs Redux/Context**: ventajas (boilerplate, selectores, no provider), cuándo usaría cada uno.
9. **React 19**: qué cambió (acciones, `use()`, refs como props, etc.). Al menos conocer qué versiones usas.
10. **State flow en un wizard**: estado global vs local, cómo el store coordina pasos bloqueados.
11. **Componentes de presentación vs contenedores**, test de componentes con Testing Library, `user-event`.

### 6.3. Nivel 2 — si vas a una entrevista de backend/IA

12. **Prompt engineering para salida estructurada**: definir un JSON shape exacto en el prompt, `response_format: json_object`, y sobre todo **reparar/normalizar la salida** porque los modelos no son confiables.
13. **Prompt injection** (tu `UNTRUSTED_WEB_EVIDENCE` es un ejemplo real): delimitación de datos no confiables, allowlist de dominios, instrucciones de sistema que prohíben seguir contenido web.
14. **SSRF / validación de URLs** en `web-sources.ts`: solo dominios confiables, solo HTTPS, sin IPs.
15. **Arquitectura BFF**: por qué una capa intermedia para agregación de IA + secretos + rate limit.
16. **Abstracción multi-proveedor de IA** (`ai-provider.ts`): patrón de fachada sobre Groq/Ollama para cambiar de proveedor sin tocar los endpoints.

### 6.4. Nivel 2 — si preguntan por OBS/streaming (tu dominio)

17. **Encoders**: NVENC (hardware NVIDIA), Apple VT (VideoToolbox), QSV (Intel), AMF (AMD), x264 (CPU). Hardware vs software: carga de CPU/GPU.
18. **Bitrate y plataformas**: por qué Twitch ≈ 6000–8000 kbps y YouTube admite más; reserva de margen sobre la subida.
19. **Resolución de grabación vs stream**: por qué se separan (el archivo local no debe degradarse al límite del stream), lienzo (canvas) vs salida.
20. **Cuello de botella en captura de consola**: captura vs passthrough en capturadoras; techo real leído de OBS.
21. **Filtros de audio en OBS**: compuerta (noise gate), compresor, limitador, supresión de ruido (rnnoise/speex/nvafx), mono, ducking, offset de sincronía.
22. **Plugin nativo de OBS**: por qué `obs-websocket` no expone los internos del encoder y cómo el plugin los cubre (leer `streamEncoder.json`, `CallVendorRequest`, escritura segura).

---

## 7. Preguntas típicas de entrevista con respuesta-resumen

> Para cada una, tu respuesta debería sonar natural y apoyarse en tu código. Aquí va un guion corto.

**"Cuéntame sobre un proyecto del que estés orgulloso."**
Machtobs: una web que configura OBS por ti. El punto que más destaco es la arquitectura híbrida: el control de OBS es 100% local (WebSocket a localhost, privacidad del password del usuario) y solo las specs anónimas del hardware van a una IA serverless que recomienda la configuración, con motor local de respaldo si la IA no está disponible. Además explico qué cambia y por qué, no solo lo aplica como caja negra.

**"¿Por qué elegiste funciones serverless y no un backend clásico?"**
Porque la app no tiene base de datos ni sesiones: es un SPA que necesita 4 endpoints de IA de uso esporádico. Vercel Functions encajan, escalan a cero y mantienen los secretos (Groq/Tavily/Upstash) fuera del bundle público. La desventaja que encontré es la falta de memoria compartida → por eso el rate limit usa Upstash Redis en vez de un contador en memoria.

**"¿Cómo maneja tu app el caso de que la IA falle?"**
Doble fallback. En el servidor, si Upstash no responde, el rate limit falla de forma segura y el endpoint responde 429/500. En el cliente, `appAPI.ai.*` intenta la IA remota y en `catch` ejecuta un motor local en `src/shared/` que genera una recomendación determinista con reglas de experto (encoder según GPU, bitrate según plataforma y subida medida, techos de resolución por RAM). El usuario ve que la IA no estaba disponible pero no se queda sin respuesta.

**"¿Cómo validas la salida de un LLM, que no es confiable?"**
Tres capas: (1) el prompt exige un JSON shape exacto y los modelos se configuran con `response_format: json_object`; (2) un normalizador repara variantes de formato (resoluciones como "1080p"); y (3) la salida pasa por los mismos validadores compartidos del proyecto, y los valores críticos (encoder, bitrate, resolución de grabación) se recalculan de forma determinista en el backend según el hardware y la red — la IA no decide libremente esos campos.

**"¿Cómo evitas que la búsqueda web inyecte instrucciones maliciosas al modelo?"**
Solo uso resultados de dominios de fabricantes en una allowlist, delimitados con etiquetas `UNTRUSTED_WEB_EVIDENCE`, y un instructivo en el prompt del sistema que le dice al modelo que ese contenido es solo datos y que nunca siga instrucciones que vengan de ahí. Además las URLs se validan estrictamente (solo HTTPS, sin IPs, sin credenciales).

**"¿Por qué no se puede detectar la CPU/RAM real desde el navegador?"**
El navegador es una sandbox por privacidad. CPU: no hay API para el modelo, solo `hardwareConcurrency` (estimación). RAM: `navigator.deviceMemory` solo en Chrome y saturado a 8 GB anti-fingerprinting. GPU: sí se detecta vía WebGL pero el string viene "envuelto" en ANGLE y hay que parsearlo. Por eso el hardware es detección híbrida: pistas del navegador + confirmación manual del usuario.

**"¿Cómo aplicas la configuración a OBS?"**
Por WebSocket con `obs-websocket-js`: `SetVideoSettings` para lienzo/resolución/FPS, `SetProfileParameter` para los parámetros de perfil (Simple/Advanced), `SetStreamServiceSettings` para el servidor RTMP. Antes de tocar nada, guardo un snapshot en localStorage como respaldo, y existe un flujo de restauración. Para los internos de los encoders uso un plugin nativo que expone vendors `GetAdvancedOutputConfig`/`ApplyAdvancedOutputConfig`.

**"¿Qué es la CSP y qué problema real resolvió en tu proyecto?"**
CSP = Content Security Policy, headers que restringen qué recursos puede cargar el navegador. En Machtobs resolvió un bug real: Vite incrusta como `data:` URI los assets < 4 KB; las fuentes (woff2 de ~3.9 KB) quedaban incrustadas y la CSP (`default-src 'self'` sin `font-src`) las bloqueaba solo en producción. La solución fue `assetsInlineLimit: 0` en Vite en vez de relajar la CSP.

**"¿Cómo mides la velocidad de subida para recomendar bitrate?"**
Con `@cloudflare/speedtest`, midiendo upload en cascada (100 KB → 1 MB → 10 MB). Uso el percentil 25 de las muestras grandes como "subida sostenida", clasifico estabilidad (stable/variable/unstable) y el bitrate reserva un 30% de margen sobre esa subida sostenida, redondeado a saltos de 500 kbps para no dar una precisión falsa.

**"¿Qué harías mejor / qué cambiarías?"** (pregunta trampa, ten preparada una respuesta honesta)
- Migrar la validación a un esquema (zod) para reducir el código manual de `validation.ts`.
- Añadir más tests de integración E2E (los de componente ya existen) y un test del plugin C++.
- Métricas/observabilidad en los endpoints (latencia por proveedor, tasa de fallos).
- Caché de perfiles de micrófono/consola por modelo para no pagar cuota repetida.

---

## 8. Cheatsheet de números y hechos rápidos

- Puertos: OBS WebSocket `4455`, dev server `5173`.
- Stack: React 19 + Vite 6 + TS 5 + Tailwind 3 + Zustand 5.
- Backend: Vercel Functions, Groq (`openai/gpt-oss-120b`), Tavily, Upstash Redis.
- Límite diario IA: 20 por defecto (`MACHTOBS_AI_DAILY_LIMIT`, 1–1000).
- Subida sostenida = percentil 25; margen de bitrate = 30%; saltos de 500 kbps.
- Encoders: nvenc / apple vt h264 / apple vt hevc / qsv / amd / x264.
- Formatos de grabación: `mkv` recomendado; calidad `high`.
- Resoluciones válidas: 720p/1080p/1440p/2160p, formato `ancho x alto` (ej. `1920x1080`).
- Backup en `localStorage`: clave `machtobs-backup`; hardware: `machtobs-hardware` (schema v2); install-id: UUID en localStorage (header `X-Machtobs-Install-Id`).
- `ws://localhost` desde HTTPS: permitido en Chrome/Edge/Firefox, bloqueado en Safari.
- Entornos: `pnpm dev` = Ollama local; `pnpm dev:remote` = producción real (consume cuota).

---

## 9. Cómo practicar

1. **Levanta la app** (`pnpm install`, `ollama pull gpt-oss:20b`, `pnpm dev`) y recorre el wizard completo con OBS abierto. Conocer el flujo de primera mano te hace sonar creíble.
2. **Rastrea un flujo completo en el código** de punta a punta: haz clic en "Analizar" → `AnalyzeButton` → `appAPI.ai.getRecommendation` → `ai-remote.getRemoteRecommendation` → `/api/recommendation` → `groq.getRecommendationFromGroq` → `chatWithAI` → normalizar → validar → devolver; en fallo → `localRecommendation`. Si puedes explicar ese recorrido, ya ganaste la entrevista.
3. **Explícate en voz alta cada diagrama de arriba** hasta que no necesites mirarlo.
4. Repasa `docs/apuntes.md`: son tus propias lecciones documentadas (CSP+Vite, WebSocket local, detección de hardware, proxy de CORS, regla VITE_*). Es material de oro que ya escribiste.