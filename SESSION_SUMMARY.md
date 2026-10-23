# Resumen de sesión — Proyecto encuesta-HH

> Archivo de contexto para continuar el trabajo en próximas sesiones.
> Última actualización: 23/10/2026

## Objetivo del proyecto

Conectar con la API de Jotform, extraer la **estructura** y las **respuestas** de un formulario real y generar una **web estática equivalente** (HTML/CSS/JS vanilla, sin dependencias, Node ≥18 con fetch nativo). **Las respuestas nuevas se envían directo a Supabase** (modo `supabase`, defecto): la web es independiente de Jotform para el envío; la API de Jotform solo se usa para leer estructura/histórico (`npm run fetch`).

## Formulario conectado

| Dato | Valor |
|---|---|
| Título | **Nuestro uso del Agua en la UNL** (encuesta de huella hídrica) |
| Form ID | `261533323515046` |
| URL original | https://form.jotform.com/261533323515046 |
| Credenciales | En `.env` (gitignored) — API key + form ID. Ver `.env.example` |
| Campos | 39 preguntas (35 renderizables + 8 pagebreaks + button) |
| Páginas | 9 (8 cortes `control_pagebreak`) |
| Respuestas | 137 descargadas |

## Arquitectura (pipeline)

```
Jotform API → scripts/fetch-jotform.mjs → data/*.json → scripts/generate-site.mjs → site/
```

| Ruta | Función |
|---|---|
| `.env` | `JOTFORM_API_KEY`, `JOTFORM_FORM_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (nunca commitear) |
| `scripts/fetch-jotform.mjs` | Descarga detalles, preguntas, propiedades, cálculos, condiciones y todas las respuestas (paginado, 100/página). Normaliza a `data/form-structure.json` + `data/submissions.json`; crudos en `data/raw/` |
| `scripts/generate-site.mjs` | Genera `site/` (index.html, styles.css, app.js, respuestas.html/js, datos/) |
| `templates/styles.css`, `templates/app.js` | Plantillas base copiadas a `site/` con tokens (`__ACCENT__`) |
| `docs/HuellaHidrica.png` | Imagen original del footprint (1.3 MB, fondo negro) — **la que se usa**: el generador la copia a `site/assets/HuellaHidrica.png` y sirve de marca de agua (`body::before`, opacidad 0.8, tamaño `auto 100vh` — el alto llena la pantalla y el ancho escala por proporción) |
| `docs/HuellaHidrica-mark.png` | Versión 800 px con fondo transparente (452 KB) — generada el 19/10 pero **no en uso** (queda como fallback si falta el original) |
| `scripts/serve.mjs` | Servidor estático mínimo (puerto 8080 por defecto) |
| `scripts/check-calcs.mjs` | Verifica ecuaciones contra respuestas históricas |
| `data/site-config.json` | Config opcional de generación (no creado aún; ver defaults abajo) |

### Comandos

```bash
npm run fetch      # descargar datos de Jotform
npm run generate   # generar site/
npm run build      # fetch + generate
npm run serve      # http://localhost:8080
npm run export-supabase  # genera data/respuestas_hh.sql + .csv para Supabase
npm run dashboard     # genera dashboard/index.html (KPIs + gráficos + tabla)
```

## Funcionalidad replicada (importante)

El formulario usa tipos avanzados de Jotform; todo fue implementado a medida:

1. **Multipágina real** — `control_pagebreak`; títulos tomados del primer `head`/`text` de cada página (los `pageInfo` del dueño están desordenados, no usarlos). Textos de botón desde el pagebreak (`Siguiente`/`Atrás`).
2. **Cálculos Jotform** (`control_calculation` + propiedad `calculations`) — ecuaciones tipo `({3}*6)+({4}*0.5)` con `{qid}`; `resultField` indica destino. Evaluadas en cliente (`templates/app.js`: `evalCalculation`, `topoCalcs`, orden topológico + 2 pasadas). Auto-referencias (qid 55 = `{55}*10/30`) se evalúan como 0. Decimales según `decimalPlaces`. Campos ocultos → `input hidden`; visibles (q56 litros/día, q63 litros/mes) → caja de resultado readonly con `subLabel`.
3. **Condiciones** (propiedad `conditions`, JSON string anidado) — 5 reglas de Jotform: hide si Género=Femenino (mingitorio q4), disable/requerido q68 si q67=No, hideMultiple [53,49] si infusiones=Ninguna, show 49 si=Café, hide 68 si=No. **+1 inyectada (22/10)** vía `EXTRA_CONDITIONS` en generate-site.mjs: show q68 si q67=Sí (q68 «veces por semana en comedor» solo visible si q67=Sí; arranca oculta porque ahora es target de Show). Motor: `applyConditions()` en app.js; campos con acción `Show` arrancan ocultos; `clearOnHide` respetado (actualmente `false`).
4. **Bloques informativos** `control_text` — se conserva el **HTML crudo** (`extra.html`) con imágenes hotlinkeadas a `www.jotform.com/uploads/...`.
5. **Escalas** — `scaleFrom` + `scaleAmount` → rango real (q16: 0–6; q18: 0–14). q16 se renderiza como **escala de botones** (radios 0–6, quitada del slider el 22/10); q18 sigue como **slider** (`input type=range`) vía `SLIDER_SCALE_QIDS` en generate-site.mjs (ahora solo `'18'`); el valor del slider se muestra debajo en `--hh-muted` y se recalcula en `input`. Conservan `id=f-{qid}` y `name` originales para cálculos/submit.
6. **Números** — `minValue`/`maxValue` → attrs min/max + validación JS.
7. **«Otro»** en radio/checkbox (`allowOther`), required, validación en español.
8. **Envío a Supabase (23/10, reemplaza al modo jotform)** — `submitMode: "supabase"` (defecto). `templates/app.js` → `submitToSupabase()`: recolecta por qid (`answerValueByQid`, respeta campos ocultos por condiciones, «Otro» → texto), mapea con `CFG.columns` (el mapping `COLUMNS` de `scripts/columns.mjs` se incrusta en `window.HH_CONFIG` desde `generate-site.mjs`), numéricos→`Number`/`null`, `POST {SUPABASE_URL}/rest/v1/respuestas_hh` con headers `apikey`/`Authorization: Bearer`/`Prefer: return=minimal`. Fila: `submission_id` = `crypto.randomUUID()`, `created_at` = ISO now, `status='web'` + 16 columnas. Éxito → thankYou + reset; error → mensaje «No se pudo enviar…» con detalle HTTP, botón se re-habilita (no se pierde la respuesta). El modo `"demo"` sigue disponible vía `site-config.json`. El generador valida que `SUPABASE_URL`/`SUPABASE_ANON_KEY` existan (lee `.env` con parser propio o env vars) y sale con error claro si faltan; ya no genera `action` a Jotform ni `enctype` ni input `formID`.
9. **respuestas.html** — tabla embebida (JSON inline, funciona en file://) con buscador; excluye hidden/head/text/pagebreak.
10. **Navegación (custom 19/10, ajustada 22/10)** — botón «Atrás» solo en el bloque inferior `.hh-actions` (`data-hh="prev"`; el botón superior por sección se eliminó el 22/10 junto a su CSS `.hh-btn-back`); «Enviar» (`data-hh="submit"`) solo visible en la última página; el head duplicado del título en página 1 se omite (`q.label === page.title`); página 1 tiene título al 175% + subtítulo fijo: «En la UNL estamos dando un nuevo paso: comenzamos a gestionar nuestra Huella Hídrica.»

### Verificación

- `scripts/check-calcs.mjs`: **725/735** resultados históricos reproducen las ecuaciones actuales. Las ~10 discrepancias son de respuestas viejas hechas con fórmulas anteriores (el dueño editó ecuaciones) — no es bug.
- Extracción de respuestas corregida: usar `prettyFormat` → `answer` (si la clave existe) → `''`. Nunca hacer fallback al objeto entero (generaba ruido tipo "huellaDe, 34, ...").
- Servidor smoke-test OK: `/`, `/respuestas.html`, `/styles.css`, `/app.js`, `/respuestas.js`, `/datos/*.json` → 200.

## Estado actual

- ✅ Pipeline completo funcionando con datos reales; web generada en `site/` (index ~30 KB, respuestas ~41 KB).
- ✅ Rediseño visual (19/10, iterado con el usuario): fondo **#009bb4** (cambiado el 22/10; antes #005875 → #00a3ad → #097cc0), texto principal **#005875** (secundarios teal al 62%), títulos/badge/pie en blanco sobre el fondo oscuro; marca de agua del footprint (imagen original) fija al **0.8** de opacidad y `auto 100vh` (alto = pantalla, 23/10); tarjeta blanca con sombra en capas, botones y progreso con degradado del accent; sliders en q16/q18; «Atrás» solo abajo; «Enviar» solo en la última. Plantilla: `templates/styles.css` + `templates/app.js` + `scripts/generate-site.mjs`; el asset se copia en cada `npm run generate`.
- ✅ Cambios 22/10 (con usuario, vía servidor local :8080):
  - Eliminado el botón «Atrás» superior de cada sección (`renderPage` en generate-site.mjs) + su CSS `.hh-btn-back`; queda solo el inferior.
  - q3 «veces por día usa el inodoro» restringida a **enteros 0–10** vía `NUMBER_LIMITS` (override del generador).
  - q68 «veces por semana almorzá en el comedor» ahora **solo visible si q67=Sí**, vía `EXTRA_CONDITIONS` (override del generador; la regla Hide de Jotform si q67=No sigue activa).
  - q16 «días por semana en la UNL» dejó de ser slider → **escala de botones 0–6** (quitada de `SLIDER_SCALE_QIDS`, ahora solo `'18'`).
  - Footer de index: **eliminados los enlaces** «Ver respuestas registradas» y «Formulario original en Jotform» (`generate-site.mjs`); queda solo `footerText` si se configura. `respuestas.html` sigue accesible por URL directa.
  - `site/` regenerado y verificado; `SESSION_SUMMARY.md` al día.
- ✅ Servidor de prueba: `Start-Process node -ArgumentList "scripts/serve.mjs","8080"` (detener con `Get-NetTCPConnection -LocalPort 8080` → `Stop-Process`).
- ⚠️ `respuestas.html` contiene **datos personales** de 137 personas — riesgo si se publica.
- Config por defecto de generación: `submitMode: "supabase"`, `accentColor: "#005875"`, `showResponsesPage: true`, `lang: "es"`.
- ✅ **23/10 — envío independiente a Supabase (verificado con el usuario)**: la web ya no envía a Jotform. Hecho: política de solo INSERT aplicada en Supabase (probada con INSERT vía API → 201), `SUPABASE_ANON_KEY` en `.env` (208 chars, embebida en `site/index.html`), `npm run generate` OK, envío real desde :8080 → fila visible en Table Editor. `scripts/serve.mjs` ahora manda `Cache-Control: no-cache` (antes el navegador cacheaba la versión vieja). La política vive en `policy-anon-insert.sql` (raíz, trackeada; `data/` es gitignore).

## Despliegue (22/10)

- Repo: **https://github.com/HH-UNL/Encuesta_UsoDelAgua.UNL** (público, branch `main`).
- GitHub Pages habilitado desde la **raíz** (`/`); `index.html` en la raíz redirige a `site/` (Pages solo sirve `/` o `/docs`).
- **URL pública: https://hh-unl.github.io/Encuesta_UsoDelAgua.UNL/** → redirige a `/site/`. **Dashboard: https://hh-unl.github.io/Encuesta_UsoDelAgua.UNL/dashboard/** (ambas verificadas con 200 el 22/10).
- **Datos personales NO publicados**: `.gitignore` excluye `site/respuestas.html`, `site/respuestas.js`, `site/datos/submissions.json` (verificado 404 en Pages). Los datos quedan en local en `data/` (gitignored) para importarlos después a **Supabase** (con RLS = solo visibles para el dueño). *Excepción 22/10: la tabla individual sí se publica en `/dashboard/` por decisión explícita del usuario (ver sección Dashboard).*
- Tras cada `npm run generate`, hacer `git add -A && git commit && git push` para actualizar Pages (tarda ~1 min en rebuild).

## Base de datos Supabase (22/10)

- Proyecto Supabase: `Encuesta_UsoDelAgua.UNL` (ref `dnyhvtpgdjyqlpoprtlc`, us-east-1).
- Tabla **`public.respuestas_hh`**: `submission_id` (pk) + `created_at` + `status` + 16 columnas de respuestas (`unidad_academica`, `genero`, `vinculo_unl`, `dias_semana`, `horas_dia`, `inodoro_dia`, `mingitorio_dia`, `litros_dispenser`, `infusiones`, `litros_mate`, `tazas_cafe`, `almorza_comedor`, `veces_comedor_semana`, `copias_mes`, `huella_diaria`, `huella_mensual`). **137 filas** cargadas y verificadas (avg huella_diaria 355,27; 134/137 con huella).
- **RLS activa**: la web puede **INSERTar** con la anon key gracias a la política `policy-anon-insert.sql` (`for insert to anon with check (true)`, aplicada el 23/10 y verificada con INSERT → 201). Sin SELECT/UPDATE/DELETE: los datos solo se leen desde el **dashboard de Supabase** (Table Editor con service role). «Solo el dueño».
- Carga del histórico: `npm run export-supabase` genera `data/respuestas_hh.sql` (+ `.csv`) desde `data/submissions.json`; ejecutarlo en el SQL Editor. **Desde 23/10 NO trunca por defecto** (`INSERT … ON CONFLICT DO NOTHING`) para no borrar las filas que la web captura directo; `--truncate` restaura el comportamiento viejo. La primera carga se hizo vía Management API con un PAT (ya **eliminado** por el usuario después del uso).
- `scripts/export-supabase.mjs` mapea qid→columna con `COLUMNS` explícito (16 campos; excluye head/text/pagebreak/cálculos ocultos). IP NO se subió: queda solo en `data/submissions.json` local.
- `data/` es gitignore completo → SQL/CSV/policy nunca van al repo ni a Pages.

## Dashboard público (22/10, refactorizado 23/10)

- **URL: https://hh-unl.github.io/Encuesta_UsoDelAgua.UNL/dashboard/** — **sin contraseña** (decisión explícita del usuario; primero se planteó gate con contraseña y se descartó).
- Generador: `npm run dashboard` (`scripts/build-dashboard.mjs`) → escribe **`dashboard/index.html`** (HTML único autocontenido, se commitea y Pages lo sirve desde la raíz).
- Mapping qid→columna ahora **compartido** en `scripts/columns.mjs` (lo importan `export-supabase.mjs` y `build-dashboard.mjs`).
- **Filtros generales (23/10)**: barra «Filtros generales» con **unidad académica** + **año** (opciones derivadas de `created_at`) + botón Limpiar. Aplican a **todo**: encabezado, KPIs, perfil, hábitos y tabla. Las agregaciones ahora se calculan **en cliente** (`window.HH_DASH` lleva cols/rows/map/opts; funciones `statsOf`/`countsOf`/`scaleOf`/`direct` en el JS inline) — antes eran estáticas del build. La tabla mantiene filtros propios (búsqueda, género, vínculo) que se suman a los generales. Verificado: JS sin errores de sintaxis; filtro por FIQ (52 respuestas) recalcula promedios correctamente.
- Contenido: **5 KPIs** (total + rango de fechas, huella diaria/mensual, consumo directo L/día y L/mes; «Con huella calculada» eliminado y «Horas por día en la UNL» movida a perfil, ambas el 23/10) · distribución por perfil (unidad, género, vínculo, días/semana + horas/día dentro de la tarjeta de días) · hábitos (inodoro, mingitorio, dispenser, mate/té, café, copias/mes, comedor % + veces/semana) · **tabla** con buscador, filtros por género/vínculo, paginación (25/pág) y export CSV.
- **NO incluye** IP, `status` ni submission id (grep verificado contra el HTML generado). Usa `meta robots noindex` y no está enlazada desde la home.
- **Consumo directo de agua** (indicador agregado 22/10, decisión del usuario): dos KPIs, L/día y L/mes, con fórmula `inodoro×6 L + mingitorio×0.5 L + litros dispenser + litros mate/té` (litros crudos, sin factor de huella; **café excluido**). Mes = día × días/semana × 4 (mismo criterio que q63; q16 ausente en 1 respuesta → n=136). Actuales: **32,38 L/día** (mediana 12, n=137) y **499,49 L/mes** (mediana 177, n=136). Nota metodológica visible bajo la grilla de KPIs. Ojo: promedios sesgados por un outlier (222 usos de inodoro/día) — por eso se muestra la mediana.
- Estilos heredados de `site/styles.css` (link `../site/styles.css`) — requiere `npm run generate` previo.
- **Datos en vivo (23/10)**: al cargar, la página consulta la vista pública `public.respuestas_hh_public` (`view-anon-select.sql`, raíz; `grant select to anon`) con la anon key embebida (`window.HH_DASH.remote`) → `GET /rest/v1/respuestas_hh_public?select=*&order=created_at.asc`. Así el dashboard muestra **también las respuestas que llegan por la web, sin rebuild**. Si falla o la vista está vacía → fallback a las filas embebidas del build + nota en el pie (`#dash-live-note`: «Datos en vivo…» vs «Mostrando datos del último build»). `refreshYearOptions()` reconstruye el selector de años tras el fetch. La vista expone **solo** created_at + las 16 columnas del dashboard (sin submission_id/status, verificado); la tabla base con anon sigue devolviendo `[]` (verificado). Verificado 23/10: vista → 200 con 134 filas. Mapping qid→columna compartido via `HH_DASH.remote.colByQid` (los 16 qids de TABLE_COLS == COLUMNS, coincidencia 1:1 verificada). Lectura de `.env` compartida en `scripts/env.mjs` (`supabaseConfig(root)`, la usan generate-site y build-dashboard).
- `scripts/serve.mjs` ahora sirve además `/dashboard/` y el alias `/site/*` (rutas locales iguales a Pages).
- ⚠️ La **tabla individual de respuestas queda pública** para cualquiera con la URL (decisión del usuario del 22/10; `site/respuestas.html` sigue fuera de Pages).
- **Desplegado y verificado 22/10** (commits en `main`: `8dae8d6` dashboard → `ff69776` docs → `920a534` indicador): último build de Pages = `920a534` (`status: built`); `/dashboard/` → 200 (46,5 KB, **7 KPIs**, 30 barras, 137 filas), CSS y marca de agua → 200, sin IP en el HTML publicado.
- Regenerar tras cada `npm run fetch`; commit + push para actualizar Pages (~1 min rebuild).

## Pendientes / posibles mejoras

- [x] ~~Feedback visual del usuario~~ — hecho el 19/10 (colores, marca de agua, sliders, botones).
- [ ] Quitar `scripts/check-output.mjs` y `scripts/check-calcs.mjs` si ya no se necesitan (son tools de desarrollo).
- [x] ~~Evaluar publicación~~ — hecho 22/10: GitHub Pages en https://hh-unl.github.io/Encuesta_UsoDelAgua.UNL/. `site/respuestas.html` sigue sin publicar (404), pero la tabla individual **sí** se publica en `/dashboard/` por decisión del usuario.
- [ ] `data/site-config.json` no creado; crear solo si el usuario quiere cambiar modo/colores.
- [ ] Posible: cachear fetch sin re-descargar todo (ahora `npm run fetch` baja las 137 respuestas cada vez).
- [ ] El formulario original tiene `thanktext` (página de agradecimiento Jotform) — se embebe y se muestra tras el envío exitoso a Supabase.
- [x] ~~23/10 envío Supabase~~ — hecho: política aplicada, key completa, envío real verificado en Table Editor, commit + push.
- [x] ~~Dashboard lee solo el histórico local~~ — hecho 23/10: fetch en vivo desde la vista `respuestas_hh_public` con fallback al build (ver sección Dashboard).
- [ ] Limpieza en Supabase: borrar del Table Editor las filas de prueba (`status='test'` creadas por la API de test y cualquier respuesta de prueba del usuario).
- [ ] **Descuadre 134 vs 137**: la vista devuelve 134 filas pero el histórico local tiene 137 (y la carga inicial decía 137). Preguntar al usuario si borró filas de más al limpiar las de prueba, o re-importar el histórico con `npm run export-supabase` (ya no trunca).

## Notas técnicas para continuar

- Naming de campos: usar siempre `q.name` del API (p. ej. `cuantosDias`, `q8_calculation6`, `tuHuella`) — no inventar `q{id}...`.
- IDs de inputs: `f-{qid}`; campos envueltos en `.hh-field[data-qid]` con `data-required="1"`.
- Sliders: `SLIDER_SCALE_QIDS = new Set(['18'])` en `scripts/generate-site.mjs` decide qué escalas son `input type=range` (q16 salió el 22/10 → ahora escala de botones 0–6).
- Números con límites: `NUMBER_LIMITS` en `scripts/generate-site.mjs` (qid 3 «inodoro» → min 0, max 10, step 1); aplica `min`/`max`/`step` + `data-hh-integer="1"` y app.js valida enteros («Introduce un número entero.»). Sobrevive a `npm run fetch` (es override del generador, no del JSON).
- Condiciones extra: `EXTRA_CONDITIONS` en `scripts/generate-site.mjs` se concatena a `structure.conditions` al armar `HH_CONFIG`; mismo criterio que NUMBER_LIMITS (override que sobrevive a re-fetch). Para agregar reglas nuevas, copiar el formato `{type, link, terms:[{field,operator,value}], actions:[{visibility,field,fields}]}` de Jotform.
- Navegación: `data-hh="prev"` está solo en `.hh-actions` (inferior); app.js usa `querySelectorAll` (soportaría múltiples si se volvieran a agregar). `data-hh="submit"` se oculta fuera de la última página en `goTo()`.
- `window.HH_CONFIG` en index.html lleva `{calculations, conditions, clearOnHide, autoNext, thankYou}`.
- La API de Jotform NO expone fórmulas en `/questions/{qid}` (404); están en `properties.calculations`. `conditions` viene como string JSON dentro de otro JSON.
- Cuota API: ~60k req/mes; el script espera 120 ms entre peticiones.
