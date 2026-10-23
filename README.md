# encuesta-hh

Conecta con la API de Jotform, extrae la **estructura** y las **respuestas** de un formulario y genera una **web estática** (HTML/CSS/JS) equivalente. Las respuestas nuevas se envían **directo a Supabase** desde la web: la página es independiente de Jotform.

## Cómo conseguir tus credenciales

1. **API key de Jotform** (solo para leer estructura/respuestas: `npm run fetch`)
   - Entra en <https://www.jotform.com/myaccount/api/>
   - Pulsa **Create New Key**, dale un nombre y copia la clave.
2. **ID del formulario**
   - Abre tu formulario en Jotform. La URL es:
     `https://form.jotform.com/250012345678901`
   - El ID es el número largo: `250012345678901`.
3. **Supabase** (destino de los envíos)
   - Dashboard del proyecto → **Settings → API**:
     - **Project URL** → `SUPABASE_URL`
     - **anon / publishable key** → `SUPABASE_ANON_KEY` (clave pública por diseño; va embebida en la web generada)
   - Activá la política de solo INSERT: pegá `policy-anon-insert.sql` en el **SQL Editor** y ejecutalo una vez. Sin eso la web no puede escribir (RLS activa).

## Puesta en marcha

```bash
cp .env.example .env      # y edita con tus credenciales (Jotform + Supabase)
npm run fetch             # descarga estructura + respuestas a data/
npm run generate          # genera la web en site/
npm run serve             # previsualiza en http://localhost:8080
```

`npm run build` ejecuta fetch + generate de una vez. `npm run generate` falla con un mensaje claro si faltan `SUPABASE_URL`/`SUPABASE_ANON_KEY` y el modo es `supabase`.

> La carpeta `data/` incluye datos de ejemplo para que puedas probar
> `npm run generate && npm run serve` antes de tener las credenciales.
> `npm run fetch` los sustituirá por los datos reales de tu formulario.

## Qué genera

```
site/
├── index.html        réplica del formulario (validación, multipágina, «Otro», estrellas…)
├── styles.css        estilos (personaliza --hh-accent para cambiar el color)
├── app.js            validación, navegación, cálculos, condiciones y envío a Supabase
├── respuestas.html   tabla con las respuestas exportadas + buscador
├── respuestas.js
└── datos/            copias JSON de estructura y respuestas
```

Se replica la funcionalidad real del formulario:

- **Multipágina** con los mismos cortes (`pagebreak`), textos «Siguiente/Atrás» y barra de progreso
- **Bloques informativos** con su HTML e imágenes originales
- **Cálculos** (ecuaciones `{qid}` de Jotform) evaluados en el navegador, incluidos los resultados visibles tipo «Tu huella hídrica diaria es…»
- **Condiciones** show/hide/require (p. ej. ocultar el mingitorio si género = Femenino)
- **Escalas** respetando rango real (p. ej. 0–6), números con mínimo/máximo, checkbox «Otro»

## Envío a Supabase

En modo `supabase` (por defecto) el formulario hace `POST` a la API REST de tu proyecto
(`{SUPABASE_URL}/rest/v1/respuestas_hh`) con la anon key, y guarda una fila con:

- `submission_id` (uuid generado en el navegador), `created_at`, `status = 'web'`
- Las 16 columnas mapeadas desde los qid del formulario (ver `scripts/columns.mjs`)

Seguridad: la política de `policy-anon-insert.sql` permite **solo INSERT** al rol `anon`;
nadie puede leer, actualizar ni borrar datos desde el navegador. La clave anon va embebida
en el HTML público (es la forma estándar de Supabase para sites estáticos) pero no da acceso
a leer nada.

## Modos de envío (`data/site-config.json`)

| Opción | Valores | Efecto |
|---|---|---|
| `submitMode` | `"supabase"` (defecto) | INSERT vía Supabase REST con la anon key. |
| | `"demo"` | No envía nada: valida y muestra un resumen local. |
| `accentColor` | color hex | Color principal de la web generada. |
| `showResponsesPage` | `true`/`false` | Genera o no la página `respuestas.html`. |
| `footerText` | texto | Texto libre en el pie de la web. |

Crea `data/site-config.json` solo con las opciones que quieras sobreescribir:

```json
{
  "submitMode": "demo",
  "accentColor": "#0e7490"
}
```

## Importar el histórico de Jotform a Supabase

```bash
npm run export-supabase   # genera data/respuestas_hh.sql (+ .csv)
```

Pegalo en el SQL Editor de Supabase. Por defecto **no trunca**: usa
`INSERT … ON CONFLICT DO NOTHING`, así conserva las respuestas que la web captura
directamente. Para reemplazar todo el contenido por el histórico de Jotform:
`node scripts/export-supabase.mjs --truncate`.

### Dashboard en vivo

`npm run dashboard` genera `dashboard/index.html`, que al abrirse consulta la vista
pública `respuestas_hh_public` (crear una vez con `view-anon-select.sql`) para
mostrar también las respuestas que llegan por la web, **sin regenerar nada**.
La vista expone solo las 16 columnas del dashboard + `created_at`; si el fetch
falla, la página se queda con los datos embebidos del último build.

## Limitaciones

- **Pagos y CAPTCHA** no se replican (Jotform los gestiona en su servidor); se muestra un aviso en su lugar.
- El INSERT anónimo es cualquiera con la URL de la web: si recibís spam, se puede captear con una Edge Function o rate-limit después.
- **`respuestas.html` contiene los datos de las personas** que respondieron: si alojas la web públicamente, esa página será visible. Actívala solo si es adecuado, o ponla detrás de autenticación.
- El diseño replica estructura y comportamiento, no el tema visual exacto de la plantilla Jotform (colores personalizables en `styles.css`).

## Límites de la API de Jotform

- Autenticación con cabecera `APIKEY`.
- Cuota típica: 60.000 peticiones/mes y ~10 req/s. El script espera ~120 ms entre peticiones y pagina las respuestas de 100 en 100.
- Solo se usa para **leer** estructura y respuestas históricas; los envíos ya no pasan por Jotform.
