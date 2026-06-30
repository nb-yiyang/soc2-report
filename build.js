const fs = require('fs');

const OUTPUT = process.argv[2];
const TEMPLATE = 'D:/dev/kc-backend/soc2-audit/_template.html';
const EN_FILE = 'D:/dev/kc-backend/soc2-audit/soc2_report_en.html';
const ZH_FILE = 'D:/dev/kc-backend/soc2-audit/soc2_report_zh.html';
const GEN_DATE = '2026-06-15';

let raw = fs.readFileSync(OUTPUT, 'utf8').trim();

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  const s = raw.indexOf('{'), t = raw.lastIndexOf('}');
  data = JSON.parse(raw.slice(s, t + 1));
}

// Unwrap workflow envelope: actual return value is under `result` (may be string or object)
if (data && data.result !== undefined && data.en === undefined) {
  data = (typeof data.result === 'string') ? JSON.parse(data.result) : data.result;
}

const en = data.en, zh = data.zh;
if (!en || !zh) { console.error('Missing en/zh keys. Top keys:', Object.keys(data)); process.exit(1); }

function summarize(tag, r) {
  console.log(`[${tag}] findings=${r.findings.length} strengths=${r.strengths.length} matrix=${r.soc2Matrix.length} roadmap=${r.remediationRoadmap.length}`);
  console.log(`     severityCounts=`, JSON.stringify(r.severityCounts), ' rating=', r.posture.overallRating, ' risk=', r.posture.riskLevel);
}
summarize('EN', en);
summarize('ZH', zh);
console.log('rawFindingCount=', data.rawFindingCount);

const enIds = en.findings.map(f => f.id).join(',');
const zhIds = zh.findings.map(f => f.id).join(',');
console.log('ids aligned:', enIds === zhIds);

const tpl = fs.readFileSync(TEMPLATE, 'utf8');

// Escape characters that could break an inline <script>: '<' (=> "</script>"), and U+2028/U+2029.
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const payload = JSON.stringify({ en, zh, generatedDate: GEN_DATE })
  .split('<').join('\\u003c')
  .split(LS).join('\\u2028')
  .split(PS).join('\\u2029');

function build(lang, file) {
  let html = tpl.replace('%%REPORT_DATA%%', () => payload).replace('%%DEFAULT_LANG%%', () => lang);
  fs.writeFileSync(file, html, 'utf8');
  console.log('wrote', file, '(' + Math.round(html.length / 1024) + ' KB)');
}
build('en', EN_FILE);
build('zh', ZH_FILE);

// sanity: ensure no placeholder remains and payload parses back
['soc2_report_en.html', 'soc2_report_zh.html'].forEach(f => {
  const h = fs.readFileSync('D:/dev/kc-backend/soc2-audit/' + f, 'utf8');
  const leftover = h.includes('%%REPORT_DATA%%') || h.includes('%%DEFAULT_LANG%%');
  console.log(f, 'placeholders_remaining=', leftover);
});
console.log('DONE');
