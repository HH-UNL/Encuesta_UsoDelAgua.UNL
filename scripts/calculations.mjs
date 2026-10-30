/**
 * Ecuaciones de cálculo sobreescritas (qid resultField → equation/operands).
 *
 * Compartido por:
 *   - scripts/generate-site.mjs (HH_CONFIG de la web + site/datos/formulario.json)
 *   - scripts/recalc-local.mjs  (recálculo de data/submissions.json)
 *
 * Motivo: Jotform todavía tiene las fórmulas viejas, así que sin estos
 * overrides un `npm run fetch` + `npm run generate` revierte los cambios
 * del 29/10. Mismo criterio que NUMBER_LIMITS/EXTRA_CONDITIONS del generador.
 */
export const EQUATION_OVERRIDES = {
  '54': { equation: '[{5}+{53}*30+{49}*140]', operands: ['5', '53', '49'] }, // bebidas: mate ×30
  '55': { equation: '[{7}*(1/{16})*(1/4)*10]', operands: ['7', '16'] }, // papel por copias
  '69': { equation: '[{68}*(1/{16})*2151.31]', operands: ['68', '16'] }, // comedor por día asistido
};

export function applyEquationOverrides(calcs) {
  return (calcs || []).map((c) => {
    const ov = EQUATION_OVERRIDES[String(c.resultField)];
    return ov ? { ...c, ...ov } : c;
  });
}

/** Orden topológico de los cálculos (mismo algoritmo que templates/app.js). */
export function topoCalcs(calcs) {
  const byResult = {};
  calcs.forEach((c) => {
    byResult[String(c.resultField)] = c;
  });
  const done = {};
  const out = [];
  let guard = 0;
  while (out.length < calcs.length && guard++ < 30) {
    calcs.forEach((c) => {
      if (done[String(c.resultField)]) return;
      const deps = (c.operands || []).filter(
        (o) => byResult[String(o)] && String(o) !== String(c.resultField)
      );
      if (deps.every((d) => done[String(d)])) {
        done[String(c.resultField)] = true;
        out.push(c);
      }
    });
  }
  calcs.forEach((c) => {
    if (!done[String(c.resultField)]) out.push(c);
  });
  return out;
}

/** Evalúa una ecuación sobre un mapa qid → valor (falta/'' → 0). Devuelve null si la expresión no es evaluable o no es finita. */
export function evalEquation(c, valueByQid) {
  let expr = String(c.equation).replace(/^\s*\[/, '').replace(/\]\s*$/, '');
  expr = expr.replace(/\{(\d+)\}/g, (_, qid) => {
    if (String(qid) === String(c.resultField)) return '0';
    const raw = valueByQid[String(qid)];
    const n = raw == null || raw === '' ? 0 : Number(String(raw).replace(',', '.'));
    return '(' + (isNaN(n) ? 0 : n) + ')';
  });
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  try {
    const v = Function('"use strict"; return (' + expr + ');')();
    return typeof v === 'number' && isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
