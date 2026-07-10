// SOC 2 report builder.
// Sources of truth (edit these, never hand-edit the generated HTML):
//   report_base.json — finding content, matrix, coverage, roadmap (the audit data)
//   estimates.js      — per-finding code estimate + DevOps/non-code task list
//   fix_status.json   — per-finding remediation status (Open | In Progress | Fixed) + date/commit/note
// Outputs (generated — do not edit by hand):
//   soc2_report_en.html, soc2_report_zh.html, soc2_task_estimates.md
// Run:  node build_report.js   (from the soc2-audit directory)

const fs = require('node:fs');
const path = require('node:path');
const { GROUPS, CONF, EST } = require('./estimates.js');

const DIR = __dirname;
const p = f => path.join(DIR, f);
const REPORT_DATA = JSON.parse(fs.readFileSync(p('report_base.json'), 'utf8'));
const STATUS = JSON.parse(fs.readFileSync(p('fix_status.json'), 'utf8'));
const tpl = fs.readFileSync(p('_template.html'), 'utf8');

// ---- validate coverage ----
const ids = REPORT_DATA.en.findings.map(f => f.id);
const missingEst = ids.filter(id => !EST[id]);
if (missingEst.length) throw new Error('No estimate for: ' + missingEst.join(','));
const missingStatus = ids.filter(id => !STATUS[id]);
if (missingStatus.length) console.warn('WARN: no fix_status entry (treated as Open) for: ' + missingStatus.join(','));

// ---- helpers ----
function rangeStr(d, lang) {
  const r = d[0] === d[1] ? String(d[0]) : String(d[0]) + '–' + String(d[1]);
  return lang === 'zh' ? r + ' 人天' : r + (d[0] === 1 && d[1] === 1 ? ' dev-day' : ' dev-days');
}
function rangePlain(d) { return d[0] === d[1] ? String(d[0]) : String(d[0]) + '–' + String(d[1]); }
const st = id => (STATUS[id] && STATUS[id].status) || 'Open';

// ---- merge estimate + status overlays into findings ----
['en', 'zh'].forEach(lang => {
  REPORT_DATA[lang].findings.forEach(f => {
    const e = EST[f.id], s = STATUS[f.id] || {};
    f.estimate = rangeStr(e.d, lang);
    f.estGroup = GROUPS[e.g][lang];
    f.estConf = CONF[e.conf][lang];
    f.estReason = e[lang];
    f.estOps = (lang === 'zh' ? e.opsZh : e.opsEn) || [];
    f.fixStatus = s.status || 'Open';
    f.fixDate = s.date || '';
    f.fixCommit = s.commit || '';
    f.fixNote = s.note || '';
  });
});

// ---- estimate summary (bilingual) ----
function agg(filterFn) {
  let lo = 0, hi = 0, n = 0;
  REPORT_DATA.en.findings.forEach(f => { if (!filterFn(f)) return; const d = EST[f.id].d; lo += d[0]; hi += d[1]; n++; });
  return { lo: Math.round(lo * 100) / 100, hi: Math.round(hi * 100) / 100, n };
}
function dr(a) { return a.lo === a.hi ? String(a.lo) : String(a.lo) + '–' + String(a.hi); }
const isCH = f => f.severity === 'Critical' || f.severity === 'High';
const isBEFE = f => f.component === 'Backend' || f.component === 'Frontend';
const isOpen = f => st(f.id) !== 'Fixed';

const A = {
  all: agg(() => true), be: agg(f => f.component === 'Backend'), fe: agg(f => f.component === 'Frontend'),
  ci: agg(f => f.component === 'CI-CD'), inf: agg(f => f.component === 'Infra'),
  crit: agg(f => f.severity === 'Critical'), high: agg(f => f.severity === 'High'),
  med: agg(f => f.severity === 'Medium'), low: agg(f => f.severity === 'Low'), info: agg(f => f.severity === 'Info'),
  befe: agg(isBEFE), ch: agg(isCH), chBefe: agg(f => isCH(f) && isBEFE(f)),
  remaining: agg(isOpen),
};
const fixedN = ids.filter(id => st(id) === 'Fixed').length;
const realisticLo = Math.round(A.all.lo * 0.85), realisticHi = Math.round(A.all.hi * 0.85);

const sevR = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
const effR = { High: 0, Medium: 1, Low: 2 };
const L10N = {
  en: {
    note: 'Engineer-days for the frontend/backend code change only (one developer familiar with the codebase). DevOps / AWS / credential-rotation / policy work is tracked separately in the DevOps backlog below and is NOT included. Summing rows double-counts shared work.',
    bigNote: 'Every finding estimated above 1 dev-day — the cross-cutting or front↔back / 3rd-party integration work. Click a task ID to jump to its full detail.',
    deferredNote: 'Findings that have been analysed and triaged but whose implementation was consciously deferred (decision recorded in the note). Still counted as Open — not fixed. Click a task ID for the full deferral rationale.',
    devNote: 'Tasks that are NOT developer code work but are needed to fully close a finding — credential rotation, git-history purges, AWS/infra config, policy decisions. A finding is only fully closed once both its code fix AND these are done.',
    cards: [
      { value: fixedN + ' / 90', label: 'Findings code-fixed' },
      { value: dr(A.remaining) + ' d', label: 'Remaining code effort (open)' },
      { value: dr(A.befe) + ' d', label: 'Backend + Frontend only (' + A.befe.n + ')' },
      { value: dr(A.chBefe) + ' d', label: 'Critical+High, BE/FE (' + A.chBefe.n + ')' },
    ],
    tComp: 'By component', tSev: 'By severity', tCut: 'Common cut views', head: ['', 'Findings', 'Code-days'],
    comp: [['Backend', A.be], ['Frontend', A.fe], ['CI-CD', A.ci], ['Infra', A.inf]],
    sev: [['Critical', A.crit], ['High', A.high], ['Medium', A.med], ['Low', A.low], ['Info', A.info]],
    cut: [['All findings', A.all], ['Backend + Frontend only', A.befe], ['Critical + High (all)', A.ch], ['Critical + High (BE/FE only)', A.chBefe]],
    totalLabel: 'Total (90)',
  },
  zh: {
    note: '仅为前端/后端代码改动的工程师人天（一名熟悉代码库的开发者）。DevOps / AWS / 凭据轮换 / 策略类工作在下方 DevOps 待办中单独跟踪，不计入此处。',
    bigNote: '所有估算超过 1 人天的问题——属跨切面或前后端/第三方集成类工作。点击任务编号可跳转到完整详情。',
    deferredNote: '已分析并完成分诊、但有意推迟实现的问题（推迟决定已记录于备注）。仍计为未处理（Open），非已修复。点击任务编号查看完整的推迟理由。',
    devNote: '这些不是开发代码工作，但是彻底关闭问题所需——凭据轮换、Git 历史清理、AWS/基础设施配置、策略决策。只有代码修复与这些都完成，问题才算彻底关闭。',
    cards: [
      { value: fixedN + ' / 90', label: '已修复（代码）' },
      { value: dr(A.remaining) + ' 人天', label: '剩余代码工时（未处理）' },
      { value: dr(A.befe) + ' 人天', label: '仅后端 + 前端（' + A.befe.n + '）' },
      { value: dr(A.chBefe) + ' 人天', label: '严重+高，后端/前端（' + A.chBefe.n + '）' },
    ],
    tComp: '按组件', tSev: '按严重程度', tCut: '常用切分视图', head: ['', '问题数', '人天'],
    comp: [['后端 Backend', A.be], ['前端 Frontend', A.fe], ['CI-CD', A.ci], ['基础设施 Infra', A.inf]],
    sev: [['严重 Critical', A.crit], ['高 High', A.high], ['中 Medium', A.med], ['低 Low', A.low], ['提示 Info', A.info]],
    cut: [['全部问题', A.all], ['仅后端 + 前端', A.befe], ['严重 + 高（全部）', A.ch], ['严重 + 高（仅后端/前端）', A.chBefe]],
    totalLabel: '合计（90）',
  },
};
['en', 'zh'].forEach(lang => {
  const t = L10N[lang];
  const bigTasks = REPORT_DATA[lang].findings
    .filter(f => EST[f.id].d[1] > 1)
    .sort((a, b) => {
      const s = sevR[a.severity] - sevR[b.severity]; if (s) return s;              // 1) severity
      const c = (effR[a.effort] ?? 9) - (effR[b.effort] ?? 9); if (c) return c;     // 2) complexity (effort)
      const da = EST[a.id].d, db = EST[b.id].d;                                     // 3) estimation (larger first)
      return (db[0] + db[1]) - (da[0] + da[1]);
    })
    .map(f => { const e = EST[f.id]; return { id: f.id, severity: f.severity, component: f.component, est: rangeStr(e.d, lang), conf: CONF[e.conf][lang], group: GROUPS[e.g][lang], title: f.title, reason: e[lang], complexity: f.effort, status: f.fixStatus }; });
  // "Visited but deferred" = triaged, still Open, whose fix note is flagged DEFERRED.
  const deferred = REPORT_DATA[lang].findings
    .filter(f => f.fixStatus === 'Open' && /^\s*DEFERRED/i.test(f.fixNote || ''))
    .sort((a, b) => {
      const s = sevR[a.severity] - sevR[b.severity]; if (s) return s;              // 1) severity
      const c = (effR[a.effort] ?? 9) - (effR[b.effort] ?? 9); if (c) return c;     // 2) complexity (effort)
      const da = EST[a.id].d, db = EST[b.id].d;                                     // 3) estimation (larger first)
      return (db[0] + db[1]) - (da[0] + da[1]);
    })
    .map(f => { const e = EST[f.id];
      const raw = (f.fixNote || '').replace(/^\s*DEFERRED\s*(\([^)]*\))?\s*[—\-:]*\s*/i, '').trim();  // drop the leading "DEFERRED (…) —" marker
      const reason = raw.length > 240 ? raw.slice(0, 240).replace(/\s+\S*$/, '') + '…' : raw;
      return { id: f.id, severity: f.severity, component: f.component, est: rangeStr(e.d, lang), group: GROUPS[e.g][lang], title: f.title, date: f.fixDate || '', reason }; });
  REPORT_DATA[lang].estSummary = {
    bigTasks, bigTasksNote: t.bigNote, deferred, deferredNote: t.deferredNote, devopsNote: t.devNote, note: t.note, cards: t.cards,
    tables: [
      { title: t.tComp, head: t.head, rows: t.comp.map(r => ({ cells: [r[0], String(r[1].n), dr(r[1])] })).concat([{ total: true, cells: [t.totalLabel, String(A.all.n), dr(A.all)] }]) },
      { title: t.tSev, head: t.head, rows: t.sev.map(r => ({ cells: [r[0], String(r[1].n), dr(r[1])] })).concat([{ total: true, cells: [t.totalLabel, String(A.all.n), dr(A.all)] }]) },
      { title: t.tCut, head: t.head, rows: t.cut.map(r => ({ cells: [r[0], String(r[1].n), dr(r[1])] })) },
    ],
  };
});

// ---- write en & zh HTML ----
const GEN_DATE = String(REPORT_DATA.generatedDate || '').replace(/ · est\..*$/, '') + ' · est. & status tracked';
const LS = String.fromCodePoint(0x2028), PS = String.fromCodePoint(0x2029);
const payload = JSON.stringify({ en: REPORT_DATA.en, zh: REPORT_DATA.zh, generatedDate: GEN_DATE })
  .split('<').join('\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
['en', 'zh'].forEach(lang => {
  const html = tpl.replace('%%REPORT_DATA%%', () => payload).replace('%%DEFAULT_LANG%%', () => lang);
  fs.writeFileSync(p('soc2_report_' + lang + '.html'), html, 'utf8');
  console.log('wrote soc2_report_' + lang + '.html (' + Math.round(html.length / 1024) + ' KB)');
});

// ---- regenerate the markdown ----
const findings = REPORT_DATA.en.findings.slice().sort((a, b) => (sevR[a.severity] - sevR[b.severity]) || ((a.priority || 999) - (b.priority || 999)));
const discuss = findings.filter(f => EST[f.id].conf === 'Discuss');
const opsFindings = findings.filter(f => (EST[f.id].opsEn || []).length);
const opsCount = opsFindings.reduce((n, f) => n + (EST[f.id].opsEn || []).length, 0);
const big = findings.filter(f => EST[f.id].d[1] > 1);
const esc = s => String(s).replace(/\|/g, '\\|');

let md = '';
md += '# SOC 2 Remediation — Code-Change Effort Estimates & Status\n\n';
md += '**Scope:** Knowledge Cloud backend (Java/Spring) + frontend (Angular) + in-repo config/IaC  \n';
md += '**Basis:** a single developer familiar with the codebase  \n';
md += `**Code-fixed:** ${fixedN} / 90  ·  **Remaining code effort:** ${dr(A.remaining)} dev-days  \n\n`;
md += '> Generated by `build_report.js` from `report_base.json` + `estimates.js` + `fix_status.json`. Do not hand-edit; change those sources and rebuild.\n\n';
md += '## Headline (code only)\n\n| Metric | Value |\n|---|---|\n';
md += `| Total code effort (all 90) | **${dr(A.all)} dev-days** |\n`;
md += `| Code-fixed so far | ${fixedN} / 90 |\n`;
md += `| Remaining (open) code effort | **${dr(A.remaining)} dev-days** |\n`;
md += `| Backend + Frontend only (${A.befe.n}) | ${dr(A.befe)} dev-days |\n`;
md += `| Critical + High, BE/FE only (${A.chBefe.n}) | ${dr(A.chBefe)} dev-days |\n`;
md += `| > 1 day (cross-cutting) | ${big.length} — ${big.map(f => f.id).join(', ')} |\n`;
md += `| "Discuss" (decide scope first) | ${discuss.length} — ${discuss.map(f => f.id).join(', ')} |\n`;
md += `| Separate non-code tasks | ${opsCount} (across ${opsFindings.length} findings) |\n\n`;

md += '## All 90 tasks\n\n| ID | Status | Sev | Comp | Group | Code est. | Conf | Ops | Title |\n|---|---|---|---|---|---|---|---|---|\n';
findings.forEach(f => { const e = EST[f.id]; md += `| ${f.id} | ${st(f.id)} | ${f.severity} | ${f.component} | G${e.g.slice(1)} | ${rangePlain(e.d)} | ${CONF[e.conf].en} | ${(e.opsEn || []).length || ''} | ${esc(f.title)} |\n`; });
md += '\n';

md += '## Per-task detail\n\n';
findings.forEach(f => {
  const e = EST[f.id], s = STATUS[f.id] || {};
  md += `### ${f.id} — ${f.title}\n\n`;
  md += `- **${f.severity} / ${f.component}** · SOC 2 ${f.soc2Criteria} · Group G${e.g.slice(1)} ${GROUPS[e.g].en}\n`;
  md += `- **Status:** ${st(f.id)}${s.date ? ' (' + s.date + (s.commit ? ', ' + s.commit : '') + ')' : ''}${s.note ? ' — ' + s.note : ''}\n`;
  md += `- **Code estimate:** ${rangePlain(e.d)} dev-days · **Confidence:** ${CONF[e.conf].en}\n`;
  md += `- **Code work:** ${e.en}\n`;
  if ((e.opsEn || []).length) { md += `- **Non-code tasks (handled separately):**\n`; e.opsEn.forEach(o => md += `    - ${o}\n`); }
  md += '\n';
});

md += '## DevOps / non-code backlog\n\n';
md += `${opsCount} tasks that are not developer code work — route to DevOps / platform / security-governance owners.\n\n`;
md += '| Finding | Code status | Non-code task |\n|---|---|---|\n';
findings.forEach(f => (EST[f.id].opsEn || []).forEach(o => md += `| ${f.id} | ${st(f.id)} | ${esc(o)} |\n`));
md += '\n';

fs.writeFileSync(p('soc2_task_estimates.md'), md, 'utf8');
console.log('wrote soc2_task_estimates.md (' + Math.round(md.length / 1024) + ' KB)');
console.log(`DONE — fixed ${fixedN}/90, remaining code ${dr(A.remaining)} d, ops tasks ${opsCount}`);
