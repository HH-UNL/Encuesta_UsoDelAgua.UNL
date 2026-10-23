/**
 * Lectura del .env compartida por los scripts de build.
 * Solo variables explícitas: no aplica defaults de otros archivos.
 */
import fs from 'node:fs';
import path from 'node:path';

export function readEnv(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith('#')) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sin .env */
  }
  return out;
}

export function supabaseConfig(root) {
  const env = readEnv(path.join(root, '.env'));
  return {
    url: (process.env.SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
  };
}
