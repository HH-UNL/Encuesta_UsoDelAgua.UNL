/**
 * Descarga la vista pública de Supabase (respuestas_hh_public) y guarda
 * un snapshot local en data/respuestas_supabase.json.
 *
 * Motivo: desde el 23/10 las respuestas nuevas entran solo por la web →
 * Supabase, así que data/submissions.json (histórico de Jotform, 137 filas)
 * queda desfasado. El snapshot trae las ~187 filas reales con sus valores
 * de huella, y build-dashboard.mjs lo usa para las filas embebidas
 * (fallback cuando el fetch en vivo falla).
 *
 * La vista expone solo created_at + las 16 columnas de scripts/columns.mjs
 * (sin submission_id, status ni IP). Requiere .env con SUPABASE_URL y
 * SUPABASE_ANON_KEY (la anon key tiene SELECT sobre la vista).
 *
 * Uso: node scripts/fetch-supabase.mjs   (npm run fetch-supabase)
 * Salida: data/respuestas_supabase.json  (data/ es gitignore)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNS } from './columns.mjs';
import { supabaseConfig } from './env.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'data', 'respuestas_supabase.json');
const VIEW = 'respuestas_hh_public';

const { url, anonKey } = supabaseConfig(ROOT);
if (!url || !anonKey) {
  console.error('Falta SUPABASE_URL o SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const cols = ['created_at', ...COLUMNS.map((c) => c.col)].join(',');
const res = await fetch(`${url}/rest/v1/${VIEW}?select=${cols}&order=created_at.asc`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
});

if (!res.ok) {
  console.error(`Error ${res.status} al leer la vista ${VIEW}: ${await res.text()}`);
  process.exit(1);
}

const rows = await res.json();
if (!Array.isArray(rows) || rows.length === 0) {
  console.error(`La vista ${VIEW} devolvió 0 filas; no se guarda el snapshot.`);
  process.exit(1);
}

const snapshot = {
  fetched_at: new Date().toISOString(),
  view: VIEW,
  count: rows.length,
  rows,
};
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 1), 'utf8');

const fechas = rows.map((r) => r.created_at).filter(Boolean).sort();
console.log(`✔ data/respuestas_supabase.json  (${rows.length} filas)`);
console.log(`  · rango: ${fechas[0]} → ${fechas[fechas.length - 1]}`);
console.log('  · para incorporarlo al build: npm run dashboard');
