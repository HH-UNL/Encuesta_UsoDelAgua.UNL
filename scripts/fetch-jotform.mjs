#!/usr/bin/env node
/**
 * Descarga la estructura y las respuestas de un formulario Jotform
 * y las guarda normalizadas en data/.
 *
 * Uso:
 *   node scripts/fetch-jotform.mjs
 *
 * Requiere .env con JOTFORM_API_KEY y JOTFORM_FORM_ID (ver .env.example)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const API_BASE = 'https://api.jotform.com';
const PAGE_SIZE = 100;
const MAX_SUBMISSIONS = Number(process.env.MAX_SUBMISSIONS || 5000);
const RATE_DELAY_MS = 120;

loadEnvFile(path.join(ROOT, '.env'));

const apiKey = process.env.JOTFORM_API_KEY?.trim();
const formId = process.env.JOTFORM_FORM_ID?.trim();

if (!apiKey || !formId) {
  console.error(
    [
      'Faltan credenciales en .env.',
      '',
      '1. Copia .env.example a .env',
      '2. Consigue tu API key en https://www.jotform.com/myaccount/api/',
      '3. Copia el ID del formulario desde su URL (https://form.jotform.com/250012345678901 -> 250012345678901)',
      '',
      'JOTFORM_API_KEY=...',
      'JOTFORM_FORM_ID=...',
    ].join('\n')
  );
  process.exit(1);
}

async function apiGet(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { APIKEY: apiKey, Accept: 'application/json', 'User-Agent': 'encuesta-hh/1.0' },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no válida de Jotform (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || (body.responseCode && body.responseCode >= 400)) {
    const msg = body.message || text.slice(0, 200);
    if (res.status === 401 || /api key/i.test(String(msg))) {
      throw new Error('API key inválida o sin permisos sobre este formulario.');
    }
    if (res.status === 404) {
      throw new Error(`Formulario ${formId} no encontrado (¿ID incorrecto?).`);
    }
    throw new Error(`Jotform API ${res.status}: ${msg}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

function decodeEntities(s = '') {
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, '&')
    .trim();
}

function parseOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((o) => String(o));
  if (typeof raw === 'object') return Object.values(raw).map((o) => String(o));
  return String(raw)
    .split('|')
    .map((o) => o.trim())
    .filter(Boolean);
}

function parseList(raw) {
  return parseOptions(raw);
}

function isYes(v) {
  return /^(yes|on|true|1)$/i.test(String(v ?? ''));
}

function normalizeQuestion(q) {
  const type = String(q.type || '');
  const qid = String(q.qid ?? q.id ?? '');
  const extra = {
    literal: q.literal ?? '',
    subLabel: decodeEntities(q.subLabel || ''),
    placeholder: decodeEntities(q.placeholder || ''),
    firstOption: decodeEntities(q.firstOption || ''),
    other: isYes(q.other),
    suffix: q.suffix || '',
    prefix: q.prefix || '',
    // texto informativo (control_text conserva su HTML original)
    html: type === 'control_text' ? String(q.text || '') : '',
    // number
    min: q.minValue !== undefined && q.minValue !== '' ? q.minValue : '',
    max: q.maxValue !== undefined && q.maxValue !== '' ? q.maxValue : '',
    // datetime
    dateMin: q.minDate || q.dateMin || '',
    dateMax: q.maxDate || q.dateMax || '',
    dateFormat: q.format || q.dateFormat || '',
    // fileupload
    allowedTypes: q.allowedTypes || '',
    maxFiles: Number(q.maxFiles || 1) || 1,
    maxSize: Number(q.maxSize || 10) || 10,
    // phone
    phoneFormat: q.phoneFormat || '',
    // address
    showCountry: isYes(q.addresscountry ?? q.showCountry),
    // scale
    scalePoints: Number(q.scaleAmount || q.scalePoints || 0) || 0,
    scaleFrom: q.scaleFrom !== undefined && q.scaleFrom !== '' ? Number(q.scaleFrom) : 1,
    scaleType: q.scaleType || '',
    scaleMinLabel: decodeEntities(q.scaleMinLabel || q.leftSideText || ''),
    scaleMaxLabel: decodeEntities(q.scaleMaxLabel || q.rightSideText || ''),
    // matrix
    matrixType: q.matrixType || '',
    matrixRows: parseList(q.matrixRows),
    matrixColumns: parseList(q.matrixColumns),
    // terms
    termsText: decodeEntities(q.termsText || q.text || ''),
    // pagebreak
    pageBreak: isYes(q.pageBreak),
    pageInfo: decodeEntities(q.pageInfo || ''),
    nextText: decodeEntities(q.nextText || ''),
    backText: decodeEntities(q.backText || ''),
    autoNext: isYes(q.autoNext),
  };

  return {
    qid,
    type,
    name: q.name || `q${qid}`,
    label: decodeEntities(q.text || ''),
    description: decodeEntities(q.description || ''),
    required: isYes(q.required),
    hidden: isYes(q.hidden),
    options: parseOptions(q.options),
    order: Number(q.order || 0),
    pageNumber: Number(q.pageNumber || 1) || 1,
    readonly: isYes(q.readonly),
    validation: String(q.validation || ''),
    width: q.width || '',
    extra,
    raw: q,
  };
}

function shortTitle(label = '') {
  const first = String(label).split(/\n/)[0].trim();
  return first.length > 56 ? first.slice(0, 53).trim() + '…' : first;
}

function buildPages(questions) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const pages = [];
  let current = { number: 1, title: '', pageInfo: '', questions: [], autoNext: false };
  pages.push(current);
  let nextText = '';
  let backText = '';
  let autoNext = false;

  for (const q of sorted) {
    if (q.type === 'control_pagebreak') {
      if (!nextText && q.extra.nextText) nextText = q.extra.nextText;
      if (!backText && q.extra.backText) backText = q.extra.backText;
      if (q.extra.autoNext) autoNext = true;
      current.autoNext = q.extra.autoNext;
      current = {
        number: pages.length + 1,
        title: '',
        pageInfo: q.extra.pageInfo || '',
        questions: [],
        autoNext: false,
      };
      pages.push(current);
      continue;
    }
    q.pageNumber = current.number;
    if (!current.title) {
      if (q.type === 'control_head' && q.label) {
        current.title = shortTitle(q.label);
      } else if (q.type === 'control_text' && q.label) {
        current.title = shortTitle(q.label);
      }
    }
    current.questions.push(q);
  }

  for (const p of pages) {
    if (!p.title) p.title = p.pageInfo || (p.number > 1 ? `Página ${p.number}` : '');
  }
  const visible = pages.filter((p) => p.questions.length > 0);
  return {
    pages: visible,
    total: visible.length,
    nextText: nextText || 'Siguiente',
    backText: backText || 'Anterior',
    autoNext,
  };
}

function normalizeCalculations(raw) {
  let calcs = raw?.calculations ?? [];
  if (typeof calcs === 'string') calcs = calcs ? JSON.parse(calcs) : [];
  if (!Array.isArray(calcs)) return [];
  return calcs
    .map((c) => ({
      resultField: String(c.resultField || ''),
      equation: String(c.equation || ''),
      decimals: Number.isFinite(Number(c.decimalPlaces)) ? Number(c.decimalPlaces) : 2,
      operands: String(c.operands || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }))
    .filter((c) => c.resultField && c.equation);
}

function normalizeConditions(raw) {
  let list = raw?.conditions ?? [];
  if (typeof list === 'string') list = list ? JSON.parse(list) : [];
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => {
      let terms = [];
      let actions = [];
      try {
        terms = JSON.parse(r.terms || '[]');
      } catch {}
      try {
        actions = JSON.parse(r.action || '[]');
      } catch {}
      return {
        type: r.type || 'field',
        link: r.link === 'Any' ? 'Any' : 'All',
        terms: terms.map((t) => ({
          field: String(t.field ?? ''),
          operator: t.operator || 'equals',
          value: t.value ?? '',
        })),
        actions: actions.map((a) => ({
          visibility: a.visibility || '',
          field: a.field ? String(a.field) : '',
          fields: (a.fields || []).map(String),
        })),
      };
    })
    .filter((r) => r.terms.length && r.actions.length);
}

function pickAnswerValue(ans) {
  if (ans == null) return '';
  if (typeof ans === 'string' || typeof ans === 'number') return String(ans);
  if (Array.isArray(ans)) return ans.filter(Boolean).join(', ');
  if (typeof ans === 'object') {
    if (Array.isArray(ans.answer)) return ans.answer.filter(Boolean).join(', ');
    if (ans.answer != null) return pickAnswerValue(ans.answer);
    return '';
  }
  return String(ans);
}

function extractAnswer(ans) {
  if (!ans || typeof ans !== 'object') return pickAnswerValue(ans);
  if (ans.prettyFormat) return String(ans.prettyFormat);
  if (!('answer' in ans)) return '';
  return pickAnswerValue(ans.answer);
}

function normalizeSubmission(sub, questions) {
  const answers = sub.answers || {};
  const fields = [];
  const seen = new Set();
  for (const q of questions) {
    const ans = answers[q.qid];
    const value = extractAnswer(ans);
    fields.push({
      qid: q.qid,
      name: q.name,
      type: q.type,
      label: q.label || q.name,
      value,
    });
    seen.add(q.qid);
    for (const [k, a] of Object.entries(answers)) {
      if (k.startsWith(q.qid + '_') && !seen.has(k)) {
        seen.add(k);
        const val = extractAnswer(a);
        if (val) {
          fields.push({
            qid: k,
            name: a.name || k,
            type: q.type,
            label: `${q.label || q.name} (${k.split('_').slice(1).join('_')})`,
            value: val,
          });
        }
      }
    }
  }
  for (const [k, a] of Object.entries(answers)) {
    if (seen.has(k)) continue;
    const val = extractAnswer(a);
    fields.push({
      qid: k,
      name: a.name || k,
      type: a.type || '',
      label: decodeEntities(a.prettyFormat && !val ? a.prettyFormat : a.name || k),
      value: val,
    });
  }
  const flat = {};
  for (const f of fields) {
    if (f.value !== '') flat[f.label || f.name] = f.value;
  }
  return {
    id: String(sub.id),
    created_at: sub.created_at || '',
    status: sub.status || '',
    ip: sub.ip || '',
    fields,
    flat,
  };
}

async function fetchAllSubmissions() {
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await apiGet(`/form/${formId}/submissions`, {
      offset,
      limit: PAGE_SIZE,
      orderby: 'created_at:desc',
    });
    const content = page.content;
    let rows = [];
    if (Array.isArray(content)) rows = content;
    else if (content && typeof content === 'object') {
      rows = Array.isArray(content) ? content : Object.values(content);
    }
    all.push(...rows);
    process.stdout.write(`\r  Descargadas: ${all.length}`);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (all.length >= MAX_SUBMISSIONS) break;
    await sleep(RATE_DELAY_MS);
  }
  process.stdout.write('\n');
  return all.slice(0, MAX_SUBMISSIONS);
}

async function main() {
  console.log(`Conectando a Jotform… formulario ${formId}`);
  fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log('→ Descargando detalles del formulario');
  const formRes = await apiGet(`/form/${formId}`);
  const formRaw = formRes.content || {};
  fs.writeFileSync(path.join(RAW_DIR, 'form.json'), JSON.stringify(formRaw, null, 2));
  await sleep(RATE_DELAY_MS);

  console.log('→ Descargando preguntas');
  const qRes = await apiGet(`/form/${formId}/questions`);
  const questionsRaw = qRes.content || {};
  fs.writeFileSync(path.join(RAW_DIR, 'questions.json'), JSON.stringify(questionsRaw, null, 2));
  await sleep(RATE_DELAY_MS);

  let properties = {};
  try {
    console.log('→ Descargando propiedades');
    const pRes = await apiGet(`/form/${formId}/properties`);
    properties = pRes.content || {};
    fs.writeFileSync(path.join(RAW_DIR, 'properties.json'), JSON.stringify(properties, null, 2));
  } catch (e) {
    console.warn(`  Aviso: no se pudieron leer propiedades (${e.message})`);
  }

  const propertiesForPages = { ...(formRaw.properties || {}), ...properties };
  const questions = Object.values(questionsRaw)
    .map(normalizeQuestion)
    .filter((q) => !['control_captcha', 'control_payment'].includes(q.type) && !(q.type && q.type.startsWith('control_payment')))
    .sort((a, b) => a.order - b.order);

  const { pages, total, nextText, backText, autoNext } = buildPages(questions);

  let calculations = [];
  let conditions = [];
  try {
    calculations = normalizeCalculations(propertiesForPages);
  } catch (e) {
    console.warn(`  Aviso: no se pudieron leer los cálculos (${e.message})`);
  }
  try {
    conditions = normalizeConditions(propertiesForPages);
  } catch (e) {
    console.warn(`  Aviso: no se pudieron leer las condiciones (${e.message})`);
  }

  const form = {
    id: String(formRaw.id || formId),
    title: decodeEntities(formRaw.title || formRaw.name || 'Formulario'),
    url: formRaw.url || `https://form.jotform.com/${formId}`,
    status: formRaw.status || '',
    created_at: formRaw.created_at || '',
    last_submission: formRaw.last_submission || '',
    submission_count: formRaw.count ?? null,
    width: formRaw.width || '',
    properties: propertiesForPages,
    pageCount: total,
    nextText,
    backText,
    autoNext,
    thankYou: String(propertiesForPages.thanktext || ''),
    clearOnHide: isYes(propertiesForPages.clearFieldOnHide),
  };

  const structure = {
    fetched_at: new Date().toISOString(),
    form,
    pages,
    questions,
    calculations,
    conditions,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'form-structure.json'), JSON.stringify(structure, null, 2));
  console.log(`✔ Estructura guardada: ${questions.length} campos, ${total} página(s)`);

  console.log('→ Descargando respuestas');
  let submissions = [];
  try {
    const rawSubs = await fetchAllSubmissions();
    submissions = rawSubs.map((s) => normalizeSubmission(s, questions));
  } catch (e) {
    console.warn(`  Aviso: no se pudieron descargar respuestas (${e.message})`);
  }
  fs.writeFileSync(
    path.join(DATA_DIR, 'submissions.json'),
    JSON.stringify({ fetched_at: new Date().toISOString(), total: submissions.length, submissions }, null, 2)
  );
  console.log(`✔ Respuestas guardadas: ${submissions.length}`);
  console.log('\nListo. Ahora ejecuta: npm run generate');
}

main().catch((e) => {
  console.error(`\n✖ Error: ${e.message}`);
  process.exit(1);
});
