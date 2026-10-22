# encuesta-hh

Conecta con la API de Jotform, extrae la **estructura** y las **respuestas** de un formulario y genera una **web estática** (HTML/CSS/JS) equivalente.

## Cómo conseguir tus credenciales

1. **API key**
   - Entra en <https://www.jotform.com/myaccount/api/>
   - Pulsa **Create New Key**, dale un nombre y copia la clave.
2. **ID del formulario**
   - Abre tu formulario en Jotform. La URL es:
     `https://form.jotform.com/250012345678901`
   - El ID es el número largo: `250012345678901`.
   - También aparece en *My Forms* al pasar el ratón sobre el formulario.

## Puesta en marcha

```bash
cp .env.example .env      # y edita con tu API key e ID
npm run fetch             # descarga estructura + respuestas a data/
npm run generate          # genera la web en site/
npm run serve             # previsualiza en http://localhost:8080
```

`npm run build` ejecuta fetch + generate de una vez.

> La carpeta `data/` incluye datos de ejemplo para que puedas probar
> `npm run generate && npm run serve` antes de tener las credenciales.
> `npm run fetch` los sustituirá por los datos reales de tu formulario.

## Qué genera

```
site/
├── index.html        réplica del formulario (validación, multipágina, «Otro», estrellas…)
├── styles.css        estilos (personaliza --hh-accent para cambiar el color)
├── app.js            validación, navegación, cálculos y condiciones
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

## Modos de envío (`data/site-config.json`)

| Opción | Valores | Efecto |
|---|---|---|
| `submitMode` | `"jotform"` (defecto) | El formulario envía los datos **al formulario original de Jotform** (POST nativo, sin CORS). |
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

## Limitaciones

- **Pagos y CAPTCHA** no se replican (Jotform los gestiona en su servidor); se muestra un aviso en su lugar.
- Los campos de **archivos** se envían al formulario original solo en modo `jotform`.
- **`respuestas.html` contiene los datos de las personas** que respondieron: si alojas la web públicamente, esa página será visible. Actívala solo si es adecuado, o ponla detrás de autenticación.
- El diseño replica estructura y comportamiento, no el tema visual exacto de la plantilla Jotform (colores personalizables en `styles.css`).

## Límites de la API de Jotform

- Autenticación con cabecera `APIKEY`.
- Cuota típica: 60.000 peticiones/mes y ~10 req/s. El script espera ~120 ms entre peticiones y pagina las respuestas de 100 en 100.
