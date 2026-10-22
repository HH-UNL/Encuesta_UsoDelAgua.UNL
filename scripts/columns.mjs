/**
 * Mapping qid → columna compartido por los exportadores.
 *
 * Lo usan:
 *   - scripts/export-supabase.mjs (tabla Supabase public.respuestas_hh)
 *   - scripts/build-dashboard.mjs (agregados del dashboard)
 *
 * Los qid sin columna (head/text/pagebreak/cálculos ocultos) no se exportan.
 */
export const COLUMNS = [
  { qid: '12', col: 'unidad_academica', type: 'text' },
  { qid: '11', col: 'genero', type: 'text' },
  { qid: '14', col: 'vinculo_unl', type: 'text' },
  { qid: '16', col: 'dias_semana', type: 'numeric' },
  { qid: '18', col: 'horas_dia', type: 'numeric' },
  { qid: '3', col: 'inodoro_dia', type: 'numeric' },
  { qid: '4', col: 'mingitorio_dia', type: 'numeric' },
  { qid: '5', col: 'litros_dispenser', type: 'numeric' },
  { qid: '17', col: 'infusiones', type: 'text' },
  { qid: '53', col: 'litros_mate', type: 'numeric' },
  { qid: '49', col: 'tazas_cafe', type: 'numeric' },
  { qid: '67', col: 'almorza_comedor', type: 'text' },
  { qid: '68', col: 'veces_comedor_semana', type: 'numeric' },
  { qid: '7', col: 'copias_mes', type: 'numeric' },
  { qid: '56', col: 'huella_diaria', type: 'numeric' },
  { qid: '63', col: 'huella_mensual', type: 'numeric' },
];
