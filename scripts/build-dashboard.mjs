#!/usr/bin/env node
/**
 * Genera dashboard/index.html: dashboard público con KPIs, distribución
 * por perfil, hábitos de consumo y tabla de respuestas con filtros.
 *
 * Filtros generales (unidad académica + año) aplican a TODO: KPIs,
 * perfil, hábitos y tabla. Las agregaciones se calculan en cliente
 * sobre las filas embebidas (sin IP, sin status, sin submission id).
 *
 * - Usa scripts/columns.mjs (mapping qid → columna compartido con
 *   export-supabase.mjs) y hereda los estilos de site/styles.css.
 *
 * Uso:
 *   node scripts/build-dashboard.mjs
 *   npm run dashboard
 *
 * Salida: dashboard/index.html → Pages la sirve en /dashboard/.
 * Regenerar después de cada npm run fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS } from './columns.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'dashboard');

const structurePath = path.join(DATA_DIR, 'form-structure.json');
if (!fs.existsSync(structurePath)) {
  console.error('No existe data/form-structure.json. Ejecuta primero: npm run fetch');
  process.exit(1);
}
const submissionsPath = path.join(DATA_DIR, 'submissions.json');
if (!fs.existsSync(submissionsPath)) {
  console.error('No existe data/submissions.json. Ejecuta primero: npm run fetch');
  process.exit(1);
}

const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'));
const submissionsData = JSON.parse(fs.readFileSync(submissionsPath, 'utf8'));
const subs = submissionsData.submissions || submissionsData || [];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

const config = {
  accentColor: '#005875',
  footerText: '',
  ...readJson(path.join(DATA_DIR, 'site-config.json')),
};

const formTitle = structure.form?.title || 'Encuesta';

function q(col) {
  const c = COLUMNS.find((x) => x.col === col);
  if (!c) {
    console.error(`La columna «${col}» no existe en scripts/columns.mjs`);
    process.exit(1);
  }
  return c.qid;
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function fieldValue(sub, qid) {
  const f = (sub.fields || []).find((x) => x.qid === qid);
  if (!f) return '';
  let v = f.value;
  if (Array.isArray(v)) v = v.join('; ');
  return v == null ? '' : String(v).trim();
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

function optionsOf(qid) {
  const question = structure.questions.find((x) => x.qid === qid);
  return (question?.options || []).map(String);
}

const EXCLUDED_TYPES = [
  'control_head',
  'control_text',
  'control_divider',
  'control_hidden',
  'control_button',
  'control_pagebreak',
];
const TABLE_COLS = structure.questions
  .filter(
    (x) =>
      x.label &&
      !x.hidden &&
      !EXCLUDED_TYPES.includes(x.type) &&
      !(x.type || '').startsWith('control_payment')
  )
  .map((x) => ({ qid: x.qid, label: x.label }));

const rows = subs.map((s) => ({
  f: s.created_at || '',
  v: TABLE_COLS.map((c) => fieldValue(s, c.qid)),
}));

const idxOf = (col) => TABLE_COLS.findIndex((c) => c.qid === q(col));
const MAP = {
  unidad: idxOf('unidad_academica'),
  genero: idxOf('genero'),
  vinculo: idxOf('vinculo_unl'),
  dias: idxOf('dias_semana'),
  horas: idxOf('horas_dia'),
  inodoro: idxOf('inodoro_dia'),
  mingitorio: idxOf('mingitorio_dia'),
  dispenser: idxOf('litros_dispenser'),
  mate: idxOf('litros_mate'),
  cafe: idxOf('tazas_cafe'),
  copias: idxOf('copias_mes'),
  comedor: idxOf('almorza_comedor'),
  veces: idxOf('veces_comedor_semana'),
  huellaD: idxOf('huella_diaria'),
  huellaM: idxOf('huella_mensual'),
};
const OPTS = {
  unidad: optionsOf(q('unidad_academica')),
  genero: optionsOf(q('genero')),
  vinculo: optionsOf(q('vinculo_unl')),
  comedor: optionsOf(q('almorza_comedor')),
};
const years = [
  ...new Set(subs.map((s) => String(s.created_at || '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y))),
].sort().reverse();

const payload = JSON.stringify({
  cols: TABLE_COLS,
  rows,
  pageSize: 25,
  map: MAP,
  opts: OPTS,
}).replace(/</g, '\\u003c');

const unitOptionsHtml = OPTS.unidad
  .filter((o) => subs.some((s) => fieldValue(s, q('unidad_academica')) === o))
  .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)
  .join('\n      ');
const yearOptionsHtml = years
  .map((y) => `<option value="${y}">${y}</option>`)
  .join('\n      ');

/* ------------------------------------------------------------------ */
/* Datos de log (build-time, solo informativo)                          */
/* ------------------------------------------------------------------ */

const total = subs.length;
const dates = subs.map((s) => String(s.created_at || '').slice(0, 10)).filter(Boolean).sort();
const fechaMin = dates[0] || '—';
const fechaMax = dates[dates.length - 1] || '—';
const nUnidad = new Set(subs.map((s) => fieldValue(s, q('unidad_academica'))).filter(Boolean)).size;

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Dashboard — ${esc(formTitle)}</title>
<link rel="stylesheet" href="../site/styles.css">
<style>
.hh-wrap--dash { max-width: 1180px; }
.dash-title { color: #fff; font-size: 1.15rem; font-weight: 700; margin: 34px 0 14px; letter-spacing: -0.01em; }
.dash-globalbar { margin: 6px 0 4px; }
.dash-globalbar .hh-select { width: auto; max-width: 235px; }
.dash-globalbar .hh-btn { padding: 10px 16px; white-space: nowrap; }
.dash-globalbar .hh-count { color: var(--hh-muted); }
.dash-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.dash-kpi { background: var(--hh-surface); border: 1px solid var(--hh-border); border-radius: var(--hh-radius); box-shadow: var(--hh-shadow); padding: 18px 20px; display: flex; flex-direction: column; gap: 4px; }
.dash-kpi-label { font-size: 0.76rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--hh-muted); }
.dash-kpi-value { font-size: 1.85rem; font-weight: 700; color: var(--hh-text); line-height: 1.15; font-variant-numeric: tabular-nums; }
.dash-kpi-unit { font-size: 0.95rem; font-weight: 600; color: var(--hh-muted); }
.dash-kpi-sub { font-size: 0.79rem; color: var(--hh-muted); }
.dash-kpi-note { margin: 12px 2px 0; font-size: 0.8rem; color: rgba(255, 255, 255, 0.75); max-width: 95ch; }
.dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
.dash-card { padding: clamp(18px, 3vw, 26px); }
.dash-card-title { margin: 0 0 14px; font-size: 0.95rem; font-weight: 700; padding-bottom: 8px; border-bottom: 2px solid var(--hh-accent-soft); }
.dash-card-title--gap { margin-top: 24px; }
.dash-card-note { margin: 14px 0 0; font-size: 0.84rem; color: var(--hh-muted); }
.dash-bars { display: flex; flex-direction: column; gap: 8px; }
.dash-bar { display: grid; grid-template-columns: minmax(90px, 36%) 1fr auto; gap: 10px; align-items: center; font-size: 0.85rem; }
.dash-bar-label { color: var(--hh-text); line-height: 1.25; overflow-wrap: anywhere; }
.dash-bar-track { background: var(--hh-accent-soft); border-radius: 999px; height: 14px; overflow: hidden; }
.dash-bar-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--hh-accent), var(--hh-accent-dark)); border-radius: 999px; min-width: 3px; }
.dash-bar-val { font-weight: 600; color: var(--hh-text); text-align: right; font-variant-numeric: tabular-nums; }
.dash-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
.dash-stat { background: var(--hh-surface); border: 1px solid var(--hh-border); border-radius: var(--hh-radius); box-shadow: var(--hh-shadow); padding: 16px 18px; display: flex; flex-direction: column; gap: 3px; }
.dash-stat-label { font-size: 0.8rem; font-weight: 600; color: var(--hh-muted); }
.dash-stat-value { font-size: 1.55rem; font-weight: 700; color: var(--hh-text); line-height: 1.2; font-variant-numeric: tabular-nums; }
.dash-stat-value--big { font-size: 2.3rem; color: var(--hh-accent); }
.dash-stat-unit { font-size: 0.85rem; font-weight: 600; color: var(--hh-muted); margin-left: 6px; }
.dash-stat-sub { font-size: 0.78rem; color: var(--hh-muted); }
.dash-nodata { color: var(--hh-muted); font-size: 0.88rem; margin: 0; }
.dash-toolbar .hh-input { width: auto; flex: 1 1 220px; }
.dash-toolbar .hh-select { width: auto; max-width: 235px; }
.dash-toolbar .hh-btn { padding: 10px 16px; white-space: nowrap; }
.dash-table { min-width: 1150px; }
.dash-pager { display: flex; gap: 12px; justify-content: center; align-items: center; margin-top: 16px; flex-wrap: wrap; }
.dash-pager .hh-btn { padding: 9px 18px; }
.dash-page-info { font-size: 0.88rem; color: rgba(255, 255, 255, 0.85); font-variant-numeric: tabular-nums; }
.dash-footer-note { display: block; margin-top: 6px; font-size: 0.78rem; color: rgba(255, 255, 255, 0.6); }
@media (max-width: 640px) {
  .dash-bar { grid-template-columns: minmax(70px, 40%) 1fr auto; font-size: 0.8rem; }
  .dash-kpi-value { font-size: 1.55rem; }
}
</style>
</head>
<body>
<div class="hh-wrap hh-wrap--dash">
  <header class="hh-hero">
    <span class="hh-badge">Dashboard</span>
    <h1>${esc(formTitle)}</h1>
    <p id="dash-summary">${total} respuestas · ${fechaMin} → ${fechaMax}</p>
  </header>

  <div class="hh-card dash-card dash-globalbar">
    <h3 class="dash-card-title">Filtros generales</h3>
    <div class="hh-toolbar">
      <select class="hh-select" id="dash-g-unidad" aria-label="Filtrar por unidad académica">
        <option value="">Unidad académica: todas</option>
        ${unitOptionsHtml}
      </select>
      <select class="hh-select" id="dash-g-anio" aria-label="Filtrar por año">
        <option value="">Año: todos</option>
        ${yearOptionsHtml}
      </select>
      <button class="hh-btn hh-btn-secondary" id="dash-g-clear" type="button">Limpiar filtros</button>
      <span class="hh-count" id="dash-g-count"></span>
    </div>
  </div>

  <div class="dash-kpis" id="dash-kpis"></div>
  <p class="dash-kpi-note">Consumo directo (en la UNL) = inodoro (6 L por uso) + mingitorio (0,5 L por uso) + agua del dispenser + mate/té. Al mes: valor diario × días de asistencia × 4 (mismo criterio que la huella mensual del formulario).</p>

  <h2 class="dash-title">Distribución por perfil</h2>
  <div id="dash-perfil"></div>

  <h2 class="dash-title">Hábitos de consumo</h2>
  <div id="dash-habitos"></div>

  <h2 class="dash-title">Tabla de respuestas</h2>
  <div class="hh-toolbar dash-toolbar">
    <input class="hh-input" id="dash-search" type="search" placeholder="Buscar en las respuestas…">
    <select class="hh-select" id="dash-f-genero" aria-label="Filtrar por género">
      <option value="">Género: todos</option>
      ${OPTS.genero.filter((o) => subs.some((s) => fieldValue(s, q('genero')) === o)).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('\n      ')}
    </select>
    <select class="hh-select" id="dash-f-vinculo" aria-label="Filtrar por vínculo">
      <option value="">Vínculo: todos</option>
      ${OPTS.vinculo.filter((o) => subs.some((s) => fieldValue(s, q('vinculo_unl')) === o)).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('\n      ')}
    </select>
    <span class="hh-count" id="dash-count"></span>
    <button class="hh-btn hh-btn-secondary" id="dash-csv" type="button">Exportar CSV</button>
  </div>

  <div class="hh-table-wrap">
    <table class="hh-table dash-table">
      <thead><tr id="dash-head"></tr></thead>
      <tbody id="dash-body"></tbody>
    </table>
    <div class="hh-empty" id="dash-empty" hidden></div>
  </div>

  <div class="dash-pager">
    <button class="hh-btn hh-btn-secondary" id="dash-prev" type="button">← Anterior</button>
    <span class="dash-page-info" id="dash-page"></span>
    <button class="hh-btn hh-btn-secondary" id="dash-next" type="button">Siguiente →</button>
  </div>

  <footer class="hh-footer">
    <a href="../site/">← Volver al formulario</a>
    ${config.footerText ? `<div>${esc(config.footerText)}</div>` : ''}
    <span class="dash-footer-note">Datos generados el ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
  </footer>
</div>
<script>window.HH_DASH = ${payload};</script>
<script>
(function () {
  var D = window.HH_DASH;
  var cols = D.cols;
  var rows = D.rows;
  var M = D.map;
  var OPTS = D.opts;
  var PAGE = D.pageSize || 25;
  var page = 1;
  var $ = function (id) { return document.getElementById(id); };
  var gU = $('dash-g-unidad');
  var gY = $('dash-g-anio');
  var gCount = $('dash-g-count');
  var summary = $('dash-summary');
  var search = $('dash-search');
  var fG = $('dash-f-genero');
  var fV = $('dash-f-vinculo');
  var head = $('dash-head');
  var body = $('dash-body');
  var empty = $('dash-empty');
  var count = $('dash-count');
  var prev = $('dash-prev');
  var next = $('dash-next');
  var pageInfo = $('dash-page');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) {
    v = String(v == null ? '' : v).trim();
    return v === '' || isNaN(Number(v)) ? null : Number(v);
  }
  function fmt(n) {
    return n == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
  }
  function shortLabel(l) { return l.indexOf(':') >= 0 ? l.slice(0, l.indexOf(':')) : l; }
  function cell(r, i) { return i >= 0 ? String(r.v[i] == null ? '' : r.v[i]) : ''; }
  function yearOf(r) { return String(r.f || '').slice(0, 4); }

  function globalRows() {
    var u = gU.value;
    var y = gY.value;
    return rows.filter(function (r) {
      if (u && cell(r, M.unidad) !== u) return false;
      if (y && yearOf(r) !== y) return false;
      return true;
    });
  }

  function statsOf(vals) {
    var nums = [];
    for (var i = 0; i < vals.length; i++) {
      var n = num(vals[i]);
      if (n !== null) nums.push(n);
    }
    if (!nums.length) return null;
    nums.sort(function (a, b) { return a - b; });
    var mid = Math.floor(nums.length / 2);
    var median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    var round = function (n) { return Math.round(n * 100) / 100; };
    var sum = 0;
    for (var j = 0; j < nums.length; j++) sum += nums[j];
    return { n: nums.length, avg: round(sum / nums.length), median: round(median), min: nums[0], max: nums[nums.length - 1] };
  }

  function countsOf(list, idx, order, multi) {
    var map = {};
    var keys = order || [];
    for (var k = 0; k < keys.length; k++) map[keys[k]] = 0;
    var answered = 0;
    for (var i = 0; i < list.length; i++) {
      var raw = cell(list[i], idx);
      if (!raw) continue;
      answered++;
      var parts = multi
        ? raw.split(';').map(function (s) { return s.trim(); }).filter(Boolean)
        : [raw];
      for (var j = 0; j < parts.length; j++) map[parts[j]] = (map[parts[j]] || 0) + 1;
    }
    var items = [];
    for (var key in map) if (map[key] > 0) items.push({ label: key, count: map[key] });
    return { items: items, answered: answered };
  }

  function scaleOf(list, idx) {
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var n = num(cell(list[i], idx));
      if (n === null) continue;
      map[String(n)] = (map[String(n)] || 0) + 1;
    }
    var items = [];
    for (var k in map) items.push({ label: k, count: map[k] });
    items.sort(function (a, b) { return Number(a.label) - Number(b.label); });
    return items;
  }

  function kpi(label, value, unit, sub) {
    return '<div class="dash-kpi">' +
      '<span class="dash-kpi-label">' + esc(label) + '</span>' +
      '<span class="dash-kpi-value">' + value + (unit ? ' <span class="dash-kpi-unit">' + esc(unit) + '</span>' : '') + '</span>' +
      '<span class="dash-kpi-sub">' + esc(sub) + '</span>' +
      '</div>';
  }

  function statCard(label, st, unit) {
    if (!st) {
      return '<div class="dash-stat">' +
        '<span class="dash-stat-label">' + esc(label) + '</span>' +
        '<span class="dash-stat-value">—</span>' +
        '<span class="dash-stat-sub">sin datos</span>' +
        '</div>';
    }
    return '<div class="dash-stat">' +
      '<span class="dash-stat-label">' + esc(label) + '</span>' +
      '<span class="dash-stat-value">' + fmt(st.avg) + '<span class="dash-stat-unit">' + esc(unit) + '</span></span>' +
      '<span class="dash-stat-sub">mediana ' + fmt(st.median) + ' · mín ' + fmt(st.min) + ' – máx ' + fmt(st.max) + ' · n=' + st.n + '</span>' +
      '</div>';
  }

  function bars(items) {
    if (!items.length) return '<p class="dash-nodata">Sin datos.</p>';
    var max = 1;
    for (var i = 0; i < items.length; i++) if (items[i].count > max) max = items[i].count;
    return '<div class="dash-bars">' + items.map(function (i) {
      return '<div class="dash-bar">' +
        '<span class="dash-bar-label" title="' + esc(i.label) + '">' + esc(shortLabel(i.label)) + '</span>' +
        '<span class="dash-bar-track"><span class="dash-bar-fill" style="width:' + Math.round((i.count / max) * 100) + '%"></span></span>' +
        '<span class="dash-bar-val">' + i.count + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function direct(r) {
    var hasAny = false;
    var day = 0;
    var lit = [[M.inodoro, 6], [M.mingitorio, 0.5]];
    for (var i = 0; i < lit.length; i++) {
      var v = num(cell(r, lit[i][0]));
      if (v !== null) hasAny = true;
      day += (v || 0) * lit[i][1];
    }
    var add = [M.dispenser, M.mate];
    for (var j = 0; j < add.length; j++) {
      var v2 = num(cell(r, add[j]));
      if (v2 !== null) hasAny = true;
      day += v2 || 0;
    }
    if (!hasAny) return { day: null, month: null };
    var dias = num(cell(r, M.dias));
    return { day: day, month: dias === null ? null : day * dias * 4 };
  }

  var HABITS = [
    [M.inodoro, 'Inodoro', 'veces/día'],
    [M.mingitorio, 'Mingitorio', 'veces/día'],
    [M.dispenser, 'Agua del dispenser', 'L/día'],
    [M.mate, 'Mate o té', 'L/día'],
    [M.cafe, 'Café', 'tazas/día'],
    [M.copias, 'Copias / impresiones', 'hojas/mes']
  ];

  function renderSummary(list) {
    var dates = list.map(function (r) { return String(r.f || '').slice(0, 10); }).filter(Boolean).sort();
    var fMin = dates[0] || '—';
    var fMax = dates[dates.length - 1] || '—';
    summary.textContent = list.length + ' respuestas · ' + fMin + ' → ' + fMax;
    gCount.textContent = list.length + ' de ' + rows.length + ' respuestas';
    return { fMin: fMin, fMax: fMax };
  }

  function renderKpis(list, range) {
    var stD = statsOf(list.map(function (r) { return cell(r, M.huellaD); }));
    var stM = statsOf(list.map(function (r) { return cell(r, M.huellaM); }));
    var dirs = list.map(direct);
    var stDD = statsOf(dirs.map(function (d) { return d.day; }));
    var stDM = statsOf(dirs.map(function (d) { return d.month; }));
    $('dash-kpis').innerHTML = [
      kpi('Respuestas totales', String(list.length), '', range.fMin + ' → ' + range.fMax),
      kpi('Huella diaria promedio', fmt(stD && stD.avg), 'L/día',
        stD ? 'mediana ' + fmt(stD.median) + ' · mín ' + fmt(stD.min) + ' – máx ' + fmt(stD.max) + ' · n=' + stD.n : 'sin datos'),
      kpi('Huella mensual promedio', fmt(stM && stM.avg), 'L/mes',
        stM ? 'mediana ' + fmt(stM.median) + ' · n=' + stM.n : 'sin datos'),
      kpi('Consumo directo de agua', fmt(stDD && stDD.avg), 'L/día',
        stDD ? 'mediana ' + fmt(stDD.median) + ' · mín ' + fmt(stDD.min) + ' – máx ' + fmt(stDD.max) + ' · n=' + stDD.n : 'sin datos'),
      kpi('Consumo directo al mes', fmt(stDM && stDM.avg), 'L/mes',
        stDM ? 'mediana ' + fmt(stDM.median) + ' · mín ' + fmt(stDM.min) + ' – máx ' + fmt(stDM.max) + ' · n=' + stDM.n : 'sin datos')
    ].join('');
  }

  function renderPerfil(list) {
    var cU = countsOf(list, M.unidad, OPTS.unidad, false);
    var cG = countsOf(list, M.genero, OPTS.genero, false);
    var cV = countsOf(list, M.vinculo, OPTS.vinculo, true);
    var cD = scaleOf(list, M.dias);
    var stH = statsOf(list.map(function (r) { return cell(r, M.horas); }));
    var nDias = 0;
    var wDias = 0;
    for (var i = 0; i < cD.length; i++) {
      nDias += cD[i].count;
      wDias += Number(cD[i].label) * cD[i].count;
    }
    var avgDias = nDias ? Math.round((wDias / nDias) * 100) / 100 : null;
    $('dash-perfil').innerHTML =
      '<div class="dash-grid">' +
      '  <div class="hh-card dash-card">' +
      '    <h3 class="dash-card-title">Unidad académica</h3>' + bars(cU.items) +
      '  </div>' +
      '  <div class="hh-card dash-card">' +
      '    <h3 class="dash-card-title">Género</h3>' + bars(cG.items) +
      '    <h3 class="dash-card-title dash-card-title--gap">Vínculo con la UNL</h3>' + bars(cV.items) +
      '  </div>' +
      '  <div class="hh-card dash-card">' +
      '    <h3 class="dash-card-title">Días por semana en la UNL</h3>' + bars(cD) +
      '    <p class="dash-card-note">Promedio de asistencia: <strong>' + fmt(avgDias) + ' días/semana</strong> (' + nDias + ' respuestas)</p>' +
      '    <h3 class="dash-card-title dash-card-title--gap">Horas por día en la UNL</h3>' +
      '    <p class="dash-card-note">' + (stH
        ? '<strong>' + fmt(stH.avg) + ' hs</strong> · mediana ' + fmt(stH.median) + ' · mín ' + fmt(stH.min) + ' – máx ' + fmt(stH.max) + ' · n=' + stH.n
        : 'sin datos') + '</p>' +
      '  </div>' +
      '</div>';
  }

  function renderHabitos(list) {
    var cards = HABITS.map(function (h) {
      return statCard(h[1], statsOf(list.map(function (r) { return cell(r, h[0]); })), h[2]);
    }).join('');
    var cC = countsOf(list, M.comedor, OPTS.comedor, false);
    var nSi = 0;
    for (var i = 0; i < cC.items.length; i++) if (cC.items[i].label === 'Sí') nSi = cC.items[i].count;
    var pct = cC.answered ? Math.round((nSi / cC.answered) * 100) : 0;
    var stV = statsOf(list.map(function (r) { return cell(r, M.veces); }));
    $('dash-habitos').innerHTML = '<div class="dash-stats">' + cards +
      '<div class="dash-stat dash-stat--wide">' +
      '<span class="dash-stat-label">Almuerza en el comedor / cantina</span>' +
      '<span class="dash-stat-value dash-stat-value--big">' + pct + '<span class="dash-stat-unit">%</span></span>' +
      '<span class="dash-stat-sub">' + nSi + ' de ' + cC.answered + ' que respondieron</span>' +
      '<span class="dash-stat-sub">Veces por semana: ' + (stV
        ? fmt(stV.avg) + ' (mín ' + fmt(stV.min) + ' – máx ' + fmt(stV.max) + ' · n=' + stV.n + ')'
        : '—') + '</span>' +
      '</div></div>';
  }

  head.innerHTML = '<th>Fecha</th>' + cols.map(function (c) {
    return '<th>' + esc(c.label) + '</th>';
  }).join('');

  function filtered() {
    var base = globalRows();
    var term = search.value.toLowerCase().trim();
    var g = fG.value;
    var v = fV.value;
    return base.filter(function (r) {
      if (g && cell(r, M.genero) !== g) return false;
      if (v && M.vinculo >= 0) {
        var parts = cell(r, M.vinculo).split(';').map(function (s) { return s.trim(); });
        if (parts.indexOf(v) === -1) return false;
      }
      if (term) {
        var hay = [r.f].concat(r.v).join(' ').toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });
  }

  function renderTable() {
    var base = globalRows();
    var list = filtered();
    var pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (page > pages) page = pages;
    var slice = list.slice((page - 1) * PAGE, page * PAGE);
    body.innerHTML = slice.map(function (r) {
      return '<tr><td>' + esc(r.f) + '</td>' + r.v.map(function (x) {
        return '<td>' + esc(x) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    empty.hidden = list.length > 0;
    empty.textContent = base.length
      ? 'Sin resultados para esa búsqueda o esos filtros.'
      : 'Sin respuestas para el filtro seleccionado.';
    count.textContent = list.length + ' de ' + base.length + ' respuestas';
    pageInfo.textContent = 'Página ' + page + ' de ' + pages;
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
  }

  function renderAll() {
    var g = globalRows();
    var range = renderSummary(g);
    renderKpis(g, range);
    renderPerfil(g);
    renderHabitos(g);
    renderTable();
  }

  function onGlobal() { page = 1; renderAll(); }
  function onTable() { page = 1; renderTable(); }

  function exportCsv() {
    var list = filtered();
    var lines = [['Fecha'].concat(cols.map(function (c) { return c.label; }))];
    list.forEach(function (r) { lines.push([r.f].concat(r.v)); });
    var text = '\\ufeff' + lines.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\\r\\n');
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'respuestas_hh_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  gU.addEventListener('change', onGlobal);
  gY.addEventListener('change', onGlobal);
  $('dash-g-clear').addEventListener('click', function () {
    gU.value = '';
    gY.value = '';
    onGlobal();
  });
  search.addEventListener('input', onTable);
  fG.addEventListener('change', onTable);
  fV.addEventListener('change', onTable);
  prev.addEventListener('click', function () { if (page > 1) { page--; renderTable(); } });
  next.addEventListener('click', function () { page++; renderTable(); });
  $('dash-csv').addEventListener('click', exportCsv);

  renderAll();
})();
</script>
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');

if (!fs.existsSync(path.join(ROOT, 'site', 'styles.css'))) {
  console.warn('! Falta site/styles.css — ejecuta «npm run generate» para que el dashboard tenga estilos.');
}

console.log(`✔ dashboard/index.html generado (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`  · Respuestas: ${total} (${fechaMin} → ${fechaMax}) · Columnas de tabla: ${TABLE_COLS.length}`);
console.log(`  · Filtros generales: unidad académica (${nUnidad}) · años (${years.join(', ') || '—'})`);
