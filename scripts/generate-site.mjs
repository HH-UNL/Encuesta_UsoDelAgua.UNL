#!/usr/bin/env node
/**
 * Genera una web estática equivalente al formulario Jotform
 * a partir de data/form-structure.json (+ submissions.json).
 *
 * Uso:
 *   node scripts/generate-site.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const DOCS_DIR = path.join(ROOT, 'docs');
const SITE_DIR = path.join(ROOT, 'site');

const structurePath = path.join(DATA_DIR, 'form-structure.json');
if (!fs.existsSync(structurePath)) {
  console.error('No existe data/form-structure.json. Ejecuta primero: npm run fetch');
  process.exit(1);
}

const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'));
const submissionsPath = path.join(DATA_DIR, 'submissions.json');
const submissionsData = fs.existsSync(submissionsPath)
  ? JSON.parse(fs.readFileSync(submissionsPath, 'utf8'))
  : { total: 0, submissions: [] };

const configPath = path.join(DATA_DIR, 'site-config.json');
const config = {
  accentColor: '#005875',
  submitMode: 'jotform',
  showResponsesPage: true,
  lang: 'es',
  footerText: '',
  ...readJson(configPath),
};

const COUNTRIES = [
  'España', 'México', 'Argentina', 'Colombia', 'Chile', 'Perú', 'Venezuela', 'Ecuador',
  'Guatemala', 'Cuba', 'Bolivia', 'República Dominicana', 'Honduras', 'Paraguay',
  'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'Uruguay', 'Guinea Ecuatorial',
  'Estados Unidos', 'Canadá', 'Reino Unido', 'Alemania', 'Francia', 'Italia', 'Portugal',
  'Brasil', 'Japón', 'China', 'India', 'Australia', 'Otro',
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s = '') {
  return esc(s).replace(/'/g, '&#39;');
}

function attr(name, value) {
  if (value === undefined || value === null || value === '') return '';
  return ` ${name}="${escAttr(value)}"`;
}

/* ------------------------------------------------------------------ */
/* Renderizado de campos                                               */
/* ------------------------------------------------------------------ */

function labelHtml(q, forId) {
  if (!q.label && !q.required) return '';
  const star = q.required ? ' <abbr class="hh-req" title="Obligatorio">*</abbr>' : '';
  if (forId) return `<label class="hh-label" for="${forId}">${esc(q.label)}${star}</label>`;
  return `${esc(q.label)}${star}`;
}

function descHtml(q) {
  return q.description ? `<p class="hh-desc">${esc(q.description)}</p>` : '';
}

function errorHtml() {
  return '<p class="hh-error" hidden></p>';
}

function wrap(q, inner, extraAttrs = '') {
  const req = q.required ? ' data-required="1"' : '';
  return `<div class="hh-field"${req} data-qid="${escAttr(q.qid)}"${extraAttrs}>${inner}</div>`;
}

function optionsHtml(q) {
  const opts = [];
  for (const o of q.options) {
    opts.push(`<option value="${escAttr(o)}">${esc(o)}</option>`);
  }
  return opts.join('');
}

// Restricciones sobreescritas para números (qid → min/max/step); sobreviven a re-fetch
const NUMBER_LIMITS = {
  '3': { min: 0, max: 10, step: 1 }, // «¿Cuántas veces por día utilizas el inodoro…?»
};

// Condiciones extra inyectadas (sobreviven a re-fetch)
const EXTRA_CONDITIONS = [
  {
    // q68 «¿Cuántas veces por semana almorzás en el comedor…?» solo visible si q67 = Sí
    type: 'field',
    link: 'All',
    terms: [{ field: '67', operator: 'equals', value: 'Sí' }],
    actions: [{ visibility: 'Show', field: '68', fields: [] }],
  },
];

function renderTextLike(q, type) {
  const id = `f-${q.qid}`;
  const limits = type === 'number' ? NUMBER_LIMITS[String(q.qid)] : null;
  const min = limits ? limits.min : q.extra.min;
  const max = limits ? limits.max : q.extra.max;
  const extra = [
    q.extra.placeholder ? attr('placeholder', q.extra.placeholder) : '',
    q.readonly ? ' readonly' : '',
    type === 'number' ? ' data-hh-numeric="1"' : '',
    limits && limits.step === 1 ? ' step="1" data-hh-integer="1"' : '',
    attr('min', min),
    attr('max', max),
  ].join('');
  return wrap(
    q,
    labelHtml(q, id) +
      descHtml(q) +
      `<input class="hh-input" id="${id}" name="${escAttr(q.name)}" type="${type}"${extra}>` +
      errorHtml()
  );
}

function renderTextarea(q) {
  const id = `f-${q.qid}`;
  return wrap(
    q,
    labelHtml(q, id) +
      descHtml(q) +
      `<textarea class="hh-textarea" id="${id}" name="${escAttr(q.name)}" rows="5"${
        q.extra.placeholder ? attr('placeholder', q.extra.placeholder) : ''
      }${q.readonly ? ' readonly' : ''}></textarea>` +
      errorHtml()
  );
}

function renderSelect(q, { combo = false } = {}) {
  const id = `f-${q.qid}`;
  if (combo) {
    const listId = `${id}-list`;
    return wrap(
      q,
      labelHtml(q, id) +
        descHtml(q) +
        `<input class="hh-input" id="${id}" name="${escAttr(q.name)}" type="text" list="${listId}"${
          q.extra.placeholder ? attr('placeholder', q.extra.placeholder) : ''
        }>` +
        `<datalist id="${listId}">${q.options
          .map((o) => `<option value="${escAttr(o)}"></option>`)
          .join('')}</datalist>` +
        errorHtml()
    );
  }
  const first = q.extra.firstOption || (q.required ? 'Selecciona…' : '');
  const firstOpt = first ? `<option value="">${esc(first)}</option>` : '';
  return wrap(
    q,
    labelHtml(q, id) +
      descHtml(q) +
      `<select class="hh-select" id="${id}" name="${escAttr(q.name)}">${firstOpt}${optionsHtml(
        q
      )}</select>` +
      errorHtml()
  );
}

function renderChoice(q, { multi = false } = {}) {
  const inputType = multi ? 'checkbox' : 'radio';
  const id = `f-${q.qid}`;
  const otherId = `${id}-other`;
  const gridCls = q.options.length > 6 ? ' hh-options--grid' : '';
  const opts = q.options
    .map(
      (o, i) => `
      <label class="hh-option">
        <input type="${inputType}" name="${escAttr(q.name)}" value="${escAttr(o)}"${
          i === 0 ? ` id="${id}"` : ''
        }>
        <span class="hh-option-text">${esc(o)}</span>
      </label>`
    )
    .join('');
  const other = q.extra.other
    ? `
      <label class="hh-option">
        <input type="${inputType}" name="${escAttr(q.name)}" value="Other" data-hh-other-toggle="${otherId}"${
          q.options.length === 0 ? ` id="${id}"` : ''
        }>
        <span class="hh-option-text">Otro (especificar)</span>
      </label>
      <input class="hh-input hh-other-input" type="text" name="${escAttr(q.name)}input" hidden
        data-hh-other-target="${otherId}" data-hh-required="${q.required ? '1' : '0'}"
        placeholder="Escribe tu respuesta">`
    : '';
  return wrap(
    q,
    `<fieldset class="hh-group">
      <legend>${labelHtml(q)}</legend>
      ${descHtml(q)}
      <div class="hh-options${gridCls}">${opts}${other}</div>
      ${errorHtml()}
    </fieldset>`
  );
}

function renderDatetime(q) {
  const id = `f-${q.qid}`;
  const fmt = String(q.extra.dateFormat || '');
  const withTime = /\b(HH|hh|H|h)\b|a\.?m\.?|p\.?m\.?/i.test(fmt);
  const type = withTime ? 'datetime-local' : 'date';
  const isYmd = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v));
  const min = isYmd(q.extra.dateMin) ? String(q.extra.dateMin).slice(0, withTime ? 16 : 10) : '';
  const max = isYmd(q.extra.dateMax) ? String(q.extra.dateMax).slice(0, withTime ? 16 : 10) : '';
  return wrap(
    q,
    labelHtml(q, id) +
      descHtml(q) +
      `<input class="hh-input" id="${id}" name="${escAttr(q.name)}" type="${type}"
        data-hh-date="1"${attr('min', min)}${attr('max', max)}>` +
      errorHtml(),
    `${min ? ` data-date-min="${escAttr(min)}"` : ''}${max ? ` data-date-max="${escAttr(max)}"` : ''}`
  );
}

const SLIDER_SCALE_QIDS = new Set(['18']);

function renderScale(q) {
  const id = `f-${q.qid}`;
  const from = Number.isFinite(q.extra.scaleFrom) ? q.extra.scaleFrom : 1;
  const count = Math.min(Math.max((q.extra.scalePoints || 5) - from + 1, 2), 21);
  const stars = /star/i.test(String(q.extra.scaleType));

  if (SLIDER_SCALE_QIDS.has(String(q.qid))) {
    const to = from + count - 1;
    const labels =
      q.extra.scaleMinLabel || q.extra.scaleMaxLabel
        ? `<div class="hh-scale-labels"><span>${esc(q.extra.scaleMinLabel)}</span><span>${esc(
            q.extra.scaleMaxLabel
          )}</span></div>`
        : `<div class="hh-scale-labels"><span>${from}</span><span>${to}</span></div>`;
    return wrap(
      q,
      `<fieldset class="hh-group">
      <legend>${labelHtml(q)}</legend>
      ${descHtml(q)}
      <div class="hh-slider">
        <input type="range" id="${id}" name="${escAttr(q.name)}" min="${from}" max="${to}" step="1" value="${from}">
        <output class="hh-slider-value" for="${id}">${from}</output>
      </div>
      ${labels}
      ${errorHtml()}
    </fieldset>`
    );
  }

  const items = [];
  for (let i = from; i < from + count; i++) {
    items.push(`
      <label class="hh-scale-item">
        <input type="radio" name="${escAttr(q.name)}" value="${i}"${i === from ? ` id="${id}"` : ''}>
        <span>${stars ? '★' : i}</span>
      </label>`);
  }
  const labels =
    q.extra.scaleMinLabel || q.extra.scaleMaxLabel
      ? `<div class="hh-scale-labels"><span>${esc(q.extra.scaleMinLabel)}</span><span>${esc(
          q.extra.scaleMaxLabel
        )}</span></div>`
      : '';
  return wrap(
    q,
    `<fieldset class="hh-group">
      <legend>${labelHtml(q)}</legend>
      ${descHtml(q)}
      <div class="hh-scale">${items.join('')}</div>
      ${labels}
      ${errorHtml()}
    </fieldset>`
  );
}

function renderMatrix(q) {
  const rows = q.extra.matrixRows.length ? q.extra.matrixRows : ['Fila 1'];
  const cols = q.extra.matrixColumns.length ? q.extra.matrixColumns : ['Opción 1'];
  const mtype = String(q.extra.matrixType || 'radio').toLowerCase();
  const head = `<thead><tr><th></th>${cols
    .map((c) => `<th>${esc(c)}</th>`)
    .join('')}</tr></thead>`;
  const body = rows
    .map((r) => {
      const cells = cols
        .map((c) => {
          const name = `${q.name}[${r}]`;
          if (mtype === 'matrixdropdown' || mtype === 'listbox') {
            return `<td><select class="hh-select" name="${escAttr(name)}">
              <option value=""></option>
              ${cols.map((c2) => `<option value="${escAttr(c2)}">${esc(c2)}</option>`).join('')}
            </select></td>`;
          }
          const type = mtype === 'checkbox' ? 'checkbox' : 'radio';
          return `<td><input type="${type}" name="${escAttr(name)}" value="${escAttr(c)}"></td>`;
        })
        .join('');
      return `<tr><th>${esc(r)}</th>${cells}</tr>`;
    })
    .join('');
  return wrap(
    q,
    `<fieldset class="hh-group hh-matrix-wrap">
      <legend>${labelHtml(q)}</legend>
      ${descHtml(q)}
      <table class="hh-matrix"><colgroup><col>${cols
        .map(() => '<col>')
        .join('')}</colgroup>${head}<tbody>${body}</tbody></table>
      ${errorHtml()}
    </fieldset>`
  );
}

function renderAddress(q) {
  const base = q.name;
  const id = `f-${q.qid}`;
  const field = (suffix, label, tag = 'input', type = 'text', cls = 'hh-span-2') => `
    <div class="${cls}">
      <label class="hh-label" for="${id}-${suffix}">${esc(label)}${
        tag === 'input' ? '' : ''
      }</label>
      ${
        tag === 'select'
          ? `<select class="hh-select" id="${id}-${suffix}" name="${escAttr(base + suffix)}">
              <option value="">Selecciona…</option>
              ${COUNTRIES.map((c) => `<option value="${escAttr(c)}">${esc(c)}</option>`).join('')}
            </select>`
          : `<input class="hh-input" id="${id}-${suffix}" name="${escAttr(base + suffix)}" type="${type}">`
      }
    </div>`;
  const country = q.extra.showCountry
    ? field('_country', 'País', 'select', '', '')
    : '';
  return wrap(
    q,
    `<fieldset class="hh-group">
      <legend>${labelHtml(q)}</legend>
      ${descHtml(q)}
      <div class="hh-address">
        ${field('_addr_line1', 'Dirección', 'input', 'text', 'hh-span-2')}
        ${field('_addr_line2', 'Dirección (línea 2)', 'input', 'text', 'hh-span-2')}
        ${field('_city', 'Ciudad', 'input', 'text', '')}
        ${field('_state', 'Estado / Provincia', 'input', 'text', '')}
        ${field('_postal', 'Código postal', 'input', 'text', '')}
        ${country}
      </div>
      ${errorHtml()}
    </fieldset>`
  );
}

function renderPhone(q) {
  const id = `f-${q.qid}`;
  const us = /US/i.test(String(q.extra.phoneFormat));
  return wrap(
    q,
    labelHtml(q, id) +
      descHtml(q) +
      `<input class="hh-input" id="${id}" name="${escAttr(q.name)}" type="tel"${
        us ? ' placeholder="(000) 000-0000"' : ''
      }>` +
      errorHtml()
  );
}

function renderFile(q) {
  const id = `f-${q.qid}`;
  const types = String(q.extra.allowedTypes || '')
    .split('|')
    .map((t) => t.trim().replace(/^\./, ''))
    .filter(Boolean);
  const accept = types.map((t) => (t.includes('/') ? t : `.${t}`)).join(',');
  return wrap(
    q,
    labelHtml(q, id) +
      descHtml(q) +
      `<input class="hh-input" id="${id}" name="${escAttr(q.name)}" type="file"${
        q.extra.maxFiles > 1 ? ' multiple' : ''
      }${attr('accept', accept)}>` +
      (types.length
        ? `<p class="hh-desc">Formatos permitidos: ${esc(types.join(', '))}${
            q.extra.maxSize ? ` · máx. ${q.extra.maxSize} MB` : ''
          }</p>`
        : '') +
      errorHtml()
  );
}

function renderTerms(q) {
  const id = `f-${q.qid}`;
  return wrap(
    q,
    `<fieldset class="hh-group">
      <legend>${labelHtml(q)}</legend>
      <div class="hh-terms">${esc(q.extra.termsText || q.label || '')}</div>
      <label class="hh-option">
        <input type="checkbox" id="${id}" name="${escAttr(q.name)}" value="I Agree">
        <span class="hh-option-text">Acepto los términos y condiciones</span>
      </label>
      ${errorHtml()}
    </fieldset>`
  );
}

function renderHead(q) {
  return `<div class="hh-field"><h3 class="hh-section-title">${esc(q.label)}</h3>${
    q.description ? `<p class="hh-desc">${esc(q.description)}</p>` : ''
  }</div>`;
}

function renderDivider() {
  return '<div class="hh-field"><hr></div>';
}

function renderNote(q, text) {
  return `<div class="hh-field"><p class="hh-note"><b>${esc(
    q.label || 'Campo'
  )}:</b> ${esc(text)}</p></div>`;
}

function renderInfo(q) {
  const html = q.extra.html || q.label;
  return `<div class="hh-field hh-info" data-qid="${escAttr(q.qid)}">${html}</div>`;
}

function renderCalculation(q) {
  const id = `f-${q.qid}`;
  if (q.hidden) {
    return `<input type="hidden" class="hh-calc" id="${id}" name="${escAttr(q.name)}" value="" data-qid="${escAttr(
      q.qid
    )}">`;
  }
  return wrap(
    q,
    labelHtml(q, id) +
      (q.extra.subLabel ? `<p class="hh-desc">${esc(q.extra.subLabel)}</p>` : '') +
      `<div class="hh-result"><input class="hh-input hh-calc" id="${id}" name="${escAttr(
        q.name
      )}" type="text" readonly value=""></div>`,
    ` data-qid="${escAttr(q.qid)}"`
  );
}

const RENDERERS = {
  control_textbox: (q) => renderTextLike(q, 'text'),
  control_text: (q) => renderTextLike(q, 'text'),
  control_email: (q) => renderTextLike(q, 'email'),
  control_number: (q) => renderTextLike(q, 'number'),
  control_phone: renderPhone,
  control_textarea: renderTextarea,
  control_dropdown: (q) => renderSelect(q),
  control_contact_list: (q) => renderSelect(q),
  control_combobox: (q) => renderSelect(q, { combo: true }),
  control_radio: (q) => renderChoice(q),
  control_checkbox: (q) => renderChoice(q, { multi: true }),
  control_datetime: renderDatetime,
  control_scale: renderScale,
  control_rating: (q) => {
    if (!q.extra.scalePoints) q.extra.scalePoints = 5;
    if (!q.extra.scaleType) q.extra.scaleType = 'star';
    return renderScale(q);
  },
  control_matrix: renderMatrix,
  control_address: renderAddress,
  control_fileupload: renderFile,
  control_terms: renderTerms,
  control_head: renderHead,
  control_text: renderInfo,
  control_pagebreak: () => '',
  control_calculation: renderCalculation,
  control_divider: renderDivider,
  control_hidden: (q) =>
    `<input type="hidden" name="${escAttr(q.name)}" value="${escAttr(q.extra.literal)}">`,
  control_fullname: (q) =>
    wrap(
      q,
      labelHtml(q, `f-${q.qid}`) +
        descHtml(q) +
        `<input class="hh-input" id="f-${q.qid}" name="${escAttr(q.name)}" type="text" placeholder="Nombre completo">` +
        errorHtml()
    ),
  control_widget: (q) => renderTextLike(q, 'text'),
};

function renderQuestion(q) {
  if (q.type === 'control_captcha' || q.type === 'control_button') return '';
  if (q.type && q.type.startsWith('control_payment')) {
    return renderNote(q, 'Campo de pago de Jotform. Para completarlo usa el formulario original.');
  }
  const renderer = RENDERERS[q.type];
  if (renderer) return renderer(q);
  if (q.options && q.options.length) return renderSelect(q);
  if (q.type === 'control_hidden' || q.type === 'control_uploadpreview') return '';
  return renderTextLike(q, 'text');
}

/* ------------------------------------------------------------------ */
/* Páginas y formulario                                                */
/* ------------------------------------------------------------------ */

function renderPage(page, total) {
  const parts = [];
  if (page.title && total > 1) {
    parts.push(`<h2 class="hh-page-title">${esc(page.title)}</h2>`);
    if (page.number === 1) {
      parts.push(
        '<p class="hh-page-subtitle">En la UNL estamos dando un nuevo paso: comenzamos a gestionar nuestra Huella Hídrica.</p>'
      );
    }
  }
  for (const q of page.questions) {
    if (q.type === 'control_head' && page.title && q.label === page.title) continue;
    const html = renderQuestion(q);
    if (html.trim()) parts.push(html);
  }
  const active = total > 1 && page.number === 1 ? ' is-active' : '';
  return `<section class="hh-page${active}" data-page="${page.number}">${parts.join('\n')}</section>`;
}

function submitLabel() {
  const btn = structure.questions.find((q) => q.type === 'control_button');
  return btn && btn.label ? btn.label : 'Enviar';
}

function buildIndexHtml() {
  const form = structure.form;
  const pages = structure.pages;
  const action =
    config.submitMode === 'jotform' && form.url ? form.url : '#';
  const body = pages.map((p) => renderPage(p, pages.length)).join('\n');

  const hhConfig = {
    calculations: structure.calculations || [],
    conditions: [...(structure.conditions || []), ...EXTRA_CONDITIONS],
    clearOnHide: !!form.clearOnHide,
    autoNext: !!form.autoNext,
    thankYou: form.thankYou || '',
  };
  const embeddedConfig = JSON.stringify(hhConfig).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${escAttr(config.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(form.title)}</title>
<meta name="description" content="Formulario: ${esc(form.title)}">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="hh-wrap">
  <header class="hh-hero">
    <h1>${esc(form.title)}</h1>
  </header>

  <main class="hh-card">
    <div class="hh-progress" hidden><div class="hh-progress-bar"></div></div>
    <form id="hh-form" class="hh-form" action="${escAttr(action)}" method="POST"
          enctype="multipart/form-data" novalidate data-mode="${escAttr(config.submitMode)}">
      <input type="hidden" name="formID" value="${escAttr(form.id)}">
${body}
      <div class="hh-actions">
        <button type="button" class="hh-btn hh-btn-secondary" data-hh="prev" hidden>${esc(
          form.backText || 'Atrás'
        )}</button>
        <button type="button" class="hh-btn hh-btn-primary" data-hh="next" hidden>${esc(
          form.nextText || 'Siguiente'
        )} →</button>
        <button type="submit" class="hh-btn hh-btn-primary" data-hh="submit">${esc(submitLabel())}</button>
      </div>
    </form>
  </main>

  <footer class="hh-footer">
    ${config.footerText ? `${esc(config.footerText)}` : ''}
  </footer>
</div>
<script>window.HH_CONFIG = ${embeddedConfig};</script>
<script src="app.js" defer></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Página de respuestas                                                */
/* ------------------------------------------------------------------ */

function buildRespuestasHtml() {
  const cols = structure.questions
    .filter(
      (q) =>
        q.label &&
        !q.hidden &&
        ![
          'control_head',
          'control_text',
          'control_divider',
          'control_hidden',
          'control_button',
          'control_pagebreak',
        ].includes(q.type) &&
        !(q.type && q.type.startsWith('control_payment'))
    )
    .map((q) => ({ qid: q.qid, label: q.label }));

  const payload = {
    columns: cols,
    submissions: (submissionsData.submissions || []).map((s) => ({
      id: s.id,
      created_at: s.created_at,
      values: s.fields.reduce((acc, f) => {
        if (f.value !== '') acc[f.qid] = f.value;
        return acc;
      }, {}),
    })),
    formTitle: structure.form.title,
  };
  const embedded = JSON.stringify(payload).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${escAttr(config.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Respuestas — ${esc(structure.form.title)}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="hh-wrap">
  <header class="hh-hero">
    <h1>Respuestas</h1>
    <p>${esc(structure.form.title)}</p>
  </header>

  <div class="hh-toolbar">
    <input class="hh-input" id="hh-search" type="search" placeholder="Buscar en las respuestas…" style="flex:1;min-width:220px">
    <span class="hh-count" id="hh-count"></span>
  </div>

  <div class="hh-table-wrap">
    <table class="hh-table" id="hh-table">
      <thead><tr id="hh-head"></tr></thead>
      <tbody id="hh-body"></tbody>
    </table>
    <div class="hh-empty" id="hh-empty" hidden></div>
  </div>

  <footer class="hh-footer">
    <a href="index.html">← Volver al formulario</a>
  </footer>
</div>
<script>window.HH_DATA = ${embedded};</script>
<script src="respuestas.js" defer></script>
</body>
</html>
`;
}

function buildRespuestasJs() {
  return `(function () {
  var data = window.HH_DATA || { columns: [], submissions: [] };
  var head = document.getElementById('hh-head');
  var body = document.getElementById('hh-body');
  var empty = document.getElementById('hh-empty');
  var count = document.getElementById('hh-count');
  var search = document.getElementById('hh-search');
  var cols = data.columns || [];
  var rows = data.submissions || [];

  head.innerHTML =
    '<th>Fecha</th>' +
    cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(list) {
    body.innerHTML = list
      .map(function (s) {
        return '<tr><td>' + esc(s.created_at) + '</td>' +
          cols.map(function (c) {
            return '<td>' + esc(s.values[c.qid] || '') + '</td>';
          }).join('') + '</tr>';
      })
      .join('');
    empty.hidden = list.length > 0;
    empty.textContent = rows.length
      ? 'Sin resultados para esa búsqueda.'
      : 'Todavía no hay respuestas exportadas. Ejecuta «npm run fetch» de nuevo para actualizar.';
    count.textContent = list.length + ' de ' + rows.length + ' respuesta' + (rows.length === 1 ? '' : 's');
  }

  render(rows);

  search.addEventListener('input', function () {
    var term = search.value.toLowerCase().trim();
    if (!term) { render(rows); return; }
    render(rows.filter(function (s) {
      var hay = [s.created_at];
      cols.forEach(function (c) { hay.push(s.values[c.qid] || ''); });
      return hay.join(' ').toLowerCase().indexOf(term) !== -1;
    }));
  });
})();
`;
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

fs.mkdirSync(SITE_DIR, { recursive: true });
fs.mkdirSync(path.join(SITE_DIR, 'datos'), { recursive: true });
fs.mkdirSync(path.join(SITE_DIR, 'assets'), { recursive: true });

const watermarkSrc = ['HuellaHidrica.png', 'HuellaHidrica-mark.png']
  .map((f) => path.join(DOCS_DIR, f))
  .find((p) => fs.existsSync(p));
if (watermarkSrc) {
  fs.copyFileSync(watermarkSrc, path.join(SITE_DIR, 'assets', 'HuellaHidrica.png'));
}

const css = fs
  .readFileSync(path.join(TEMPLATES_DIR, 'styles.css'), 'utf8')
  .replaceAll('__ACCENT__', config.accentColor);
const appJs = fs.readFileSync(path.join(TEMPLATES_DIR, 'app.js'), 'utf8');

fs.writeFileSync(path.join(SITE_DIR, 'index.html'), buildIndexHtml());
fs.writeFileSync(path.join(SITE_DIR, 'styles.css'), css);
fs.writeFileSync(path.join(SITE_DIR, 'app.js'), appJs);

if (config.showResponsesPage) {
  fs.writeFileSync(path.join(SITE_DIR, 'respuestas.html'), buildRespuestasHtml());
  fs.writeFileSync(path.join(SITE_DIR, 'respuestas.js'), buildRespuestasJs());
}

fs.copyFileSync(structurePath, path.join(SITE_DIR, 'datos', 'formulario.json'));
fs.writeFileSync(
  path.join(SITE_DIR, 'datos', 'submissions.json'),
  JSON.stringify(submissionsData, null, 2)
);

const fieldCount = structure.questions.filter((q) => q.type !== 'control_head').length;
console.log(`✔ Web generada en site/`);
console.log(`  · Formulario: ${structure.form.title}`);
console.log(`  · Campos: ${fieldCount} · Páginas: ${structure.pages.length}`);
console.log(`  · Respuestas exportadas: ${submissionsData.total ?? submissionsData.submissions?.length ?? 0}`);
console.log(`  · Modo de envío: ${config.submitMode}`);
console.log('\nPara previsualizar: npm run serve  →  http://localhost:8080');
