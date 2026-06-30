const fs = require('fs');

const ORIG_OUT = process.argv[2];   // original audit output (w1mfm2krg.output)
const COV_OUT  = process.argv[3];   // coverage workflow output
const TEMPLATE = 'D:/dev/kc-backend/soc2-audit/_template.html';
const EN_FILE  = 'D:/dev/kc-backend/soc2-audit/soc2_report_en.html';
const ZH_FILE  = 'D:/dev/kc-backend/soc2-audit/soc2_report_zh.html';
const GEN_DATE = '2026-06-15 · updated 2026-06-17';

function loadResult(path) {
  let raw = fs.readFileSync(path, 'utf8').trim();
  let d;
  try { d = JSON.parse(raw); } catch (e) { const s = raw.indexOf('{'), t = raw.lastIndexOf('}'); d = JSON.parse(raw.slice(s, t + 1)); }
  if (d && d.result !== undefined && d.en === undefined) {
    d = (typeof d.result === 'string') ? JSON.parse(d.result) : d.result;
  }
  return d;
}

const orig = loadResult(ORIG_OUT);
const cov  = loadResult(COV_OUT);

['en', 'zh'].forEach(lang => {
  const r = orig[lang];
  const c = cov[lang];
  const origCount = r.findings.length;
  // append new findings
  r.findings = r.findings.concat(c.newFindings || []);
  // recompute severity counts (severity enum is English in both languages)
  const sc = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  r.findings.forEach(f => { const k = String(f.severity).toLowerCase(); if (sc[k] != null) sc[k]++; });
  r.severityCounts = sc;
  // attach coverage — reconcile narrative's hard counts with the actual 49-row matrix
  let narr = c.narrative;
  if (lang === 'en') {
    narr = narr.replace(
      'of 40 assessed controls only 1 is fully Implemented while 17 are Partial, 9 are Missing, and 13 depend on organizational process evidence absent from the repos',
      'of 49 assessed controls none are fully Implemented, 18 are Partial, 18 are Missing, and 13 depend on organizational process evidence absent from the repos');
  } else {
    narr = narr.replace(
      '在 40 项受评控制中，仅有 1 项完全实施（Implemented），17 项为部分实施（Partial），9 项缺失（Missing），13 项依赖仓库中不存在的组织流程证据',
      '在 49 项受评控制中，没有任何一项完全实施（Implemented），18 项为部分实施（Partial），18 项缺失（Missing），13 项依赖仓库中不存在的组织流程证据');
  }
  r.coverageNarrative = narr;
  r.coverageMatrix = c.coverageMatrix;
  // recompute coverage summary from the actual matrix so cards match the table exactly
  const covSum = { implemented: 0, partial: 0, missing: 0, process: 0, total: c.coverageMatrix.length };
  c.coverageMatrix.forEach(row => { const k = String(row.status).toLowerCase(); if (covSum[k] != null) covSum[k]++; });
  r.coverageSummary = covSum;
  console.log(`[${lang}] findings ${origCount} -> ${r.findings.length} (new ${ (c.newFindings||[]).length })  counts=`, JSON.stringify(sc), ` coverageRows=${c.coverageMatrix.length}`);
});

// integrity: en/zh new finding ids align
const enNew = (cov.en.newFindings || []).map(f => f.id).join(',');
const zhNew = (cov.zh.newFindings || []).map(f => f.id).join(',');
console.log('new ids aligned:', enNew === zhNew, '|', enNew);
const enCov = cov.en.coverageMatrix.length, zhCov = cov.zh.coverageMatrix.length;
console.log('coverage rows en/zh:', enCov, zhCov, 'aligned:', enCov === zhCov);

const tpl = fs.readFileSync(TEMPLATE, 'utf8');
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const payload = JSON.stringify({ en: orig.en, zh: orig.zh, generatedDate: GEN_DATE })
  .split('<').join('\\u003c')
  .split(LS).join('\\u2028')
  .split(PS).join('\\u2029');

function build(lang, file) {
  let html = tpl.replace('%%REPORT_DATA%%', () => payload).replace('%%DEFAULT_LANG%%', () => lang);
  fs.writeFileSync(file, html, 'utf8');
  const h = fs.readFileSync(file, 'utf8');
  console.log('wrote', file, '(' + Math.round(html.length / 1024) + ' KB) placeholders_left=', h.includes('%%REPORT_DATA%%') || h.includes('%%DEFAULT_LANG%%'));
}
build('en', EN_FILE);
build('zh', ZH_FILE);
console.log('DONE');
