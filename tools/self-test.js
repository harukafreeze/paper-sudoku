/*
 * core 自检
 * 跑法：node tools/self-test.js
 *
 * 检查四件事：
 *   1. 求解器对不对
 *   2. 技巧推理是否每一步都与唯一解一致（最关键的健全性）
 *   3. 六档难度是否都出得来、是否唯一解、耗时
 *   4. 十一课的示例能否生成
 */
require('../js/core.js');
require('../js/tutorial.js');
const C = globalThis.SD.core;
const T = globalThis.SD.tutorial;

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* ---------- 1. 求解器 ---------- */
console.log('\n[1] 求解器');
const classic = C.parse('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
ok(C.countSolutions(classic, 2) === 1, '经典题恰好一个解');
ok(C.format(C.solveOne(classic)) === '534678912672195348198342567859761423426853791713924856961537284287419635345286179', '解与标准答案一致');
const dup = C.parse('550070000600195000098000060800060003400803001700020006060000280000419005000080079');
ok(C.countSolutions(dup, 2) === 0, '重复数字返回 0 解');
ok(C.isConsistent(dup) === false, '冲突盘面能被识别');

/* ---------- 2. 推理健全性 ---------- */
console.log('\n[2] 推理健全性（每一步都必须与唯一解一致）');

function audit(p) {
  const truth = C.solveOne(p);
  if (!truth) return { fatal: '题目无解' };
  const an = C.analyze(p);
  const errs = [];
  for (const st of an.steps) {
    for (const [i, v] of st.place) {
      if (truth[i] !== v) errs.push(st.name + ' 在 ' + C.cellName(i) + ' 填了 ' + v + '，正确是 ' + truth[i]);
    }
    for (const [i, m] of st.elim) {
      if (m & C.BIT[truth[i]]) errs.push(st.name + ' 删掉了 ' + C.cellName(i) + ' 的正确候选 ' + truth[i]);
    }
  }
  if (an.solved && C.format(an.solution) !== C.format(truth)) errs.push('最终解不正确');
  return { an, errs };
}

const hard = [
  ['Arto Inkala 2010', '800000000003600000070090200050007000000045700000100030001000068008500010090000400'],
  ['AI Escargot', '100007090030020008009600500005300900010080002600004000300000010040000007007000300'],
  ['Platinum Blonde', '000000012000000003002300400001800005060070800000009000008500000900040500470006000'],
  ['Golden Nugget', '000000039000001005003050800008090006070002000100400000009080050020000600400700000']
];
for (const [name, s] of hard) {
  const r = audit(C.parse(s));
  ok(r.errs.length === 0, '名题「' + name + '」推理无冲突（' + (r.an.solved ? '逻辑解出' : '卡在第 ' + r.an.level + ' 档') + '）', r.errs.slice(0, 2));
}

let audited = 0, broken = 0;
for (const d of C.DIFFS) {
  for (let k = 0; k < 12; k++) {
    const g = C.generate(d.id, { seed: 90000 + d.id * 1000 + k * 37 });
    if (!g) { broken++; continue; }
    audited++;
    const r = audit(g.puzzle);
    if (r.errs.length) {
      broken++;
      if (broken <= 3) console.log('    ! ' + d.name + ': ' + r.errs[0]);
    }
  }
}
ok(broken === 0, audited + ' 道随机题的推理全部与唯一解一致', { broken });

/* ---------- 3. 出题 ---------- */
console.log('\n[3] 出题（每档 10 局）');
for (const d of C.DIFFS) {
  let hit = 0, dup = 0, ms = 0, givens = 0, maxMs = 0;
  const dist = {};
  for (let k = 0; k < 10; k++) {
    const g = C.generate(d.id);
    if (!g) continue;
    if (g.level === d.id) hit++;
    if (C.countSolutions(g.puzzle, 2) !== 1) dup++;
    dist[g.level] = (dist[g.level] || 0) + 1;
    ms += g.ms;
    maxMs = Math.max(maxMs, g.ms);
    givens += g.givens;
  }
  ok(hit === 10 && dup === 0,
    d.name.padEnd(2) + ' 命中 ' + hit + '/10，唯一解 ' + (10 - dup) + '/10，均 ' + Math.round(ms / 10) + 'ms（最慢 ' + maxMs + 'ms），均 ' + Math.round(givens / 10) + ' 个提示数',
    dist);
}

/* ---------- 4. 课程示例 ---------- */
console.log('\n[4] 课程示例');
let lessonOK = 0;
for (const l of T.LESSONS) {
  if (!l.tech) { console.log('  · 第' + l.id + '课 ' + l.name + '（收尾课，无棋盘）'); continue; }
  const t0 = Date.now();
  const ex = T.build(l, 0);
  const ms = Date.now() - t0;
  const good = !!ex && ex.accept.length > 0 && ex.before.length === 81;
  if (good) lessonOK++;
  ok(good, '第' + String(l.id).padStart(2, '0') + '课 ' + l.name + ' 示例生成（' + ms + 'ms）');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
