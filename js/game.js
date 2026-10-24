/*!
 * game.js — 一局游戏的状态机
 * 只管规则、输入、撤销、计时、计分，不碰 DOM。
 */
(function (root) {
  'use strict';
  const SD = (root.SD = root.SD || {});
  const C = SD.core;

  function Game(opts) {
    this.puzzle = Uint8Array.from(opts.puzzle);
    this.solution = Uint8Array.from(opts.solution);
    this.difficulty = opts.difficulty || C.diffById(1);
    this.mode = opts.mode || 'classic';
    this.day = opts.day || null;

    this.grid = Uint8Array.from(opts.puzzle);
    this.given = new Uint8Array(81);
    for (let i = 0; i < 81; i++) this.given[i] = this.puzzle[i] ? 1 : 0;
    this.notes = new Uint16Array(81);

    this.selected = -1;
    this.noteMode = false;
    this.mistakes = 0;
    this.hints = 0;
    this.elapsed = opts.elapsed || 0;
    this.paused = false;
    this.finished = false;
    this.startedAt = Date.now();

    this.undoStack = [];
    this.redoStack = [];
    this.hintState = null;

    this.onChange = opts.onChange || function () {};
    this.onWin = opts.onWin || function () {};
  }

  const P = Game.prototype;

  /* ---------- 快照 / 撤销 ---------- */

  P._snap = function () {
    return { grid: Uint8Array.from(this.grid), notes: Uint16Array.from(this.notes) };
  };

  P._pushUndo = function () {
    this.undoStack.push(this._snap());
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack.length = 0;
  };

  P.undo = function () {
    if (!this.undoStack.length || this.finished) return false;
    this.redoStack.push(this._snap());
    const s = this.undoStack.pop();
    this.grid = s.grid;
    this.notes = s.notes;
    this.hintState = null;
    this._emit();
    return true;
  };

  P.redo = function () {
    if (!this.redoStack.length || this.finished) return false;
    this.undoStack.push(this._snap());
    const s = this.redoStack.pop();
    this.grid = s.grid;
    this.notes = s.notes;
    this._emit();
    return true;
  };

  /* ---------- 选择 ---------- */

  P.select = function (i) {
    if (i < 0 || i > 80) return;
    this.selected = i;
    this._emit({ selectOnly: true });
  };

  P.move = function (dr, dc) {
    let i = this.selected;
    if (i < 0) i = 40;
    let r = C.ROW_OF[i] + dr, c = C.COL_OF[i] + dc;
    r = (r + 9) % 9;
    c = (c + 9) % 9;
    this.select(r * 9 + c);
  };

  /* ---------- 输入 ---------- */

  P.enter = function (v) {
    if (this.finished || this.paused) return { type: 'blocked' };
    const i = this.selected;
    if (i < 0) return { type: 'none' };
    if (this.given[i]) return { type: 'given', cell: i };

    if (this.noteMode) return this.toggleNote(v);

    if (this.grid[i] === v) {
      this.erase();
      return { type: 'erase', cell: i };
    }

    this._pushUndo();
    this.grid[i] = v;
    this.notes[i] = 0;

    let wrong = false;
    if (v !== this.solution[i]) {
      this.mistakes++;
      wrong = true;
    }

    if (SD.store && SD.store.setting('autoNotes')) this._stripPeerNotes(i, v);

    this.hintState = null;
    this._emit({ cell: i, value: v, wrong: wrong });

    if (this.isSolved()) this._finish();
    return { type: wrong ? 'wrong' : 'ok', cell: i, value: v };
  };

  P.toggleNote = function (v) {
    if (this.finished || this.paused) return { type: 'blocked' };
    const i = this.selected;
    if (i < 0) return { type: 'none' };
    if (this.given[i] || this.grid[i]) return { type: 'given', cell: i };

    this._pushUndo();
    this.notes[i] ^= C.BIT[v];
    this.hintState = null;
    this._emit({ cell: i, note: v });
    return { type: 'note', cell: i, value: v };
  };

  P.erase = function () {
    if (this.finished || this.paused) return { type: 'blocked' };
    const i = this.selected;
    if (i < 0 || this.given[i]) return { type: 'none' };
    if (!this.grid[i] && !this.notes[i]) return { type: 'none' };
    this._pushUndo();
    this.grid[i] = 0;
    this.notes[i] = 0;
    this.hintState = null;
    this._emit({ cell: i });
    return { type: 'erase', cell: i };
  };

  P._stripPeerNotes = function (i, v) {
    const bit = C.BIT[v];
    const ps = C.PEERS[i];
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (!this.grid[p] && (this.notes[p] & bit)) this.notes[p] &= ~bit;
    }
  };

  /* ---------- 判定 ---------- */

  P.conflicts = function () {
    const bad = new Set();
    for (let u = 0; u < 27; u++) {
      const unit = C.UNITS[u];
      const seen = {};
      for (let k = 0; k < 9; k++) {
        const i = unit[k];
        const v = this.grid[i];
        if (!v) continue;
        if (seen[v] !== undefined) {
          bad.add(i);
          bad.add(seen[v]);
        } else seen[v] = i;
      }
    }
    return bad;
  };

  P.wrongCells = function () {
    const s = new Set();
    for (let i = 0; i < 81; i++) {
      if (this.grid[i] && this.grid[i] !== this.solution[i]) s.add(i);
    }
    return s;
  };

  P.isSolved = function () {
    for (let i = 0; i < 81; i++) if (this.grid[i] !== this.solution[i]) return false;
    return true;
  };

  P.progress = function () {
    let filled = 0, total = 0;
    for (let i = 0; i < 81; i++) {
      if (this.given[i]) continue;
      total++;
      if (this.grid[i]) filled++;
    }
    return { filled: filled, total: total, ratio: total ? filled / total : 0 };
  };

  P.remaining = function (v) {
    let n = 9;
    for (let i = 0; i < 81; i++) if (this.grid[i] === v) n--;
    return n;
  };

  /* ---------- 计时 ---------- */

  P.tick = function () {
    if (this.paused || this.finished) return;
    this.elapsed++;
  };

  P.pause = function () {
    if (this.finished) return;
    this.paused = true;
    this._emit();
  };

  P.resume = function () {
    this.paused = false;
    this._emit();
  };

  /* ---------- 提示 ---------- */

  /**
   * 三级提示：方向 → 位置 → 落子
   * @returns {{level:number, label:string, text:string, cells:number[], done:boolean, cell:number|null, value:number|null}}
   */
  P.nextHint = function () {
    if (!this.hintState) {
      const an = C.analyze(this.grid);
      if (!an.ok) {
        this.hintState = { broken: true, step: null, level: 0 };
      } else {
        this.hintState = { broken: false, step: an.steps[0] || null, level: 0 };
      }
    }

    const h = this.hintState;
    h.level = Math.min(3, h.level + 1);

    if (h.broken) {
      h.level = 3;
      return {
        level: 3, label: '盘面有冲突', done: true,
        text: '先看看标红的格子——同一行、同一列或同一宫里有两个相同的数。把冲突改掉，推理才能继续。',
        cells: Array.from(this.conflicts())
      };
    }

    if (h.level === 1) {
      if (!h.step) {
        h.cells = this._pickEmpty();
        return {
          level: 1, label: '逻辑走到头了', done: false,
          text: '常规技巧都推不动了。这题需要先假设一个数试试看——我可以直接给你指一格。',
          cells: []
        };
      }
      return {
        level: 1, label: h.step.label, done: false,
        text: h.step.text,
        cells: h.step.unit != null ? C.UNITS[h.step.unit].slice() : h.step.focus.slice()
      };
    }

    if (h.level === 2) {
      if (!h.step) {
        return {
          level: 2, label: '试探', done: false,
          text: '看这一格。它没有逻辑上的必然答案，只能试着填。',
          cells: h.cells || []
        };
      }
      return {
        level: 2, label: h.step.label, done: false,
        text: h.step.place.length
          ? '答案就在' + C.cellName(h.step.place[0][0]) + '。'
          : '要被排除的候选在标出来的格子里。',
        cells: h.step.place.length ? [h.step.place[0][0]] : h.step.targets.slice()
      };
    }

    // 第三级：直接给一个正确的数
    let cell = -1;
    if (h.step && h.step.place.length) {
      cell = h.step.place[0][0];
    } else if (h.cells && h.cells.length) {
      cell = h.cells[0];
    } else {
      cell = this._pickEmpty();
    }

    let value = h.step && h.step.place.length ? h.step.place[0][1] : this.solution[cell];

    h.finished = true;
    this.hints++;
    this.hintState = null;

    // 直接落子
    this._pushUndo();
    this.grid[cell] = value;
    this.notes[cell] = 0;
    if (SD.store && SD.store.setting('autoNotes')) this._stripPeerNotes(cell, value);
    this._emit({ cell: cell, value: value, hint: true });

    const solvedNow = this.isSolved();
    if (solvedNow) this._finish();

    return {
      level: 3, label: '给你这一格', done: true,
      text: C.cellName(cell) + ' 填 ' + value + '。',
      cells: [cell], cell: cell, value: value
    };
  };

  P._pickEmpty = function () {
    const empties = [];
    for (let i = 0; i < 81; i++) if (!this.grid[i]) empties.push(i);
    if (!empties.length) return -1;
    return empties[(Math.random() * empties.length) | 0];
  };

  /* ---------- 结束 ---------- */

  P._finish = function () {
    if (this.finished) return;
    this.finished = true;
    this.selected = -1;

    const cfg = this.difficulty;
    const secs = this.elapsed;
    const timeBonus = Math.max(0, cfg.target - secs) * 4;
    const hintMul = Math.max(0.5, 1 - 0.12 * this.hints);
    const missMul = Math.max(0.5, 1 - 0.08 * this.mistakes);
    const raw = (cfg.base + timeBonus) * hintMul * missMul;
    const score = Math.round(raw / 10) * 10;

    const ratio = secs / cfg.target;
    let stars = 1;
    if (ratio <= 0.75 && this.mistakes <= 1) stars = 3;
    else if (ratio <= 1.25) stars = 2;

    const result = {
      diffKey: cfg.key,
      diffName: cfg.name,
      level: cfg.id,
      timeSec: secs,
      mistakes: this.mistakes,
      hints: this.hints,
      stars: stars,
      score: score,
      mode: this.mode,
      day: this.day,
      givens: 81 - C.countEmpty(this.puzzle),
      used: this.ratingUsed || {}
    };

    this._emit({ finished: true });
    this.onWin(result);
  };

  /* ---------- 序列化 ---------- */

  P.serialize = function () {
    return {
      v: 1,
      diffId: this.difficulty.id,
      mode: this.mode,
      day: this.day,
      puzzle: C.format(this.puzzle),
      solution: C.format(this.solution),
      grid: C.format(this.grid),
      notes: Array.prototype.slice.call(this.notes),
      elapsed: this.elapsed,
      mistakes: this.mistakes,
      hints: this.hints,
      used: this.ratingUsed || {}
    };
  };

  Game.deserialize = function (state, opts) {
    if (!state || !state.puzzle || !state.solution) return null;
    const g = new Game({
      puzzle: C.parse(state.puzzle),
      solution: C.parse(state.solution),
      difficulty: C.diffById(state.diffId || 1),
      mode: state.mode || 'classic',
      day: state.day || null,
      elapsed: state.elapsed || 0,
      onChange: opts && opts.onChange,
      onWin: opts && opts.onWin
    });
    if (state.grid) g.grid = C.parse(state.grid);
    if (Array.isArray(state.notes)) {
      for (let i = 0; i < 81; i++) g.notes[i] = state.notes[i] || 0;
    }
    g.mistakes = state.mistakes || 0;
    g.hints = state.hints || 0;
    if (state.used) g.ratingUsed = state.used;
    return g;
  };

  P._emit = function (extra) {
    this.onChange(this, extra || {});
  };

  SD.Game = Game;

})(typeof globalThis !== 'undefined' ? globalThis : this);
