import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('data/submissions.json', 'utf8'));
const structure = JSON.parse(fs.readFileSync('data/form-structure.json', 'utf8'));

function num(fields, qid) {
  const f = fields.find((x) => x.qid === String(qid));
  const n = f ? parseFloat(String(f.value).replace(',', '.')) : NaN;
  return isNaN(n) ? 0 : n;
}

function evalCalc(c, fields) {
  let expr = c.equation.replace(/^\s*\[/, '').replace(/\]\s*$/, '');
  expr = expr.replace(/\{(\d+)\}/g, (_, qid) => {
    if (String(qid) === String(c.resultField)) return '0';
    return '(' + num(fields, qid) + ')';
  });
  const v = Function('"use strict"; return (' + expr + ');')();
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

let ok = 0;
let bad = 0;
let checked = 0;
for (const sub of data.submissions) {
  for (const c of structure.calculations) {
    const stored = sub.fields.find((f) => f.qid === c.resultField);
    if (!stored || stored.value === '') continue;
    const storedNum = parseFloat(stored.value);
    if (isNaN(storedNum)) continue;
    const computed = Number(evalCalc(c, sub.fields).toFixed(c.decimals));
    checked++;
    if (Math.abs(computed - storedNum) < 0.02) ok++;
    else {
      bad++;
      if (bad <= 5) {
        console.log('MISMATCH sub', sub.id, 'result qid', c.resultField, 'eq', c.equation);
        console.log('  stored', storedNum, 'computed', computed);
        for (const op of c.operands) {
          const f = sub.fields.find((x) => x.qid === op);
          console.log('   operand', op, '=', f ? JSON.stringify(f.value.slice(0, 30)) : 'AUSENTE');
        }
      }
    }
  }
}
console.log(`\nCálculos verificados: ${checked} | coinciden: ${ok} | discrepan: ${bad}`);
