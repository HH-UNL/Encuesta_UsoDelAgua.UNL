import fs from 'node:fs';
const html = fs.readFileSync('site/index.html', 'utf8');
const count = (re) => (html.match(re) || []).length;
console.log('HH_CONFIG:', count(/window\.HH_CONFIG/g));
console.log('hh-info (texto rico):', count(/class="hh-field hh-info"/g));
console.log('imgs en info:', count(/<img /g));
console.log('hh-calc:', count(/hh-calc/g));
console.log('hh-result:', count(/hh-result/g));
const i16 = html.indexOf('name="q16"');
const seg = html.substring(i16 - 200, i16 + 1200);
console.log('escala q16 values:', [...seg.matchAll(/value="(\d+)"/g)].map((m) => m[1]).join(','));
const i18 = html.indexOf('name="q18"');
const seg18 = html.substring(i18 - 200, i18 + 3600);
console.log('escala q18 items:', [...seg18.matchAll(/value="(\d+)"/g)].length);
console.log('q49 input:', /<input class="hh-input" id="f-49"[^>]*/.exec(html)?.[0]);
console.log('hidden calc q8:', /<input type="hidden" class="hh-calc" id="f-8"[^>]*/.exec(html)?.[0]);
console.log('visible calc q56:', /<input class="hh-input hh-calc" id="f-56"[^>]*/.exec(html)?.[0]);
console.log('subLabel litros/dia:', html.includes('litros/d'));
const cfg = /window\.HH_CONFIG = ([\s\S]*?);\n<\/script>|window\.HH_CONFIG = ([\s\S]*?);\s*\n?\s*<script src/.exec(html);
const json = cfg ? (cfg[1] || cfg[2]) : null;
if (json) {
  const c = JSON.parse(json.replace(/\\u003c/g, '<'));
  console.log('config: calcs=' + c.calculations.length, 'conds=' + c.conditions.length, 'thankYou=' + (c.thankYou ? 'sí(' + c.thankYou.length + 'ch)' : 'no'));
}
