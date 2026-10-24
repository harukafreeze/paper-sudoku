/*!
 * core.js — 数独内核
 * 规则 / 求解 / 人类技巧 / 难度评级 / 出题
 * 不依赖任何框架，可在浏览器与 Node 中运行。
 */
(function (root) {
  'use strict';
  const SD = (root.SD = root.SD || {});

  /* ============================================================
   * 一、基础常量
   * ============================================================ */

  const BIT = new Uint16Array(10);
  for (let v = 1; v <= 9; v++) BIT[v] = 1 << (v - 1);
  const FULL = 0x1ff;

  const POP = new Uint8Array(512);
  for (let m = 0; m < 512; m++) {
    let c = 0, x = m;
    while (x) { x &= x - 1; c++; }
    POP[m] = c;
  }

  const VAL = new Uint8Array(512);
  for (let v = 1; v <= 9; v++) VAL[BIT[v]] = v;

  const ROW_OF = new Uint8Array(81);
  const COL_OF = new Uint8Array(81);
  const BOX_OF = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    ROW_OF[i] = (i / 9) | 0;
    COL_OF[i] = i % 9;
    BOX_OF[i] = (((i / 27) | 0) * 3) + (((i % 9) / 3) | 0);
  }

  const ROW_CELLS = [], COL_CELLS = [], BOX_CELLS = [];
  for (let r = 0; r < 9; r++) {
    const a = [];
    for (let c = 0; c < 9; c++) a.push(r * 9 + c);
    ROW_CELLS.push(a);
  }
  for (let c = 0; c < 9; c++) {
    const a = [];
    for (let r = 0; r < 9; r++) a.push(r * 9 + c);
    COL_CELLS.push(a);
  }
  for (let b = 0; b < 9; b++) {
    const a = [];
    const rs = ((b / 3) | 0) * 3, cs = (b % 3) * 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a.push((rs + r) * 9 + cs + c);
    BOX_CELLS.push(a);
  }
  const UNITS = ROW_CELLS.concat(COL_CELLS, BOX_CELLS);

  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    ROW_CELLS[ROW_OF[i]].forEach(function (x) { s.add(x); });
    COL_CELLS[COL_OF[i]].forEach(function (x) { s.add(x); });
    BOX_CELLS[BOX_OF[i]].forEach(function (x) { s.add(x); });
    s.delete(i);
    PEERS.push(Array.from(s));
  }

  /* ============================================================
   * 二、小工具
   * ============================================================ */

  function bits(mask) {
    const out = [];
    for (let v = 1; v <= 9; v++) if (mask & BIT[v]) out.push(v);
    return out;
  }

  function cellName(i) {
    return '第' + (ROW_OF[i] + 1) + '行第' + (COL_OF[i] + 1) + '列';
  }

  function unitName(u) {
    if (u < 9) return '第' + (u + 1) + '行';
    if (u < 18) return '第' + (u - 8) + '列';
    return '第' + (u - 17) + '宫';
  }

  function sees(a, b) {
    return ROW_OF[a] === ROW_OF[b] || COL_OF[a] === COL_OF[b] || BOX_OF[a] === BOX_OF[b];
  }

  function parse(str) {
    const s = String(str).replace(/[^0-9]/g, '');
    if (s.length !== 81) throw new Error('盘面必须是 81 位数字');
    const g = new Uint8Array(81);
    for (let i = 0; i < 81; i++) g[i] = s.charCodeAt(i) - 48;
    return g;
  }

  function format(g) {
    let s = '';
    for (let i = 0; i < 81; i++) s += (g[i] || 0);
    return s;
  }

  function clone(g) { return Uint8Array.from(g); }

  function isConsistent(g) {
    for (let u = 0; u < 27; u++) {
      let m = 0;
      const cells = UNITS[u];
      for (let k = 0; k < 9; k++) {
        const v = g[cells[k]];
        if (!v) continue;
        if (m & BIT[v]) return false;
        m |= BIT[v];
      }
    }
    return true;
  }

  function countEmpty(g) {
    let n = 0;
    for (let i = 0; i < 81; i++) if (!g[i]) n++;
    return n;
  }

  function candidates(g) {
    const c = new Uint16Array(81);
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let used = 0;
      const ps = PEERS[i];
      for (let k = 0; k < ps.length; k++) {
        const v = g[ps[k]];
        if (v) used |= BIT[v];
      }
      c[i] = FULL & ~used;
    }
    return c;
  }

  /* ============================================================
   * 三、求解器（回溯 + 最少候选优先）
   * ============================================================ */

  /**
   * 统计解的个数，最多数到 limit 个。
   * limit=2 时用来做唯一解校验（数到 2 立即停）。
   */
  function countSolutions(g0, limit) {
    limit = limit || 2;
    const g = Uint8Array.from(g0);
    if (!isConsistent(g)) return 0;

    const rows = new Uint16Array(9);
    const cols = new Uint16Array(9);
    const boxes = new Uint16Array(9);
    let empty = 0;

    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (v) {
        const b = BIT[v];
        rows[ROW_OF[i]] |= b;
        cols[COL_OF[i]] |= b;
        boxes[BOX_OF[i]] |= b;
      } else empty++;
    }

    let count = 0;

    function rec(n) {
      if (n === 0) { count++; return count >= limit; }

      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = FULL & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
        if (m === 0) return false;
        const pc = POP[m];
        if (pc < bestN) {
          bestN = pc; best = i; bestMask = m;
          if (pc === 1) break;
        }
      }
      if (best < 0) return false;

      const r = ROW_OF[best], c = COL_OF[best], bx = BOX_OF[best];
      let m = bestMask;
      while (m) {
        const bit = m & -m;
        m ^= bit;
        g[best] = VAL[bit];
        rows[r] |= bit; cols[c] |= bit; boxes[bx] |= bit;

        if (rec(n - 1)) return true;

        g[best] = 0;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[bx] &= ~bit;
      }
      return false;
    }

    rec(empty);
    return count;
  }

  /** 求一个解，解不出返回 null */
  function solveOne(g0) {
    const g = Uint8Array.from(g0);
    if (!isConsistent(g)) return null;

    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    let empty = 0;
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (v) {
        const b = BIT[v];
        rows[ROW_OF[i]] |= b; cols[COL_OF[i]] |= b; boxes[BOX_OF[i]] |= b;
      } else empty++;
    }

    function rec(n) {
      if (n === 0) return true;
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = FULL & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
        if (m === 0) return false;
        const pc = POP[m];
        if (pc < bestN) { bestN = pc; best = i; bestMask = m; if (pc === 1) break; }
      }
      if (best < 0) return false;
      const r = ROW_OF[best], c = COL_OF[best], bx = BOX_OF[best];
      let m = bestMask;
      while (m) {
        const bit = m & -m;
        m ^= bit;
        g[best] = VAL[bit];
        rows[r] |= bit; cols[c] |= bit; boxes[bx] |= bit;
        if (rec(n - 1)) return true;
        g[best] = 0;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[bx] &= ~bit;
      }
      return false;
    }

    return rec(empty) ? g : null;
  }

  /* ============================================================
   * 四、人类技巧
   * 每个函数返回 null（用不上）或一个 step 对象：
   * { name, level, label, focus[], unit, place[[i,v]], elim[[i,mask]], text }
   * ============================================================ */

  function mk(name, level, label, o) {
    const step = {
      name: name,
      level: level,
      label: label,
      focus: o.focus || [],
      unit: o.unit == null ? null : o.unit,
      place: o.place || [],
      elim: o.elim || [],
      text: o.text || ''
    };
    step.targets = step.elim.map(function (e) { return e[0]; });
    return step;
  }

  /** 1. 唯一候选：某格只剩一个数 */
  function tNakedSingle(g, cand) {
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = cand[i];
      if (!m) continue;
      if (POP[m] === 1) {
        const v = VAL[m];
        return mk('nakedSingle', 1, '唯一候选', {
          focus: [i],
          place: [[i, v]],
          text: cellName(i) + ' 的同行、同列、同宫已经凑齐了另外 8 个数，只剩 ' + v + '。'
        });
      }
    }
    return null;
  }

  /** 2. 隐性唯一：某数字在一个单元里只剩一个位置 */
  function tHiddenSingle(g, cand) {
    for (let u = 0; u < 27; u++) {
      const cells = UNITS[u];
      for (let v = 1; v <= 9; v++) {
        const bit = BIT[v];
        let found = -1, cnt = 0, present = false;
        for (let k = 0; k < 9; k++) {
          const i = cells[k];
          if (g[i] === v) { present = true; break; }
          if (!g[i] && (cand[i] & bit)) { cnt++; found = i; if (cnt > 1) break; }
        }
        if (present || cnt !== 1) continue;
        return mk('hiddenSingle', 1, '隐性唯一', {
          focus: [found],
          unit: u,
          place: [[found, v]],
          text: unitName(u) + '里，' + v + ' 只能落在' + cellName(found) + '——别的位置都被这一行/列/宫里的其它 ' + v + ' 挡死了。'
        });
      }
    }
    return null;
  }

  /** 3. 区块排除（宫→行/列 的「宫排除」与 行/列→宫 的「行列排除」） */
  function tLocked(g, cand) {
    // (a) 宫内某数的候选全在一行/一列 → 该行/列其余位置排除
    for (let b = 0; b < 9; b++) {
      for (let v = 1; v <= 9; v++) {
        const bit = BIT[v];
        const cells = [];
        let present = false;
        for (let k = 0; k < 9; k++) {
          const i = BOX_CELLS[b][k];
          if (g[i] === v) { present = true; break; }
          if (!g[i] && (cand[i] & bit)) cells.push(i);
        }
        if (present || cells.length < 2 || cells.length > 3) continue;

        const rows = new Set(cells.map(function (i) { return ROW_OF[i]; }));
        const cols = new Set(cells.map(function (i) { return COL_OF[i]; }));

        if (rows.size === 1) {
          const r = rows.values().next().value;
          const elim = [];
          for (let c = 0; c < 9; c++) {
            const i = r * 9 + c;
            if (BOX_OF[i] === b) continue;
            if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
          }
          if (elim.length) {
            return mk('lockedCandidates', 2, '区块排除', {
              focus: cells, unit: b, elim: elim,
              text: '第' + (b + 1) + '宫里，' + v + ' 只能出现在第' + (r + 1) + '行。那这一行其它宫的位置，就都不可能是 ' + v + ' 了。'
            });
          }
        }
        if (cols.size === 1) {
          const c = cols.values().next().value;
          const elim = [];
          for (let r = 0; r < 9; r++) {
            const i = r * 9 + c;
            if (BOX_OF[i] === b) continue;
            if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
          }
          if (elim.length) {
            return mk('lockedCandidates', 2, '区块排除', {
              focus: cells, unit: b, elim: elim,
              text: '第' + (b + 1) + '宫里，' + v + ' 只能出现在第' + (c + 1) + '列。那这一列其它宫的位置，就都不可能是 ' + v + ' 了。'
            });
          }
        }
      }
    }

    // (b) 行/列内某数的候选全在一宫 → 该宫其余位置排除
    for (let u = 0; u < 18; u++) {
      const isRow = u < 9;
      const cellsUnit = isRow ? ROW_CELLS[u] : COL_CELLS[u - 9];
      for (let v = 1; v <= 9; v++) {
        const bit = BIT[v];
        const cells = [];
        let present = false;
        for (let k = 0; k < 9; k++) {
          const i = cellsUnit[k];
          if (g[i] === v) { present = true; break; }
          if (!g[i] && (cand[i] & bit)) cells.push(i);
        }
        if (present || cells.length < 2 || cells.length > 3) continue;

        const boxes = new Set(cells.map(function (i) { return BOX_OF[i]; }));
        if (boxes.size !== 1) continue;
        const b = boxes.values().next().value;
        const elim = [];
        for (let k = 0; k < 9; k++) {
          const i = BOX_CELLS[b][k];
          if (isRow ? ROW_OF[i] === u : COL_OF[i] === u - 9) continue;
          if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
        }
        if (elim.length) {
          return mk('lockedCandidates', 2, '区块排除', {
            focus: cells, unit: b, elim: elim,
            text: unitName(u) + '里，' + v + ' 只能待在第' + (b + 1) + '宫。那这一宫里、这条' + (isRow ? '行' : '列') + '之外的位置，就排除 ' + v + '。'
          });
        }
      }
    }
    return null;
  }

  /** 组合枚举 */
  function combos(arr, k) {
    const out = [];
    const n = arr.length;
    if (k > n) return out;
    const idx = [];
    (function go(start, depth) {
      if (depth === k) { out.push(idx.map(function (x) { return arr[x]; })); return; }
      for (let i = start; i < n; i++) {
        idx[depth] = i;
        go(i + 1, depth + 1);
      }
    })(0, 0);
    return out;
  }

  /** 4/5. 显性数组：n 个格子的候选正好是 n 个数 */
  function tNakedSubset(g, cand, size) {
    for (let u = 0; u < 27; u++) {
      const cells = [];
      for (let k = 0; k < 9; k++) {
        const i = UNITS[u][k];
        if (g[i]) continue;
        const pc = POP[cand[i]];
        if (pc >= 2 && pc <= size) cells.push(i);
      }
      if (cells.length < size) continue;

      const group = combos(cells, size);
      for (let gi = 0; gi < group.length; gi++) {
        const combo = group[gi];
        let union = 0;
        for (let k = 0; k < combo.length; k++) union |= cand[combo[k]];
        if (POP[union] !== size) continue;

        const elim = [];
        const inCombo = new Set(combo);
        for (let k = 0; k < 9; k++) {
          const i = UNITS[u][k];
          if (g[i] || inCombo.has(i)) continue;
          const m = cand[i] & union;
          if (m) elim.push([i, m]);
        }
        if (!elim.length) continue;

        const name = size === 2 ? 'nakedPair' : 'nakedTriple';
        const label = size === 2 ? '显性数对' : '显性三数组';
        const vs = bits(union).join('、');
        return mk(name, 3, label, {
          focus: combo, unit: u, elim: elim,
          text: unitName(u) + '里，' + combo.map(cellName).join(' 和 ') + ' 的候选数加起来正好是 ' + vs +
            '，所以这两个数被它们' + (size === 2 ? '俩' : '仨') + '包了，同一单元其它格子就不能再有 ' + vs + '。'
        });
      }
    }
    return null;
  }

  /** 6. 隐性数组：n 个数只出现在 n 个格子里 */
  function tHiddenSubset(g, cand, size) {
    for (let u = 0; u < 27; u++) {
      const unit = UNITS[u];
      const posOf = {};
      const vals = [];
      for (let v = 1; v <= 9; v++) {
        const bit = BIT[v];
        const pos = [];
        let present = false;
        for (let k = 0; k < 9; k++) {
          const i = unit[k];
          if (g[i] === v) { present = true; break; }
          if (!g[i] && (cand[i] & bit)) pos.push(i);
        }
        if (present) continue;
        if (pos.length >= 2 && pos.length <= size) { posOf[v] = pos; vals.push(v); }
      }
      if (vals.length < size) continue;

      const group = combos(vals, size);
      for (let gi = 0; gi < group.length; gi++) {
        const combo = group[gi];
        const cellSet = new Set();
        for (let k = 0; k < combo.length; k++) posOf[combo[k]].forEach(function (i) { cellSet.add(i); });
        if (cellSet.size !== size) continue;

        let comboMask = 0;
        for (let k = 0; k < combo.length; k++) comboMask |= BIT[combo[k]];
        const cells = Array.from(cellSet);
        const elim = [];
        for (let k = 0; k < cells.length; k++) {
          const m = cand[cells[k]] & ~comboMask;
          if (m) elim.push([cells[k], m]);
        }
        if (!elim.length) continue;

        const name = size === 2 ? 'hiddenPair' : 'hiddenTriple';
        const label = size === 2 ? '隐性数对' : '隐性三数组';
        return mk(name, 3, label, {
          focus: cells, unit: u, elim: elim,
          text: combo.join('、') + ' 这几个数在' + unitName(u) + '里只可能出现在 ' + cells.map(cellName).join('、') +
            ' 这几格，所以这几格只能装它们，其余候选数全部删掉。'
        });
      }
    }
    return null;
  }

  /** 7. X-Wing：两行（列）里某数都只有两个位置，且列（行）对齐 */
  function tXWing(g, cand) {
    for (let v = 1; v <= 9; v++) {
      const bit = BIT[v];

      // 行 → 列
      const rowsPos = [];
      for (let r = 0; r < 9; r++) {
        const pos = [];
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          if (!g[i] && (cand[i] & bit)) pos.push(c);
        }
        if (pos.length === 2) rowsPos.push([r, pos[0], pos[1]]);
      }
      for (let a = 0; a < rowsPos.length; a++) {
        for (let b = a + 1; b < rowsPos.length; b++) {
          if (rowsPos[a][1] !== rowsPos[b][1] || rowsPos[a][2] !== rowsPos[b][2]) continue;
          const r1 = rowsPos[a][0], r2 = rowsPos[b][0];
          const c1 = rowsPos[a][1], c2 = rowsPos[a][2];
          const elim = [];
          for (let r = 0; r < 9; r++) {
            if (r === r1 || r === r2) continue;
            [c1, c2].forEach(function (c) {
              const i = r * 9 + c;
              if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
            });
          }
          if (!elim.length) continue;
          return mk('xWing', 4, 'X-Wing', {
            focus: [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2],
            elim: elim,
            text: '第' + (r1 + 1) + '行和第' + (r2 + 1) + '行里，' + v + ' 都只剩第' + (c1 + 1) + '、' + (c2 + 1) + '列两个位置。' +
              '也就是说 ' + v + ' 一定落在这四个角的其中两个上——那么这两列其余位置就都不可能是 ' + v + '。'
          });
        }
      }

      // 列 → 行
      const colsPos = [];
      for (let c = 0; c < 9; c++) {
        const pos = [];
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c;
          if (!g[i] && (cand[i] & bit)) pos.push(r);
        }
        if (pos.length === 2) colsPos.push([c, pos[0], pos[1]]);
      }
      for (let a = 0; a < colsPos.length; a++) {
        for (let b = a + 1; b < colsPos.length; b++) {
          if (colsPos[a][1] !== colsPos[b][1] || colsPos[a][2] !== colsPos[b][2]) continue;
          const c1 = colsPos[a][0], c2 = colsPos[b][0];
          const r1 = colsPos[a][1], r2 = colsPos[a][2];
          const elim = [];
          for (let c = 0; c < 9; c++) {
            if (c === c1 || c === c2) continue;
            [r1, r2].forEach(function (r) {
              const i = r * 9 + c;
              if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
            });
          }
          if (!elim.length) continue;
          return mk('xWing', 4, 'X-Wing', {
            focus: [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2],
            elim: elim,
            text: '第' + (c1 + 1) + '列和第' + (c2 + 1) + '列里，' + v + ' 都只剩第' + (r1 + 1) + '、' + (r2 + 1) + '行两个位置。' +
              '这四个角锁住了 ' + v + '，这两行其余位置就排除 ' + v + '。'
          });
        }
      }
    }
    return null;
  }

  /** 8. 剑鱼 Swordfish：三行（列）里某数只在三列（行）里出现 */
  function tSwordfish(g, cand) {
    function scan(getUnitPositions, unitCount, crossKey) {
      for (let v = 1; v <= 9; v++) {
        const bit = BIT[v];
        const lines = [];
        for (let u = 0; u < unitCount; u++) {
          const pos = getUnitPositions(u, bit);
          if (pos.length >= 2 && pos.length <= 3) lines.push([u, pos]);
        }
        if (lines.length < 3) continue;
        const group = combos(lines, 3);
        for (let gi = 0; gi < group.length; gi++) {
          const trio = group[gi];
          const cross = new Set();
          for (let k = 0; k < 3; k++) {
            trio[k][1].forEach(function (x) { cross.add(x); });
          }
          if (cross.size !== 3) continue;
          const usedLines = trio.map(function (t) { return t[0]; });
          const elim = [];
          const crossArr = Array.from(cross);
          for (let u = 0; u < unitCount; u++) {
            if (usedLines.indexOf(u) >= 0) continue;
            for (let k = 0; k < crossArr.length; k++) {
              const i = crossKey(u, crossArr[k]);
              if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
            }
          }
          if (!elim.length) continue;
          // 至少要有一行是 3 个位置，否则退化成 X-Wing
          const focus = [];
          trio.forEach(function (t) { t[1].forEach(function (x) { focus.push(crossKey(t[0], x)); }); });
          return { v: v, focus: focus, elim: elim, lines: usedLines, cross: crossArr };
        }
      }
      return null;
    }

    // 行 → 列
    let res = scan(function (r, bit) {
      const pos = [];
      for (let c = 0; c < 9; c++) { const i = r * 9 + c; if (!g[i] && (cand[i] & bit)) pos.push(c); }
      return pos;
    }, 9, function (r, c) { return r * 9 + c; }, true);

    if (res) {
      return mk('swordfish', 4, '剑鱼', {
        focus: res.focus, elim: res.elim,
        text: res.v + ' 在第' + res.lines.map(function (r) { return r + 1; }).join('、') + '行里，只出现在第' +
          res.cross.map(function (c) { return c + 1; }).join('、') + '列。三行锁三列，这三列其余位置就排除 ' + res.v + '。'
      });
    }

    // 列 → 行
    res = scan(function (c, bit) {
      const pos = [];
      for (let r = 0; r < 9; r++) { const i = r * 9 + c; if (!g[i] && (cand[i] & bit)) pos.push(r); }
      return pos;
    }, 9, function (c, r) { return r * 9 + c; }, false);

    if (res) {
      return mk('swordfish', 4, '剑鱼', {
        focus: res.focus, elim: res.elim,
        text: res.v + ' 在第' + res.lines.map(function (c) { return c + 1; }).join('、') + '列里，只出现在第' +
          res.cross.map(function (r) { return r + 1; }).join('、') + '行。三列锁三行，这三行其余位置就排除 ' + res.v + '。'
      });
    }
    return null;
  }

  /** 9. XY-Wing：AB 中心格，两个 AC / BC 翅膀，共同排除 C */
  function tXYWing(g, cand) {
    for (let p = 0; p < 81; p++) {
      if (g[p] || POP[cand[p]] !== 2) continue;
      const ab = bits(cand[p]);
      const a = ab[0], b = ab[1];

      const wings = [];
      const ps = PEERS[p];
      for (let k = 0; k < ps.length; k++) {
        const w = ps[k];
        if (g[w] || POP[cand[w]] !== 2) continue;
        const wb = bits(cand[w]);
        if (wb[0] === b && wb[1] !== a) wings.push({ cell: w, shared: b, other: wb[1] });
        else if (wb[1] === b && wb[0] !== a) wings.push({ cell: w, shared: b, other: wb[0] });
        else if (wb[0] === a && wb[1] !== b) wings.push({ cell: w, shared: a, other: wb[1] });
        else if (wb[1] === a && wb[0] !== b) wings.push({ cell: w, shared: a, other: wb[0] });
      }

      for (let x = 0; x < wings.length; x++) {
        for (let y = 0; y < wings.length; y++) {
          if (x === y) continue;
          const w1 = wings[x], w2 = wings[y];
          if (w1.shared === w2.shared) continue;
          if (w1.other !== w2.other) continue;
          const c = w1.other;
          if (c === a || c === b) continue;
          const bit = BIT[c];

          const elim = [];
          for (let i = 0; i < 81; i++) {
            if (g[i] || i === p || i === w1.cell || i === w2.cell) continue;
            if ((cand[i] & bit) && sees(i, w1.cell) && sees(i, w2.cell)) elim.push([i, bit]);
          }
          if (!elim.length) continue;

          return mk('xyWing', 4, 'XY-Wing', {
            focus: [p, w1.cell, w2.cell], elim: elim,
            text: cellName(p) + ' 是 { ' + a + ', ' + b + ' }，它的两个邻居 ' +
              cellName(w1.cell) + ' 是 { ' + bits(cand[w1.cell]).join(', ') + ' }、' +
              cellName(w2.cell) + ' 是 { ' + bits(cand[w2.cell]).join(', ') + ' }。' +
              '不管中心格最后填 ' + a + ' 还是 ' + b + '，两个翅膀里总有一个是 ' + c + '——所以同时看见两个翅膀的格子，不可能是 ' + c + '。'
          });
        }
      }
    }
    return null;
  }

  /** 10. 唯一矩形（类型 1）：三格同对，第四格多出来的候选必删 */
  function tUniqueRectangle(g, cand) {
    for (let r1 = 0; r1 < 9; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 9; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            let skip = false;
            for (let k = 0; k < 4; k++) if (g[cells[k]]) { skip = true; break; }
            if (skip) continue;

            const boxes = new Set(cells.map(function (i) { return BOX_OF[i]; }));
            if (boxes.size !== 2) continue;

            for (let k = 0; k < 4; k++) {
              const trio = [cells[(k + 1) % 4], cells[(k + 2) % 4], cells[(k + 3) % 4]];
              const m0 = cand[trio[0]];
              if (POP[m0] !== 2) continue;
              if (cand[trio[1]] !== m0 || cand[trio[2]] !== m0) continue;
              const fourth = cells[k];
              if ((cand[fourth] & m0) !== m0) continue;
              if (POP[cand[fourth]] <= 2) continue;

              const pair = bits(m0);
              return mk('uniqueRect', 5, '唯一矩形', {
                focus: cells, elim: [[fourth, m0]],
                text: cellName(trio[0]) + '、' + cellName(trio[1]) + '、' + cellName(trio[2]) +
                  ' 都只剩 { ' + pair.join(', ') + ' }，加上 ' + cellName(fourth) + ' 正好组成一个矩形。' +
                  '如果 ' + cellName(fourth) + ' 也只剩这两个数，题目就会有两个解——所以 ' + pair.join('、') + ' 里必有一个不成立，从它身上删掉。'
              });
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * 11. 单数着色：同一数字的共轭对连成链，双色染色找矛盾。
   * 注意：颜色只在同一个连通分量内部可比，跨分量的颜色毫无关系——必须分开处理。
   */
  function tColoring(g, cand) {
    for (let v = 1; v <= 9; v++) {
      const bit = BIT[v];
      const adj = new Map();
      const edgeSeen = new Set();

      for (let u = 0; u < 27; u++) {
        const unit = UNITS[u];
        const pos = [];
        let present = false;
        for (let k = 0; k < 9; k++) {
          const i = unit[k];
          if (g[i] === v) { present = true; break; }
          if (!g[i] && (cand[i] & bit)) pos.push(i);
        }
        if (present || pos.length !== 2) continue;
        const a = pos[0], b = pos[1];
        const key = a < b ? a + '-' + b : b + '-' + a;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(b);
        adj.get(b).push(a);
      }
      if (!adj.size) continue;

      const visited = new Set();
      const starts = Array.from(adj.keys());

      for (let si = 0; si < starts.length; si++) {
        const start = starts[si];
        if (visited.has(start)) continue;

        // 单个连通分量内染色
        const color = new Map();
        color.set(start, 0);
        visited.add(start);
        const queue = [start];
        while (queue.length) {
          const x = queue.pop();
          const nb = adj.get(x) || [];
          for (let k = 0; k < nb.length; k++) {
            const y = nb[k];
            if (!color.has(y)) {
              color.set(y, 1 - color.get(x));
              visited.add(y);
              queue.push(y);
            }
          }
        }

        const groups = [[], []];
        color.forEach(function (c, cell) { groups[c].push(cell); });

        // (a) 同色两格互相看见 → 这一色不成立，整色删掉
        for (let gi = 0; gi < 2; gi++) {
          const arr = groups[gi];
          let pair = null;
          for (let a = 0; a < arr.length && !pair; a++) {
            for (let b = a + 1; b < arr.length; b++) {
              if (sees(arr[a], arr[b])) { pair = [arr[a], arr[b]]; break; }
            }
          }
          if (!pair) continue;

          const elim = [];
          for (let k = 0; k < arr.length; k++) {
            const i = arr[k];
            if (!g[i] && (cand[i] & bit)) elim.push([i, bit]);
          }
          if (!elim.length) continue;

          return mk('coloring', 5, '单数着色', {
            focus: arr.slice(), elim: elim,
            text: '把 ' + v + ' 的候选位置按「共轭对」连成链、涂成两色：' + cellName(pair[0]) + ' 和 ' + cellName(pair[1]) +
              ' 同色却互相看见。同色不可能同时成立，所以这一整条链上同色的 ' + v + ' 全部删掉。'
          });
        }

        // (b) 某格同时看见链上的两种颜色 → 该格不可能是 v
        let found = null;
        for (let i = 0; i < 81 && found == null; i++) {
          if (g[i] || !(cand[i] & bit) || color.has(i)) continue;
          let s0 = false, s1 = false;
          const g0 = groups[0], g1 = groups[1];
          for (let k = 0; k < g0.length && !s0; k++) if (sees(i, g0[k])) s0 = true;
          for (let k = 0; k < g1.length && !s1; k++) if (sees(i, g1[k])) s1 = true;
          if (s0 && s1) found = i;
        }
        if (found != null) {
          return mk('coloring', 5, '单数着色', {
            focus: groups[0].concat(groups[1]), elim: [[found, bit]],
            text: cellName(found) + ' 同时看见了这条链上的两种颜色的 ' + v + '。不管哪种颜色成立，它都会被排除——所以这里不可能是 ' + v + '。'
          });
        }
      }
    }
    return null;
  }

  /* ============================================================
   * 五、评级器
   * ============================================================ */

  const TECHNIQUES = [
    { name: 'nakedSingle', level: 1, label: '唯一候选', fn: tNakedSingle },
    { name: 'hiddenSingle', level: 1, label: '隐性唯一', fn: tHiddenSingle },
    { name: 'lockedCandidates', level: 2, label: '区块排除', fn: tLocked },
    { name: 'nakedPair', level: 3, label: '显性数对', fn: function (g, c) { return tNakedSubset(g, c, 2); } },
    { name: 'nakedTriple', level: 3, label: '显性三数组', fn: function (g, c) { return tNakedSubset(g, c, 3); } },
    { name: 'hiddenPair', level: 3, label: '隐性数对', fn: function (g, c) { return tHiddenSubset(g, c, 2); } },
    { name: 'hiddenTriple', level: 3, label: '隐性三数组', fn: function (g, c) { return tHiddenSubset(g, c, 3); } },
    { name: 'xWing', level: 4, label: 'X-Wing', fn: tXWing },
    { name: 'swordfish', level: 4, label: '剑鱼', fn: tSwordfish },
    { name: 'xyWing', level: 4, label: 'XY-Wing', fn: tXYWing },
    { name: 'uniqueRect', level: 5, label: '唯一矩形', fn: tUniqueRectangle },
    { name: 'coloring', level: 5, label: '单数着色', fn: tColoring }
  ];

  const TECH_BY_NAME = {};
  TECHNIQUES.forEach(function (t) { TECH_BY_NAME[t.name] = t; });

  function place(g, cand, i, v) {
    g[i] = v;
    cand[i] = 0;
    const bit = BIT[v];
    const ps = PEERS[i];
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (!g[p]) cand[p] &= ~bit;
    }
  }

  function applyStep(g, cand, st) {
    for (let k = 0; k < st.place.length; k++) place(g, cand, st.place[k][0], st.place[k][1]);
    for (let k = 0; k < st.elim.length; k++) {
      const i = st.elim[k][0];
      if (!g[i]) cand[i] &= ~st.elim[k][1];
    }
  }

  /**
   * 用「人类技巧」解题并评级。
   * @returns {{ok, solved, level, steps, used, solution, stuck}}
   */
  function analyze(puzzle, opts) {
    opts = opts || {};
    const g = Uint8Array.from(puzzle);
    const out = { ok: false, solved: false, level: 0, steps: [], used: {}, solution: null, stuck: false };
    if (!isConsistent(g)) return out;

    const cand = candidates(g);
    const used = {};
    let guard = 0;
    let level = 0;

    while (guard++ < 600) {
      let st = null;
      for (let t = 0; t < TECHNIQUES.length; t++) {
        const found = TECHNIQUES[t].fn(g, cand);
        if (found) {
          found.name = TECHNIQUES[t].name;
          found.level = TECHNIQUES[t].level;
          found.label = TECHNIQUES[t].label;
          st = found;
          break;
        }
      }
      if (!st) break;
      if (!st.place.length && !st.elim.length) break;

      st.before = format(g);
      st.candBefore = Uint16Array.from(cand);
      applyStep(g, cand, st);

      stepsPush(out.steps, st);
      used[st.name] = (used[st.name] || 0) + 1;
      if (st.level > level) level = st.level;

      if (out.steps.length > 400) break;
    }

    out.used = used;
    out.solved = countEmpty(g) === 0;
    out.ok = true;
    out.level = out.solved ? Math.max(1, level) : 6;
    out.stuck = !out.solved;
    out.solution = out.solved ? g : solveOne(puzzle);
    out.maxLevel = level;
    return out;
  }

  function stepsPush(arr, st) { arr.push(st); }

  /**
   * 试探深度：逻辑推不动之后，还要「给几格正确答案」才能一路推完。
   * 0 = 纯逻辑可解；1 = 给一格就通；2 = 给两格；超过 cap 返回 cap+1。
   * 每次挑候选数最少的格子揭示——这也是人最可能先试的位置。
   */
  function assistDepth(g0, solution, cap) {
    cap = cap == null ? 4 : cap;
    const g = Uint8Array.from(g0);
    for (let d = 0; d <= cap; d++) {
      const an = analyze(g);
      if (an.solved) return d;
      if (d === cap) break;
      const cand = candidates(g);
      let best = -1, bn = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const n = POP[cand[i]];
        if (n < bn) { bn = n; best = i; if (n === 1) break; }
      }
      if (best < 0) break;
      g[best] = solution[best];
    }
    return cap + 1;
  }

  /* ============================================================
   * 六、出题
   * ============================================================ */

  const DIFFS = [
    { id: 1, key: 'novice', name: '入门', en: 'Novice', givens: [40, 46], base: 600, target: 180, ink: '#7d9a6a' },
    { id: 2, key: 'easy', name: '简单', en: 'Easy', givens: [36, 41], base: 900, target: 300, ink: '#6f8fa0' },
    { id: 3, key: 'medium', name: '中等', en: 'Medium', givens: [31, 36], base: 1300, target: 480, ink: '#b5873f' },
    { id: 4, key: 'hard', name: '困难', en: 'Hard', givens: [27, 31], base: 1800, target: 720, ink: '#b06a4a' },
    { id: 5, key: 'expert', name: '专家', en: 'Expert', givens: [24, 27], base: 2400, target: 900, ink: '#9a5f7a' },
    { id: 6, key: 'master', name: '大师', en: 'Master', givens: [21, 25], base: 3000, target: 1200, ink: '#5d5a8c' },
    { id: 7, key: 'extreme', name: '极限', en: 'Legend', givens: [21, 24], base: 4200, target: 1500, ink: '#8f3a34' }
  ];

  function diffById(id) {
    for (let i = 0; i < DIFFS.length; i++) if (DIFFS[i].id === id) return DIFFS[i];
    return DIFFS[0];
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** 随机生成一个完整合法终盘 */
  function randomFullGrid(rng) {
    const g = new Uint8Array(81);
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);

    function rec(pos) {
      if (pos === 81) return true;
      const r = ROW_OF[pos], c = COL_OF[pos], b = BOX_OF[pos];
      const avail = FULL & ~(rows[r] | cols[c] | boxes[b]);
      if (!avail) return false;

      const list = [];
      for (let v = 1; v <= 9; v++) if (avail & BIT[v]) list.push(v);
      shuffle(list, rng);

      for (let k = 0; k < list.length; k++) {
        const v = list[k], bit = BIT[v];
        g[pos] = v;
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (rec(pos + 1)) return true;
        g[pos] = 0;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      return false;
    }

    rec(0);
    return g;
  }

  /** 挖空，保持唯一解。symmetric=true 时按 180° 对称成对挖 */
  function dig(full, targetGivens, rng, symmetric) {
    const g = Uint8Array.from(full);
    const order = [];
    for (let i = 0; i < 81; i++) order.push(i);
    shuffle(order, rng);

    let givens = 81;

    for (let k = 0; k < order.length; k++) {
      if (givens <= targetGivens) break;
      const i = order[k];
      if (!g[i]) continue;

      const j = 80 - i;
      const cells = (symmetric !== false && i !== j && g[j]) ? [i, j] : [i];
      const saved = cells.map(function (x) { return g[x]; });

      cells.forEach(function (x) { g[x] = 0; });

      if (countSolutions(g, 2) !== 1) {
        cells.forEach(function (x, idx) { g[x] = saved[idx]; });
      } else {
        givens -= cells.length;
      }
    }
    return g;
  }

  const GEN_CFG = {
    1: { givens: [38, 46], minSteps: 0, budget: 600 },
    2: { givens: [30, 36], minSteps: 0, budget: 1200 },
    3: { givens: [27, 33], minSteps: 0, budget: 1600 },
    4: { givens: [23, 28], minSteps: 0, budget: 2400 },
    5: { givens: [22, 26], minSteps: 0, budget: 2400 },
    6: { givens: [21, 25], minSteps: 12, budget: 3200 },
    7: { givens: [21, 24], minSteps: 12, budget: 4200 }
  };

  /**
   * 生成一局。
   * @param {number} level 1..7
   * @param {{seed?:number, budget?:number, maxAttempts?:number}} opts
   */
  function generate(level, opts) {
    opts = opts || {};
    const cfg = diffById(level);
    const gc = GEN_CFG[level] || GEN_CFG[1];
    const budget = opts.budget || gc.budget;
    const maxAttempts = opts.maxAttempts || 400;
    const t0 = Date.now();
    const seedBase = (opts.seed == null ? (Math.random() * 0xffffffff) >>> 0 : opts.seed) >>> 0;

    let best = null;
    let attempts = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 4 && Date.now() - t0 > budget && best) break;
      attempts++;

      const rng = mulberry32((seedBase + attempt * 7919) >>> 0);
      const full = randomFullGrid(rng);

      const lo = gc.givens[0], hi = gc.givens[1];
      const targetGivens = lo + Math.floor(rng() * (hi - lo + 1));

      const grid = dig(full, targetGivens, rng);
      if (countSolutions(grid, 2) !== 1) continue;

      const an = analyze(grid);
      // 6 档以上都是「逻辑走不动」，不能按 solved 过滤
      if (!an.solution) continue;
      if (!an.solved && an.level !== 6) continue;
      if (an.steps.length < gc.minSteps) continue;

      // 卡住的题再分两级：给一格就通 = 大师，给一格还不够 = 极限
      let effLevel = an.level;
      if (effLevel === 6 && level >= 6) {
        const depth = assistDepth(grid, an.solution, 2);
        effLevel = depth >= 2 ? 7 : 6;
      }

      const dist = Math.abs(effLevel - level);
      const candidate = {
        puzzle: grid,
        solution: an.solution,
        level: effLevel,
        difficulty: cfg,
        rating: an,
        givens: 81 - countEmpty(grid),
        attempts: attempts,
        ms: Date.now() - t0
      };

      if (dist === 0) return candidate;

      if (!best || dist < best.dist) {
        best = candidate;
        best.dist = dist;
      }
    }

    if (best) {
      best.attempts = attempts;
      best.ms = Date.now() - t0;
      best.exact = false;
      delete best.dist;
      return best;
    }
    return null;
  }

  /** 每日挑战：同一天同一题 */
  function dailyConfig(dateStr) {
    const h = hashString('sudoku-daily-' + dateStr);
    const d = new Date(dateStr + 'T00:00:00');
    const wd = isNaN(d.getTime()) ? 0 : d.getDay(); // 0=周日
    const table = [4, 3, 3, 4, 4, 5, 3];           // 周日..周六
    const level = table[wd];
    return { level: level, seed: h };
  }

  function generateDaily(dateStr) {
    const conf = dailyConfig(dateStr);
    const res = generate(conf.level, { seed: conf.seed, budget: 2500 });
    if (res) res.daily = conf;
    return res;
  }

  /* ============================================================
   * 七、导出
   * ============================================================ */

  SD.core = {
    BIT: BIT, FULL: FULL, POP: POP, VAL: VAL,
    ROW_OF: ROW_OF, COL_OF: COL_OF, BOX_OF: BOX_OF,
    ROW_CELLS: ROW_CELLS, COL_CELLS: COL_CELLS, BOX_CELLS: BOX_CELLS, UNITS: UNITS,
    PEERS: PEERS,
    bits: bits, cellName: cellName, unitName: unitName, sees: sees,
    parse: parse, format: format, clone: clone,
    isConsistent: isConsistent, countEmpty: countEmpty, candidates: candidates,
    countSolutions: countSolutions, solveOne: solveOne,
    analyze: analyze, TECHNIQUES: TECHNIQUES, TECH_BY_NAME: TECH_BY_NAME,
    assistDepth: assistDepth,
    DIFFS: DIFFS, diffById: diffById,
    generate: generate, generateDaily: generateDaily, dailyConfig: dailyConfig,
    mulberry32: mulberry32, shuffle: shuffle, hashString: hashString,
    _internals: { randomFullGrid: randomFullGrid, dig: dig }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
