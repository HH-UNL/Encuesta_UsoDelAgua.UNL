/**
 * Recalcula los campos de cálculo (qid 8/54/55/56/63/69, los que tengan
 * equation en form-structure.json) de data/submissions.json con las
 * ecuaciones vigentes — incluidos los EQUATION_OVERRIDES del 29/10.
 *
 * Para qué: el histórico de Jotform se guardó con las fórmulas anteriores
 * (mate ×120, q55 en 0, comedor ×4/30), así que check y exportaciones
 * locales quedaban desfasados respecto de Supabase (ya recalculado).
 *
 * Reproduce el motor del navegador (templates/app.js): orden topológico,
 * 2 pasadas, campos sin responder = 0, no-finitos = 0, redondeo a `decimals`.
 *
 * Uso:  npm run recalc-local        (recalcula + verifica y guarda)
 *       node scripts/recalc-local.mjs --dry-run   (solo informa cambios)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEquationOverrides, topoCalcs, evalEquation } from './calculations.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const DRY = process.argv.includes('--dry-run');

const structure = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'form-structure.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'submissions.json'), 'utf8'));
const subs = data.submissions || data || [];

const calcs = topoCalcs(applyEquationOverrides(structure.calculations || []));
if (!calcs.length) {
  console.error('No hay cálculos en data/form-structure.json');
  process.exit(1);
}

const fieldOf = (sub, qid) => (sub.fields || []).find((f) => String(f.qid) === String(qid));

function valuesOf(sub) {
  const map = {};
  for (const f of sub.fields || []) {
    if (Array.isArray(f.value)) map[String(f.qid)] = f.value.join(', ');
    else map[String(f.qid)] = f.value == null ? '' : String(f.value);
  }
  return map;
}

const changedByQid = {};
let totalChanges = 0;

for (const sub of subs) {
  const values = valuesOf(sub);
  // 2 pasadas, igual que runCalculations() en app.js
  for (let pass = 0; pass < 2; pass++) {
    for (const c of calcs) {
      const v = evalEquation(c, values);
      if (v === null) continue;
      const dec = typeof c.decimals === 'number' ? c.decimals : 2;
      const next = v.toFixed(dec);
      const f = fieldOf(sub, c.resultField);
      if (!f) {
        sub.fields.push({ qid: String(c.resultField), name: `q${c.resultField}`, type: 'control_calculation', label: '', value: next });
        values[String(c.resultField)] = next;
        changedByQid[c.resultField] = (changedByQid[c.resultField] || 0) + 1;
        totalChanges++;
        continue;
      }
      const prev = f.value == null ? '' : String(f.value);
      if (prev !== next) {
        changedByQid[c.resultField] = (changedByQid[c.resultField] || 0) + 1;
        totalChanges++;
        f.value = next;
        values[String(c.resultField)] = next;
      }
    }
  }
}

console.log(`Cálculos en orden: ${calcs.map((c) => c.resultField).join(' → ')}`);
if (totalChanges) {
  const labels = {};
  for (const c of calcs) labels[c.resultField] = c.equation;
  console.log(`Cambios: ${totalChanges} valores`);
  for (const [qid, n] of Object.entries(changedByQid).sort((a, b) => b[1] - a[1])) {
    console.log(`  qid ${String(qid).padStart(2)} → ${n} filas   ${labels[qid] || ''}`);
  }
} else {
  console.log('Sin cambios: los valores ya coincidían con las ecuaciones vigentes.');
}

// Verificación: todo valor almacenado debe reproducir su ecuación
let ok = 0;
let bad = 0;
for (const sub of subs) {
  const values = valuesOf(sub);
  for (const c of calcs) {
    const f = fieldOf(sub, c.resultField);
    if (!f || f.value === '' || f.value == null) continue;
    const stored = parseFloat(String(f.value));
    if (isNaN(stored)) continue;
    const v = evalEquation(c, values);
    const dec = typeof c.decimals === 'number' ? c.decimals : 2;
    if (v !== null && Math.abs(Number(v.toFixed(dec)) - stored) < 0.005) ok++;
    else {
      bad++;
      if (bad <= 5) console.log(`  ! sub ${sub.id} q${c.resultField}: guardado ${stored}, calculado ${v}`);
    }
  }
}
console.log(`Verificación: ${ok} coinciden · ${bad} discrepan`);

if (DRY) {
  console.log('(--dry-run: no se escribió nada)');
  process.exit(bad ? 1 : 0);
}
if (totalChanges) {
  data.total = subs.length;
  data.recalculated_at = new Date().toISOString();
  fs.writeFileSync(path.join(DATA_DIR, 'submissions.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log('✔ data/submissions.json actualizado');
  console.log('  · regenerá el sitio y el CSV/SQL locales si los usás: npm run generate / npm run export-supabase');
}
process.exit(bad ? 1 : 0);
