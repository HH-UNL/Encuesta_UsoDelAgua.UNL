/**
 * Genera data/respuestas_hh.sql con CREATE TABLE + INSERT de todas las
 * respuestas de data/submissions.json, listo para pegar en el SQL Editor
 * de Supabase. Idempotente: re-ejecutarlo tras un npm run fetch actualiza
 * los datos (truncate + insert).
 *
 * Salida también en data/respuestas_hh.csv (alternativa: importar por
 * Table Editor → Import data → CSV).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS } from './columns.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TABLE = 'public.respuestas_hh';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'submissions.json'), 'utf8'));
const subs = raw.submissions ?? raw;

let skipped = 0;
const rows = [];

for (const sub of subs) {
  const byQid = {};
  for (const f of sub.fields || []) byQid[f.qid] = f.value;

  const vals = [];
  for (const c of COLUMNS) {
    let v = byQid[c.qid];
    if (Array.isArray(v)) v = v.join('; ');
    v = v == null ? '' : String(v).trim();

    if (c.type === 'numeric') {
      if (v === '' || isNaN(Number(v))) {
        if (v !== '') {
          skipped++;
          console.warn(`  ! ${sub.id} q${c.qid} «${v}» no es numérico → NULL`);
        }
        vals.push('NULL');
      } else {
        vals.push(Number(v));
      }
    } else {
      vals.push(v === '' ? 'NULL' : q(v));
    }
  }

  rows.push(
    `(${q(sub.id)}, ${q(sub.created_at)}::timestamptz, ${q(sub.status || '')}, ${vals.join(', ')})`
  );
}

const colDefs = [
  '  submission_id text primary key,',
  '  created_at timestamptz,',
  '  status text,',
  ...COLUMNS.map((c, i) => `  ${c.col} ${c.type}${i < COLUMNS.length - 1 ? ',' : ''}`),
].join('\n');

const sql = `-- Importación de respuestas — encuesta Huella Hídrica UNL
-- Generado por scripts/export-supabase.mjs — ${new Date().toISOString()}
-- ${subs.length} respuestas · ${COLUMNS.length} campos
--
-- Cómo usar: Supabase → SQL Editor → New query → pegar → Run.
-- Re-ejecutar tras un npm run fetch vuelve a importar todo (truncate + insert).
-- RLS queda habilitada SIN políticas: la API (anon key) no puede leer nada;
-- solo se ve desde tu dashboard (service role). "Solo vos".

create table if not exists ${TABLE} (
${colDefs}
);

truncate ${TABLE};

insert into ${TABLE}
  (submission_id, created_at, status, ${COLUMNS.map((c) => c.col).join(', ')})
values
${rows.join(',\n')};

-- Seguridad: nadie lee ni escribe vía API pública. En Table Editor se ve todo.
alter table ${TABLE} enable row level security;

select count(*) as total from ${TABLE};
`;

const out = path.join(ROOT, 'data', 'respuestas_hh.sql');
fs.writeFileSync(out, sql, 'utf8');

// CSV alternativo (mismas columnas)
const csvEsc = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
const csvLines = [
  ['submission_id', 'created_at', 'status', ...COLUMNS.map((c) => c.col)].join(','),
  ...subs.map((sub) => {
    const byQid = {};
    for (const f of sub.fields || []) byQid[f.qid] = f.value;
    return [
      sub.id,
      sub.created_at,
      sub.status || '',
      ...COLUMNS.map((c) => {
        let v = byQid[c.qid];
        if (Array.isArray(v)) v = v.join('; ');
        return csvEsc(v == null ? '' : String(v));
      }),
    ].join(',');
  }),
];
fs.writeFileSync(path.join(ROOT, 'data', 'respuestas_hh.csv'), csvLines.join('\n'), 'utf8');

console.log(`✔ data/respuestas_hh.sql  (${subs.length} INSERT, ${(sql.length / 1024).toFixed(0)} KB)`);
console.log(`✔ data/respuestas_hh.csv  (alternativa por Table Editor)`);
if (skipped) console.log(`  · ${skipped} valores no numéricos pasaron a NULL`);
