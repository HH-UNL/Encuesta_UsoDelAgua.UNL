#!/usr/bin/env node
/**
 * Genera dashboard/index.html: dashboard público con KPIs, distribución
 * por perfil, hábitos de consumo y tabla de respuestas con filtros.
 *
 * - Agregados calculados acá; la tabla embebe fecha + valores (sin IP,
 *   sin status, sin submission id), igual que respuestas.html.
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

function stats(values) {
  const nums = values.map(num).filter((n) => n !== null);
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    n: sorted.length,
    avg: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    median: round(median),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function counts(qid, { multi = false } = {}) {
  const question = structure.questions.find((x) => x.qid === qid);
  const order = (question?.options || []).map(String);
  const map = new Map(order.map((o) => [o, 0]));
  let answered = 0;
  for (const sub of subs) {
    const raw = fieldValue(sub, qid);
    if (!raw) continue;
    answered++;
    const parts = multi
      ? raw.split(';').map((s) => s.trim()).filter(Boolean)
      : [raw];
    for (const p of parts) map.set(p, (map.get(p) || 0) + 1);
  }
  const items = [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .filter((i) => i.count > 0);
  return { items, answered };
}

function scaleCounts(qid) {
  const map = new Map();
  for (const sub of subs) {
    const n = num(fieldValue(sub, qid));
    if (n === null) continue;
    map.set(String(n), (map.get(String(n)) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([label, count]) => ({ label, count }));
}

const fmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);

const shortLabel = (l) => (l.includes(':') ? l.slice(0, l.indexOf(':')) : l);

const total = subs.length;
const dates = subs.map((s) => String(s.created_at || '').slice(0, 10)).filter(Boolean).sort();
const fechaMin = dates[0] || '—';
const fechaMax = dates[dates.length - 1] || '—';

const stDiaria = stats(subs.map((s) => fieldValue(s, q('huella_diaria'))));
const stMensual = stats(subs.map((s) => fieldValue(s, q('huella_mensual'))));
const pctHuella = total && stDiaria ? Math.round((stDiaria.n / total) * 100) : 0;

const cUnidad = counts(q('unidad_academica'));
const cGenero = counts(q('genero'));
const cVinculo = counts(q('vinculo_unl'), { multi: true });
const cDias = scaleCounts(q('dias_semana'));
const stHoras = stats(subs.map((s) => fieldValue(s, q('horas_dia'))));

const HABIT_DEFS = [
  { col: 'inodoro_dia', label: 'Inodoro', unit: 'veces/día' },
  { col: 'mingitorio_dia', label: 'Mingitorio', unit: 'veces/día' },
  { col: 'litros_dispenser', label: 'Agua del dispenser', unit: 'L/día' },
  { col: 'litros_mate', label: 'Mate o té', unit: 'L/día' },
  { col: 'tazas_cafe', label: 'Café', unit: 'tazas/día' },
  { col: 'copias_mes', label: 'Copias / impresiones', unit: 'hojas/mes' },
];
const habitStats = HABIT_DEFS.map((d) => ({
  ...d,
  stats: stats(subs.map((s) => fieldValue(s, q(d.col)))),
}));

const cComedor = counts(q('almorza_comedor'));
const stVeces = stats(subs.map((s) => fieldValue(s, q('veces_comedor_semana'))));
const nSi = (cComedor.items.find((i) => i.label === 'Sí') || {}).count || 0;
const pctSi = cComedor.answered ? Math.round((nSi / cComedor.answered) * 100) : 0;

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

const payload = JSON.stringify({ cols: TABLE_COLS, rows, pageSize: 25 }).replace(/</g, '\\u003c');

/* ------------------------------------------------------------------ */
/* Render de piezas                                                    */
/* ------------------------------------------------------------------ */

function kpi(label, value, unit, sub) {
  return `<div class="dash-kpi">
      <span class="dash-kpi-label">${esc(label)}</span>
      <span class="dash-kpi-value">${value}${unit ? ` <span class="dash-kpi-unit">${esc(unit)}</span>` : ''}</span>
      <span class="dash-kpi-sub">${esc(sub)}</span>
    </div>`;
}

function statCard(label, st, unit) {
  if (!st) {
    return `<div class="dash-stat">
      <span class="dash-stat-label">${esc(label)}</span>
      <span class="dash-stat-value">—</span>
      <span class="dash-stat-sub">sin datos</span>
    </div>`;
  }
  return `<div class="dash-stat">
      <span class="dash-stat-label">${esc(label)}</span>
      <span class="dash-stat-value">${fmt(st.avg)}<span class="dash-stat-unit">${esc(unit)}</span></span>
      <span class="dash-stat-sub">mediana ${fmt(st.median)} · mín ${fmt(st.min)} – máx ${fmt(st.max)} · n=${st.n}</span>
    </div>`;
}

function bars(items) {
  if (!items.length) return '<p class="dash-nodata">Sin datos.</p>';
  const max = Math.max(1, ...items.map((i) => i.count));
  return `<div class="dash-bars">${items
    .map(
      (i) => `<div class="dash-bar">
        <span class="dash-bar-label" title="${esc(i.label)}">${esc(shortLabel(i.label))}</span>
        <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${Math.round(
          (i.count / max) * 100
        )}%"></span></span>
        <span class="dash-bar-val">${i.count}</span>
      </div>`
    )
    .join('')}</div>`;
}

function options(items) {
  return items.map((i) => `<option value="${esc(i.label)}">${esc(i.label)}</option>`).join('');
}

const kpisHtml = [
  kpi('Respuestas totales', String(total), '', `${fechaMin} → ${fechaMax}`),
  kpi('Huella diaria promedio', fmt(stDiaria && stDiaria.avg), 'L/día',
    stDiaria ? `mediana ${fmt(stDiaria.median)} · mín ${fmt(stDiaria.min)} – máx ${fmt(stDiaria.max)} · n=${stDiaria.n}` : 'sin datos'),
  kpi('Huella mensual promedio', fmt(stMensual && stMensual.avg), 'L/mes',
    stMensual ? `mediana ${fmt(stMensual.median)} · n=${stMensual.n}` : 'sin datos'),
  kpi('Con huella calculada', `${pctHuella}%`, '', stDiaria ? `${stDiaria.n} de ${total} respuestas` : 'sin datos'),
  kpi('Horas por día en la UNL', fmt(stHoras && stHoras.avg), 'hs',
    stHoras ? `mediana ${fmt(stHoras.median)} · mín ${fmt(stHoras.min)} – máx ${fmt(stHoras.max)} · n=${stHoras.n}` : 'sin datos'),
].join('\n    ');

const perfilHtml = `
  <div class="dash-grid">
    <div class="hh-card dash-card">
      <h3 class="dash-card-title">Unidad académica</h3>
      ${bars(cUnidad.items)}
    </div>
    <div class="hh-card dash-card">
      <h3 class="dash-card-title">Género</h3>
      ${bars(cGenero.items)}
      <h3 class="dash-card-title dash-card-title--gap">Vínculo con la UNL</h3>
      ${bars(cVinculo.items)}
    </div>
    <div class="hh-card dash-card">
      <h3 class="dash-card-title">Días por semana en la UNL</h3>
      ${bars(cDias)}
      <p class="dash-card-note">Promedio de asistencia: <strong>${fmt(
        cDias.length
          ? Math.round(
              (cDias.reduce((a, i) => a + Number(i.label) * i.count, 0) /
                cDias.reduce((a, i) => a + i.count, 0)) * 100
            ) / 100
          : null
      )} días/semana</strong> (${cDias.reduce((a, i) => a + i.count, 0)} respuestas)</p>
    </div>
  </div>`;

const habitosHtml = `
  <div class="dash-stats">
    ${habitStats.map((h) => statCard(h.label, h.stats, h.unit)).join('\n    ')}
    <div class="dash-stat dash-stat--wide">
      <span class="dash-stat-label">Almuerza en el comedor / cantina</span>
      <span class="dash-stat-value dash-stat-value--big">${pctSi}<span class="dash-stat-unit">%</span></span>
      <span class="dash-stat-sub">${nSi} de ${cComedor.answered} que respondieron</span>
      <span class="dash-stat-sub">Veces por semana: ${
        stVeces ? `${fmt(stVeces.avg)} (mín ${fmt(stVeces.min)} – máx ${fmt(stVeces.max)} · n=${stVeces.n})` : '—'
      }</span>
    </div>
  </div>`;

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
.dash-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.dash-kpi { background: var(--hh-surface); border: 1px solid var(--hh-border); border-radius: var(--hh-radius); box-shadow: var(--hh-shadow); padding: 18px 20px; display: flex; flex-direction: column; gap: 4px; }
.dash-kpi-label { font-size: 0.76rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--hh-muted); }
.dash-kpi-value { font-size: 1.85rem; font-weight: 700; color: var(--hh-text); line-height: 1.15; font-variant-numeric: tabular-nums; }
.dash-kpi-unit { font-size: 0.95rem; font-weight: 600; color: var(--hh-muted); }
.dash-kpi-sub { font-size: 0.79rem; color: var(--hh-muted); }
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
    <p>${total} respuestas · ${fechaMin} → ${fechaMax}</p>
  </header>

  <div class="dash-kpis">
    ${kpisHtml}
  </div>

  <h2 class="dash-title">Distribución por perfil</h2>
  ${perfilHtml}

  <h2 class="dash-title">Hábitos de consumo</h2>
  ${habitosHtml}

  <h2 class="dash-title">Tabla de respuestas</h2>
  <div class="hh-toolbar dash-toolbar">
    <input class="hh-input" id="dash-search" type="search" placeholder="Buscar en las respuestas…">
    <select class="hh-select" id="dash-f-unidad" aria-label="Filtrar por unidad académica">
      <option value="">Unidad académica: todas</option>
      ${options(cUnidad.items)}
    </select>
    <select class="hh-select" id="dash-f-genero" aria-label="Filtrar por género">
      <option value="">Género: todos</option>
      ${options(cGenero.items)}
    </select>
    <select class="hh-select" id="dash-f-vinculo" aria-label="Filtrar por vínculo">
      <option value="">Vínculo: todos</option>
      ${options(cVinculo.items)}
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
  var PAGE = D.pageSize || 25;
  var page = 1;
  var $ = function (id) { return document.getElementById(id); };
  var search = $('dash-search');
  var fU = $('dash-f-unidad');
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

  function colIndex(qid) {
    for (var i = 0; i < cols.length; i++) if (cols[i].qid === qid) return i;
    return -1;
  }
  var iU = colIndex('12');
  var iG = colIndex('11');
  var iV = colIndex('14');

  head.innerHTML = '<th>Fecha</th>' + cols.map(function (c) {
    return '<th>' + esc(c.label) + '</th>';
  }).join('');

  function filtered() {
    var term = search.value.toLowerCase().trim();
    var u = fU.value;
    var g = fG.value;
    var v = fV.value;
    return rows.filter(function (r) {
      if (u && iU >= 0 && r.v[iU] !== u) return false;
      if (g && iG >= 0 && r.v[iG] !== g) return false;
      if (v && iV >= 0) {
        var parts = r.v[iV].split(';').map(function (s) { return s.trim(); });
        if (parts.indexOf(v) === -1) return false;
      }
      if (term) {
        var hay = [r.f].concat(r.v).join(' ').toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });
  }

  function render() {
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
    empty.textContent = rows.length
      ? 'Sin resultados para esa búsqueda o esos filtros.'
      : 'Sin respuestas exportadas. Ejecuta «npm run fetch» y «npm run dashboard».';
    count.textContent = list.length + ' de ' + rows.length + ' respuestas';
    pageInfo.textContent = 'Página ' + page + ' de ' + pages;
    prev.disabled = page <= 1;
    next.disabled = page >= pages;
  }

  function reset() { page = 1; render(); }

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

  search.addEventListener('input', reset);
  fU.addEventListener('change', reset);
  fG.addEventListener('change', reset);
  fV.addEventListener('change', reset);
  prev.addEventListener('click', function () { if (page > 1) { page--; render(); } });
  next.addEventListener('click', function () { page++; render(); });
  $('dash-csv').addEventListener('click', exportCsv);

  render();
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
console.log(`  · Respuestas: ${total} · Columnas de tabla: ${TABLE_COLS.length}`);
console.log(`  · Perfil: unidad ${cUnidad.items.length} · género ${cGenero.items.length} · vínculo ${cVinculo.items.length}`);
console.log(`  · Huella diaria: ${stDiaria ? `prom ${stDiaria.avg} L/día (n=${stDiaria.n})` : 'sin datos'}`);
console.log('\nPrevisualizar: npm run dashboard && npm run serve → http://localhost:8080/dashboard/');
