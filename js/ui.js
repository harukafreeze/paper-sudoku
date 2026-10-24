/*!
 * ui.js — 界面层
 * 负责所有 DOM、屏幕切换、点击与键盘、动画。
 */
(function (root) {
  'use strict';
  const SD = (root.SD = root.SD || {});
  const C = SD.core;
  const Store = SD.store;

  const $ = function (sel, scope) { return (scope || document).querySelector(sel); };
  const $$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

  const state = {
    screen: 'home',
    game: null,
    gameCells: [],
    lesson: null,
    lessonCells: [],
    lessonBoardN: 9,
    lessonSteps: [],
    lessonIdx: 0,
    lessonSolved: false,
    lessonAttempts: 0,
    lessonAnswerShown: false,
    lessonPlaced: false,
    lessonWatchTimer: null,
    lessonNextId: null,
    hintCells: [],
    hintOpen: false,
    hintLevel: 0,
    lastLevel: 2,
    lastMode: 'classic',
    saveTimer: null,
    busy: false
  };

  /* ============================================================
   * 小工具
   * ============================================================ */

  function fmtTime(sec) {
    sec = Math.max(0, sec | 0);
    const h = (sec / 3600) | 0;
    const m = ((sec % 3600) / 60) | 0;
    const s = sec % 60;
    const p = function (n) { return String(n).padStart(2, '0'); };
    return h ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
  }

  function fmtNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function fmtDay(day) {
    const d = new Date(day + 'T00:00:00');
    if (isNaN(d.getTime())) return day;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + WEEK[d.getDay()];
  }

  function starHTML(n) {
    let s = '';
    for (let i = 1; i <= 3; i++) s += '<span class="star' + (i <= n ? ' on' : '') + '">★</span>';
    return s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ============================================================
   * 声音
   * ============================================================ */

  let actx = null;
  function tone(freq, dur, type, gain) {
    if (!Store.setting('sound')) return;
    try {
      if (!actx) actx = new (root.AudioContext || root.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.value = gain == null ? 0.04 : gain;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* 忽略 */ }
  }

  const sfx = {
    ok: function () { tone(660, 0.08, 'sine'); },
    note: function () { tone(420, 0.05, 'triangle', 0.025); },
    bad: function () { tone(160, 0.18, 'sawtooth', 0.05); },
    win: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.22, 'sine', 0.045); }, i * 110);
      });
    },
    unlock: function () {
      [784, 988, 1318].forEach(function (f, i) {
        setTimeout(function () { tone(f, 0.16, 'triangle', 0.04); }, i * 90);
      });
    }
  };

  /* ============================================================
   * 轻提示
   * ============================================================ */

  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 220);
    }, ms || 1900);
  }

  /* ============================================================
   * 棋盘
   * ============================================================ */

  function makeBoard(host, n) {
    n = n || 9;
    host.innerHTML = '';
    host.dataset.n = String(n);
    const box = n === 4 ? 2 : 3;
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = String(i);
      d.setAttribute('role', 'gridcell');
      const r = (i / n) | 0, c = i % n;
      if (c % box === box - 1 && c !== n - 1) d.classList.add('edge-r');
      if (r % box === box - 1 && r !== n - 1) d.classList.add('edge-b');
      const v = document.createElement('span');
      v.className = 'v';
      const notes = document.createElement('span');
      notes.className = 'notes';
      for (let k = 0; k < (n === 4 ? 4 : 9); k++) notes.appendChild(document.createElement('i'));
      d.appendChild(v);
      d.appendChild(notes);
      host.appendChild(d);
      cells.push(d);
    }
    return cells;
  }

  function paintNotes(el, mask) {
    const slots = el.lastElementChild.children;
    for (let v = 1; v <= slots.length; v++) {
      const on = !!(mask & C.BIT[v]);
      const slot = slots[v - 1];
      if (on) { if (slot.textContent !== String(v)) slot.textContent = String(v); }
      else if (slot.textContent) slot.textContent = '';
    }
  }

  function clearNotes(el) {
    const slots = el.lastElementChild.children;
    for (let k = 0; k < slots.length; k++) if (slots[k].textContent) slots[k].textContent = '';
  }

  function pop(i) {
    const el = state.gameCells[i];
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    setTimeout(function () { el.classList.remove('pop'); }, 260);
  }

  function shake(i) {
    const el = state.gameCells[i];
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 400);
  }

  /* ============================================================
   * 路由
   * ============================================================ */

  function showScreen(name) {
    state.screen = name;
    $$('.screen').forEach(function (s) {
      s.classList.toggle('active', s.dataset.screen === name);
    });
    $$('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.nav === name);
    });
    root.scrollTo(0, 0);
    closeHint();
  }

  function nav(name) {
    if (state.screen === 'game' && name !== 'game' && state.game && !state.game.finished) {
      Store.saveGame(state.game.serialize());
    }
    if (name === 'home') renderHome();
    if (name === 'stats') renderStats();
    if (name === 'codex') renderCodex();
    if (name === 'settings') renderSettings();
    showScreen(name);
  }

  /* ============================================================
   * 首页
   * ============================================================ */

  const TECH_TAG = {
    1: '只用「单数」',
    2: '到「区块排除」',
    3: '到「数对 / 三数组」',
    4: '到「X-Wing / 剑鱼」',
    5: '到「XY-Wing / 唯一矩形 / 着色」',
    6: '逻辑卡住，给一格就能推完',
    7: '逻辑推到头，给一格还不够'
  };

  const TIPS = [
    '卡住的时候先别急着点提示。回头找「隐性唯一」——从数字找格子，永远比从格子找数快。',
    '候选数只记还有可能出现的。九个数字全写上，等于没写。',
    '换个扫描顺序：先扫九个宫，再扫行，最后扫列。同一个盘面，换个走法常常就看见了。',
    '觉得「这里应该填这个数」的时候，先问一句：另外八个数在哪？数独不接受应该。',
    '每填下一个数，回头看一眼它的同行、同列、同宫。新的唯一候选往往就在这三个方向里。',
    '如果一局只能靠猜才能往下走，多半是前面漏了一步。倒回去，把候选数重新标一遍。',
    '数对不是让你填的，是让你删的。它的价值在于「别处不能是什么」。',
    '一局里真正需要高级技巧的地方通常只有一两处。剩下的都是耐心。'
  ];

  function renderHome() {
    const day = Store.todayStr();
    const conf = C.dailyConfig(day);
    const diff = C.diffById(conf.level);
    const done = Store.dailyDone(day);
    const saved = Store.loadGame();

    /* --- 今日小提醒 --- */
    const tipIdx = Math.floor(Date.now() / 86400000) % TIPS.length;
    $('#tip-card').innerHTML =
      '<div class="daily-top"><span class="kicker">今天的小提醒</span>' +
      '<span class="pill">' + String(tipIdx + 1).padStart(2, '0') + '</span></div>' +
      '<p class="tip-text">' + esc(TIPS[tipIdx]) + '</p>';

    /* --- 每日挑战 --- */
    const daily = $('#daily-card');
    const mark = '<div class="daily-mark"><span>' + diff.name + '</span><em>' + diff.en + '</em></div>';
    let dailyHead = '';
    let dailyMain = '';

    if (done) {
      const r = Store.data.daily.done[day];
      dailyHead = '<span class="kicker">每日挑战</span><span class="pill done">已完成</span>';
      dailyMain =
        '<h3>' + fmtDay(day) + '</h3>' +
        '<p class="muted">' + fmtTime(r.timeSec) + ' · ' + starHTML(r.stars) + '</p>' +
        '<div class="btn-row"><button class="btn ghost sm" data-act="daily-share">复制战绩</button>' +
        '<button class="btn sm" data-act="daily-again">再玩一次</button></div>';
    } else if (saved && saved.mode === 'daily' && saved.day === day) {
      dailyHead = '<span class="kicker">每日挑战</span><span class="pill live">进行中</span>';
      dailyMain =
        '<h3>' + fmtDay(day) + '</h3>' +
        '<p class="muted">已用 ' + fmtTime(saved.elapsed) + '，接着下就好。</p>' +
        '<div class="btn-row"><button class="btn" data-act="daily-continue">继续这一局</button></div>';
    } else {
      dailyHead = '<span class="kicker">每日挑战</span><span class="pill">今天</span>';
      dailyMain =
        '<h3>' + fmtDay(day) + '</h3>' +
        '<p class="muted">一天一题，和所有人同一道。' + TECH_TAG[conf.level] + '。</p>' +
        '<div class="btn-row"><button class="btn" data-act="daily-start">开始今天的题</button></div>';
    }

    daily.innerHTML =
      '<div class="daily-top">' + dailyHead + '</div>' +
      '<div class="daily-body"><div class="daily-main">' + dailyMain + '</div>' + mark + '</div>';

    /* --- 继续上局 --- */
    const resume = $('#resume-card');
    if (saved && !(saved.mode === 'daily' && saved.day === day)) {
      const d = C.diffById(saved.diffId || 1);
      const empties = (saved.puzzle.match(/0/g) || []).length;
      const filled = (saved.grid.match(/[1-9]/g) || []).length - (81 - empties);
      resume.hidden = false;
      resume.innerHTML =
        '<div class="daily-top"><span class="kicker">上次没下完</span><span class="pill">' + d.name + '</span></div>' +
        '<h3>' + fmtTime(saved.elapsed) + ' · 已填 ' + filled + ' / ' + empties + '</h3>' +
        '<div class="btn-row"><button class="btn" data-act="resume">接着下</button>' +
        '<button class="btn ghost sm" data-act="discard">不下了</button></div>';
    } else {
      resume.hidden = true;
      resume.innerHTML = '';
    }

    /* --- 难度卡 --- */
    const grid = $('#diff-grid');
    grid.innerHTML = C.DIFFS.map(function (d) {
      const st = Store.data.stats[d.key];
      const best = st && st.bestTime != null ? fmtTime(st.bestTime) : '—';
      const stars = st && st.bestStars ? ' ' + '★'.repeat(st.bestStars) : '';

      if (d.id === 7) {
        return '<button class="diff-card diff-extreme" data-level="7">' +
          '<span class="de-left"><span class="diff-idx">07</span>' +
          '<span class="de-name"><b>' + d.name + '</b><em>' + d.en + '</em></span></span>' +
          '<span class="diff-tag">' + TECH_TAG[7] + '</span>' +
          '<span class="de-right"><span class="diff-best">最佳 ' + best + '<em>' + stars + '</em></span>' +
          '<span class="de-go">开始 →</span></span>' +
          '</button>';
      }

      return '<button class="diff-card" data-level="' + d.id + '" style="--ink:' + d.ink + '">' +
        '<span class="diff-idx">0' + d.id + '</span>' +
        '<span class="diff-name">' + d.name + '</span>' +
        '<span class="diff-en">' + d.en + '</span>' +
        '<span class="diff-tag">' + TECH_TAG[d.id] + '</span>' +
        '<span class="diff-best">最佳 ' + best + '<em>' + stars + '</em></span>' +
        '</button>';
    }).join('');

    const sum = Store.summary();
    $('#foot-plays').textContent = sum.won;
    $('#foot-streak').textContent = Store.data.daily.streak || 0;
  }

  /* ============================================================
   * 开局
   * ============================================================ */

  function startGame(opts) {
    closeHint();
    state.hintCells = [];
    showScreen('game');

    const veil = $('#loading-veil');
    veil.hidden = false;
    $('#loading-text').textContent = '正在出题…';
    state.busy = true;

    // 让 loading 先画出来，再跑同步生成
    requestAnimationFrame(function () {
      setTimeout(function () {
        let gen = null;
        try {
          if (opts.mode === 'daily') gen = C.generateDaily(opts.day);
          else gen = C.generate(opts.level, { seed: opts.seed });
        } catch (e) {
          console.error(e);
        }

        if (!gen || !gen.solution) {
          veil.hidden = true;
          state.busy = false;
          toast('出题失败了，再来一次');
          nav('home');
          return;
        }

        const g = new SD.Game({
          puzzle: gen.puzzle,
          solution: gen.solution,
          difficulty: gen.difficulty,
          mode: opts.mode || 'classic',
          day: opts.day || null,
          onChange: onGameChange,
          onWin: onWin
        });
        g.ratingUsed = gen.rating ? gen.rating.used : {};

        state.game = g;
        state.lastLevel = g.difficulty.id;
        state.lastMode = g.mode;
        state.hintCells = [];

        $('#game-title').textContent = g.difficulty.name;
        $('#game-sub').textContent = (g.mode === 'daily' ? '每日挑战 · ' : '') +
          (81 - C.countEmpty(g.puzzle)) + ' 个提示数 · ' + TECH_TAG[g.difficulty.id];

        state.gameCells = state.gameCells.length ? state.gameCells : makeBoard($('#board'));
        veil.hidden = true;
        state.busy = false;
        enableBoard(true);
        renderGame();
        updateTimerUI();
        scheduleSave();
      }, 30);
    });
  }

  function resumeGame() {
    const saved = Store.loadGame();
    if (!saved) { toast('没有存档'); return; }
    const g = SD.Game.deserialize(saved, { onChange: onGameChange, onWin: onWin });
    if (!g) { toast('存档读不出来'); return; }

    closeHint();
    state.game = g;
    state.lastLevel = g.difficulty.id;
    state.lastMode = g.mode;
    state.hintCells = [];
    $('#game-title').textContent = g.difficulty.name;
    $('#game-sub').textContent = (g.mode === 'daily' ? '每日挑战 · ' : '') +
      (81 - C.countEmpty(g.puzzle)) + ' 个提示数';
    state.gameCells = state.gameCells.length ? state.gameCells : makeBoard($('#board'));
    showScreen('game');
    enableBoard(true);
    renderGame();
    updateTimerUI();
  }

  function enableBoard(on) {
    $('#board').classList.toggle('disabled', !on);
  }

  function onGameChange(g, extra) {
    renderGame();
    if (!g.finished) scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      if (state.game && !state.game.finished) Store.saveGame(state.game.serialize());
    }, 400);
  }

  /* ============================================================
   * 渲染对局
   * ============================================================ */

  function renderGame() {
    const g = state.game;
    if (!g) return;
    const cells = state.gameCells;
    const conflicts = g.conflicts();
    const wrong = Store.setting('strictErrors') ? g.wrongCells() : new Set();
    const sel = g.selected;
    const selVal = sel >= 0 ? g.grid[sel] : 0;
    const peers = sel >= 0 && Store.setting('highlightPeers') ? C.PEERS[sel] : null;
    const hintSet = new Set(state.hintCells);

    for (let i = 0; i < 81; i++) {
      const el = cells[i];
      const v = g.grid[i];
      const cl = el.classList;
      cl.toggle('given', !!g.given[i]);
      cl.toggle('user', !g.given[i] && !!v);
      cl.toggle('sel', i === sel);
      cl.toggle('peer', !!peers && peers.indexOf(i) >= 0);
      cl.toggle('same', !!(selVal && v === selVal && i !== sel));
      cl.toggle('conflict', conflicts.has(i));
      cl.toggle('wrong', wrong.has(i));
      cl.toggle('hint', hintSet.has(i) && !v);

      const vEl = el.firstElementChild;
      const txt = v ? String(v) : '';
      if (vEl.textContent !== txt) vEl.textContent = txt;

      if (!v && g.notes[i]) paintNotes(el, g.notes[i]);
      else clearNotes(el);
    }

    updateStatsUI();
    renderNumpad();
    renderProgress();
  }

  function updateStatsUI() {
    const g = state.game;
    if (!g) return;
    $('#stat-time').textContent = fmtTime(g.elapsed);
    $('#stat-mistake').textContent = g.mistakes;
    $('#stat-hint').textContent = g.hints;
    $('#note-btn').classList.toggle('on', g.noteMode);
  }

  function updateTimerUI() {
    const g = state.game;
    if (!g) return;
    $('#stat-time').textContent = fmtTime(g.elapsed);
  }

  function renderNumpad() {
    const g = state.game;
    if (!g) return;
    const host = $('#numpad');
    if (!host.children.length) {
      for (let v = 1; v <= 9; v++) {
        const b = document.createElement('button');
        b.className = 'num';
        b.dataset.v = String(v);
        b.innerHTML = '<b>' + v + '</b><i>9</i>';
        host.appendChild(b);
      }
    }
    for (let v = 1; v <= 9; v++) {
      const b = host.children[v - 1];
      const left = g.remaining(v);
      b.querySelector('i').textContent = left > 0 ? left : '';
      b.classList.toggle('done', left <= 0);
      b.classList.toggle('active', g.selected >= 0 && g.grid[g.selected] === v);
    }
  }

  function renderProgress() {
    const g = state.game;
    if (!g) return;
    const p = g.progress();
    const st = Store.data.stats[g.difficulty.key];
    const pct = Math.round(p.ratio * 100);
    $('#progress-card').innerHTML =
      '<div class="prog-top">' +
      '<div class="prog-ring" style="--p:' + p.ratio.toFixed(3) + '"><span>' + pct + '%</span></div>' +
      '<div class="prog-info"><b>' + p.filled + ' / ' + p.total + '</b><span>已填</span></div>' +
      '</div>' +
      '<div class="prog-meta">' +
      '<span>本档最佳 ' + (st && st.bestTime != null ? fmtTime(st.bestTime) : '—') + '</span>' +
      '<span>' + (g.mode === 'daily' ? '每日' : '练习') + '</span>' +
      '</div>';
  }

  /* ============================================================
   * 输入
   * ============================================================ */

  function inputValue(v) {
    const g = state.game;
    if (!g || g.finished || state.busy) return;
    if (g.selected < 0) { toast('先点一个格子'); return; }
    if (state.hintOpen) closeHint();
    const r = g.enter(v);
    if (r.type === 'wrong') { sfx.bad(); shake(r.cell); }
    else if (r.type === 'ok') { sfx.ok(); pop(r.cell); state.hintCells = []; }
    else if (r.type === 'note') { sfx.note(); }
    else if (r.type === 'erase') { state.hintCells = []; }
  }

  function doUndo() {
    const g = state.game;
    if (!g) return;
    if (!g.undo()) { toast('没有可撤销的了'); return; }
    state.hintCells = [];
    toast('撤销了一步', 900);
  }

  function doRedo() {
    const g = state.game;
    if (!g) return;
    if (!g.redo()) { toast('没有可重做的了'); return; }
    state.hintCells = [];
  }

  function toggleNote() {
    const g = state.game;
    if (!g) return;
    g.noteMode = !g.noteMode;
    updateStatsUI();
    toast(g.noteMode ? '笔记模式：填的是候选数' : '正常模式', 1100);
  }

  function doPause() {
    const g = state.game;
    if (!g || g.finished) return;
    if (g.paused) { g.resume(); $('#pause-veil').hidden = true; }
    else { g.pause(); $('#pause-veil').hidden = false; }
    renderGame();
  }

  /* ============================================================
   * 提示
   * ============================================================ */

  function openHint() {
    const g = state.game;
    if (!g || g.finished) return;
    if (state.hintOpen) { closeHint(); return; }
    state.hintOpen = true;
    const h = g.nextHint();
    state.hintCells = h.cells || [];
    renderGame();
    renderHintPop(h);
    $('#hint-popover').hidden = false;
    if (h.level === 3) finishHint(h);
  }

  function hintNext() {
    const g = state.game;
    if (!g) return;
    const h = g.nextHint();
    state.hintCells = h.cells || [];
    renderGame();
    renderHintPop(h);
    if (h.level === 3) { finishHint(h); }
  }

  function renderHintPop(h) {
    state.hintLevel = h.level;
    $('#pop-kicker').textContent = '提示 ' + h.level + ' / 3';
    $('#pop-title').textContent = h.label;
    $('#pop-body').textContent = h.text;
    $('#pop-next').textContent = h.level >= 3 ? '知道了' : '再看一点';
    $('#pop-next').disabled = false;

    // 右侧留痕
    const card = $('#hint-card');
    card.hidden = false;
    card.innerHTML = '<div class="side-kicker">刚才的提示</div>' +
      '<div class="side-title">' + esc(h.label) + '</div>' +
      '<p class="muted">' + esc(h.text) + '</p>';
  }

  function finishHint(h) {
    if (h.cell != null && h.cell >= 0) {
      pop(h.cell);
      sfx.ok();
      state.hintCells = h.cells || [];
      renderGame();
      setTimeout(function () {
        closeHint();
        state.hintCells = [];
        renderGame();
      }, 2400);
      return;
    }
    state.hintCells = h.cells || [];
    renderGame();
  }

  function closeHint() {
    state.hintOpen = false;
    state.hintLevel = 0;
    $('#hint-popover').hidden = true;
  }

  /* ============================================================
   * 胜利
   * ============================================================ */

  let winCleanup = null;

  function onWin(result) {
    Store.clearGame();
    clearTimeout(state.saveTimer);

    const prev = Store.statFor(result.diffKey);
    const prevBest = prev.bestTime;
    const unlocked = Store.recordWin(result);

    sfx.win();
    burst();

    $('#win-eyebrow').textContent = result.mode === 'daily' ? '每日挑战 · 完成' : '完成';
    $('#win-title').textContent = result.stars === 3 ? '这一局，干净。' : (result.stars === 2 ? '稳稳收下。' : '做完了，就是胜利。');

    $('#win-stars').innerHTML = starHTML(result.stars);

    const usedNames = Object.keys(result.used || {})
      .filter(function (k) { return C.TECH_BY_NAME[k]; })
      .sort(function (a, b) { return C.TECH_BY_NAME[b].level - C.TECH_BY_NAME[a].level; })
      .slice(0, 3)
      .map(function (k) { return C.TECH_BY_NAME[k].label; });

    $('#win-grid').innerHTML =
      cell('用时', fmtTime(result.timeSec)) +
      cell('得分', fmtNum(result.score)) +
      cell('失误', String(result.mistakes)) +
      cell('提示', String(result.hints));

    let note = '';
    if (prevBest == null) note = '第一次完成「' + result.diffName + '」。';
    else if (result.timeSec < prevBest) note = '新纪录，比之前最快的一次快了 ' + (prevBest - result.timeSec) + ' 秒。';
    else note = '比你的最好成绩慢 ' + (result.timeSec - prevBest) + ' 秒。';
    if (usedNames.length) note += ' 这局用到的技巧：' + usedNames.join('、') + '。';
    $('#win-note').textContent = note;

    const modal = $('#win-modal');
    modal.hidden = false;
    winCleanup = function () { modal.hidden = true; };

    if (unlocked.length) {
      setTimeout(function () {
        const names = unlocked.map(function (id) {
          const a = Store.ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
          return a ? a.name : id;
        });
        toast('解锁成就：' + names.join('、'), 3200);
        sfx.unlock();
      }, 700);
    }

    state.lastResult = result;
  }

  function cell(k, v) {
    return '<div class="win-cell"><i>' + k + '</i><b>' + esc(v) + '</b></div>';
  }

  function burst() {
    const host = $('#confetti');
    host.innerHTML = '';
    const colors = ['#b0703c', '#7d9a6a', '#6f8fa0', '#c9a227', '#9a5f7a'];
    for (let i = 0; i < 34; i++) {
      const p = document.createElement('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[(Math.random() * colors.length) | 0];
      p.style.animationDelay = (Math.random() * 0.5) + 's';
      p.style.animationDuration = (1.1 + Math.random() * 0.9) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      p.style.width = (4 + Math.random() * 6) + 'px';
      p.style.height = (6 + Math.random() * 8) + 'px';
      host.appendChild(p);
    }
    setTimeout(function () { host.innerHTML = ''; }, 2600);
  }

  function shareText(result) {
    const lines = [];
    if (result.mode === 'daily') lines.push('纸上数独 · 每日挑战 ' + (result.day || Store.todayStr()));
    else lines.push('纸上数独 · ' + result.diffName);
    lines.push(fmtTime(result.timeSec) + ' · ' + '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars) +
      ' · ' + fmtNum(result.score) + ' 分');
    if (result.mistakes || result.hints) {
      lines.push('失误 ' + result.mistakes + ' · 提示 ' + result.hints);
    }
    return lines.join('\n');
  }

  function copyText(text) {
    const done = function () { toast('复制好了'); };
    const fail = function () { toast('复制失败，手动选一下吧'); };
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : fail(); });
    } else {
      legacyCopy(text) ? done() : fail();
    }
  }

  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ============================================================
   * 战绩
   * ============================================================ */

  function renderStats() {
    const sum = Store.summary();

    $('#stat-overview').innerHTML = [
      block(String(sum.won), '完成局数'),
      block(fmtTime(sum.totalTime), '累计用时'),
      block(String(sum.dailyStreak), '连续打卡'),
      block(sum.achievements + '/' + sum.totalAchievements, '成就')
    ].join('');

    let rows = '<thead><tr><th>难度</th><th>完成</th><th>最佳用时</th><th>最高分</th><th>连胜</th></tr></thead><tbody>';
    C.DIFFS.forEach(function (d) {
      const s = Store.data.stats[d.key] || {};
      rows += '<tr><td><span class="dot" style="background:' + d.ink + '"></span>' + d.name + '</td>' +
        '<td>' + (s.won || 0) + '</td>' +
        '<td>' + (s.bestTime != null ? fmtTime(s.bestTime) : '—') + '</td>' +
        '<td>' + (s.bestScore ? fmtNum(s.bestScore) : '—') + '</td>' +
        '<td>' + (s.streak || 0) + '</td></tr>';
    });
    rows += '</tbody>';
    $('#diff-table').innerHTML = rows;

    const hist = Store.data.history.slice(0, 8);
    if (!hist.length) {
      $('#recent-list').innerHTML = '<p class="muted empty">还没有记录。完成第一局就会出现在这里。</p>';
    } else {
      $('#recent-list').innerHTML = hist.map(function (h) {
        return '<div class="recent-row">' +
          '<span class="recent-day">' + (h.day || '') + '</span>' +
          '<span class="recent-diff">' + (h.diffName || '') + '</span>' +
          '<span class="recent-stars">' + '★'.repeat(h.stars || 0) + '</span>' +
          '<span class="recent-time">' + fmtTime(h.timeSec || 0) + '</span>' +
          '<span class="recent-score">' + fmtNum(h.score || 0) + '</span>' +
          '</div>';
      }).join('');
    }

    $('#ach-grid').innerHTML = Store.achievementList().map(function (a) {
      return '<div class="ach' + (a.unlocked ? ' on' : '') + '">' +
        '<span class="ach-mark">' + (a.unlocked ? '✓' : '·') + '</span>' +
        '<b>' + esc(a.name) + '</b>' +
        '<i>' + esc(a.desc) + '</i>' +
        '</div>';
    }).join('');
  }

  function block(v, k) {
    return '<div class="stat-block"><b>' + v + '</b><i>' + k + '</i></div>';
  }

  /* ============================================================
   * 教程（课程目录）
   * ============================================================ */

  function renderCodex() {
    const prog = Store.lessonProgress();
    $('#course-progress').innerHTML =
      '<div class="cp-top"><span class="cp-label">学习进度</span><b>' + prog.done + ' / ' + prog.total + '</b></div>' +
      '<div class="bar"><span style="width:' + Math.round((prog.done / prog.total) * 100) + '%"></span></div>' +
      '<p class="cp-hint">' + (prog.done === 0
        ? '从第 1 课开始。每节课只教一件事，十分钟以内。'
        : (prog.done >= prog.total
          ? '全部学完了。去「困难」里实战吧，卡住就回来查速查表。'
          : '接着上次的往下。不用记笔记，忘了随时回来重看。')) + '</p>';

    $('#chapter-list').innerHTML = SD.tutorial.CHAPTERS.map(function (ch) {
      const list = SD.tutorial.LESSONS.filter(function (l) { return l.ch === ch.id; });
      const done = list.filter(function (l) { return Store.lessonDone(l.id); }).length;
      return '<section class="chapter">' +
        '<div class="chapter-head">' +
        '<span class="ch-id">' + String(ch.id).padStart(2, '0') + '</span>' +
        '<div class="ch-text"><h3>' + esc(ch.title) + '</h3><p>' + esc(ch.desc) + '</p></div>' +
        '<span class="ch-count">' + done + ' / ' + list.length + '</span>' +
        '</div>' +
        '<div class="lesson-rows">' +
        list.map(function (l) {
          const isDone = Store.lessonDone(l.id);
          return '<button class="lesson-row' + (isDone ? ' done' : '') + '" data-lesson="' + l.id + '">' +
            '<span class="lr-mark">' + (isDone ? '✓' : '○') + '</span>' +
            '<span class="lr-main"><b>' + esc(l.title) + '</b><em>' + esc(l.goal) + '</em></span>' +
            '<span class="lr-min">' + l.min + ' 分钟</span>' +
            '<span class="lr-go">→</span>' +
            '</button>';
        }).join('') +
        '</div></section>';
    }).join('');

    /* 难度对照 */
    let rows = '<thead><tr><th>档位</th><th>这一档最多会用到</th></tr></thead><tbody>';
    const byLevel = {};
    C.TECHNIQUES.forEach(function (t) {
      (byLevel[t.level] = byLevel[t.level] || []).push(t.label);
    });
    const names = ['入门', '简单', '中等', '困难', '专家', '大师', '极限'];
    for (let l = 1; l <= 5; l++) {
      rows += '<tr><td>' + names[l - 1] + '</td><td>' + (byLevel[l] || []).join('、') + '</td></tr>';
    }
    rows += '<tr><td>大师</td><td>上面全部用尽仍推不动——给一格正确答案就能一路推完</td></tr>';
    rows += '<tr><td>极限</td><td>给一格还不够，得连着试探两次以上</td></tr>';
    rows += '</tbody>';
    $('#level-table').innerHTML = rows;

    /* 技巧速查 */
    let trows = '<thead><tr><th>技巧</th><th>一句话</th><th>什么时候用</th></tr></thead><tbody>';
    SD.tutorial.TECH_REF.forEach(function (r) {
      const t = C.TECH_BY_NAME[r.tech];
      if (!t) return;
      trows += '<tr><td>' + esc(t.label) + '</td><td>' + esc(r.one) +
        '</td><td class="muted">' + esc(r.when) + '</td></tr>';
    });
    trows += '</tbody>';
    $('#tech-table').innerHTML = trows;
  }

  /* ============================================================
   * 上课
   * ============================================================ */

  function fmt(text) {
    if (!text) return '';
    let s = String(text);
    s = s.replace(/<kbd>(.*?)<\/kbd>/g, function (_, k) { return '\u0001' + k + '\u0002'; });
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\u0001(.*?)\u0002/g, '<kbd>$1</kbd>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function ensureLessonBoard(n) {
    if (state.lessonBoardN !== n) {
      state.lessonCells = makeBoard($('#lesson-board'), n);
      state.lessonBoardN = n;
    }
    $('#lesson-board-shell').classList.toggle('mini', n === 4);
  }

  function openLesson(id) {
    const lesson = SD.tutorial.byId[id];
    if (!lesson) { nav('codex'); return; }

    clearTimeout(state.lessonWatchTimer);
    state.lesson = lesson;
    state.lessonSteps = [];
    state.lessonIdx = 0;
    state.lessonSolved = false;
    state.lessonAttempts = 0;
    state.lessonAnswerShown = false;
    state.lessonPlaced = false;
    state.lessonNextId = null;

    showScreen('lesson');

    const ch = SD.tutorial.chapterOf(lesson.ch);
    $('#lesson-kicker').textContent = '第 ' + ch.id + ' 章 · ' + ch.title;
    $('#lesson-title').textContent = lesson.title;
    $('#lesson-goal').textContent = '学完你能：' + lesson.goal;
    $('#lesson-caption').textContent = '';
    $('#step-label').textContent = '';
    $('#step-instruction').textContent = '';
    $('#step-body').innerHTML = '';
    $('#step-options').innerHTML = '';
    $('#step-progress').innerHTML = '';
    $('#lesson-feedback').className = 'lesson-feedback';
    $('#lesson-feedback').innerHTML = '';
    $('#lesson-continue').hidden = true;
    $('#lesson-reveal').hidden = true;
    $('#lesson-next').hidden = true;
    $('#lesson-left').hidden = false;
    $('#lesson-loading').hidden = false;

    setTimeout(function () {
      let built = null;
      try { built = SD.tutorial.materialize(lesson, 0); } catch (e) { console.error(e); }
      $('#lesson-loading').hidden = true;

      if (!built) {
        $('#lesson-feedback').className = 'lesson-feedback bad';
        $('#lesson-feedback').textContent = '这一课的例子没生成出来（很少见）。退回去再进一次就好。';
        return;
      }
      state.lessonSteps = built.steps;
      state.lessonIdx = 0;
      renderStep();
    }, 30);
  }

  function renderStep() {
    const steps = state.lessonSteps;
    const i = state.lessonIdx;
    if (!steps.length) return;
    if (i >= steps.length) return finishLesson();

    const st = steps[i];
    clearTimeout(state.lessonWatchTimer);
    state.lessonSolved = false;
    state.lessonAttempts = 0;
    state.lessonAnswerShown = false;
    state.lessonPlaced = false;

    $('#step-label').textContent = '第 ' + (i + 1) + ' 步 / 共 ' + steps.length + ' 步';
    $('#step-progress').innerHTML = steps.map(function (_, k) {
      return '<span class="sp-dot' + (k < i ? ' done' : '') + (k === i ? ' cur' : '') + '"></span>';
    }).join('');

    $('#lesson-feedback').className = 'lesson-feedback';
    $('#lesson-feedback').innerHTML = '';
    $('#step-options').innerHTML = '';
    $('#lesson-continue').hidden = true;
    $('#lesson-reveal').hidden = true;
    $('#lesson-next').hidden = true;
    $('#lesson-caption').textContent = st.caption || '';

    const cont = $('#lesson-continue');

    if (st.kind === 'text' || st.kind === 'summary') {
      $('#step-instruction').innerHTML = fmt(st.title || '');
      $('#step-body').innerHTML = fmt(st.body || '');
      cont.hidden = false;
      cont.textContent = (i === steps.length - 1) ? '完成这一课' : '继续';
      state.lessonSolved = true;
    } else if (st.kind === 'watch') {
      $('#step-instruction').textContent = '看一遍';
      $('#step-body').innerHTML = fmt(st.body || '');
    } else if (st.kind === 'find' || st.kind === 'click') {
      $('#step-instruction').textContent = st.instruction || '';
      $('#step-body').innerHTML = '';
      if (st.roundLabel) $('#step-label').textContent = st.roundLabel;
    } else if (st.kind === 'quiz') {
      $('#step-instruction').textContent = st.instruction || '';
      $('#step-body').innerHTML = '';
      renderQuiz(st);
    }

    if (st.kind === 'find' || st.kind === 'click') {
      $('#lesson-reveal').hidden = false;
      $('#lesson-reveal').textContent = '看答案';
    }

    renderLessonBoard(st);
    if (st.kind === 'watch') startWatch(st);
  }

  function renderQuiz(st) {
    $('#step-options').innerHTML = st.options.map(function (o, k) {
      return '<button class="opt" data-opt="' + k + '">' + esc(o) + '</button>';
    }).join('');
  }

  function startWatch(st) {
    state.lessonWatchTimer = setTimeout(function () {
      state.lessonPlaced = true;
      renderLessonBoard(st);
      const fb = $('#lesson-feedback');
      fb.className = 'lesson-feedback good';
      fb.innerHTML = '<b>看到了吗</b>' + fmt(st.ex.explain);
      const cont = $('#lesson-continue');
      cont.hidden = false;
      cont.textContent = '轮到我';
      sfx.ok();
    }, 1200);
  }

  /* ---------- 棋盘绘制 ---------- */

  function renderLessonBoard(st) {
    const hasBoard = !!(st.board || st.ex);
    $('#lesson-left').hidden = !hasBoard;
    $('#lesson-wrap').classList.toggle('no-board', !hasBoard);
    if (st.board) { paintStatic(st); return; }
    if (st.ex) { paintExBoard(st); return; }
  }

  function paintStatic(st) {
    const b = st.board;
    const n = b.n;
    const box = n === 4 ? 2 : 3;
    ensureLessonBoard(n);
    const cells = state.lessonCells;

    const bright = new Set();
    (st.targets || []).forEach(function (i) { bright.add(i); });
    (st.highlight || []).forEach(function (i) { bright.add(i); });
    (st.focus || []).forEach(function (i) { bright.add(i); });

    // 单选题只有一个焦点格时，行/列/宫就是解题的证据，必须保持明亮
    const peersCell = (st.peersOf != null) ? st.peersOf
      : ((st.kind === 'quiz' && st.focus && st.focus.length === 1) ? st.focus[0] : null);

    let pr = -1, pc = -1, br0 = 0, bc0 = 0;
    if (peersCell != null) {
      pr = (peersCell / n) | 0; pc = peersCell % n;
      br0 = Math.floor(pr / box) * box;
      bc0 = Math.floor(pc / box) * box;
      for (let k = 0; k < n * n; k++) {
        const rr = (k / n) | 0, cc = k % n;
        if (rr === pr || cc === pc ||
            (rr >= br0 && rr < br0 + box && cc >= bc0 && cc < bc0 + box)) bright.add(k);
      }
    }

    const dim = bright.size > 0;
    for (let i = 0; i < n * n; i++) {
      const el = cells[i];
      const v = b.cells[i];
      const cl = el.classList;
      cl.toggle('given', !!v);
      cl.toggle('user', false);
      cl.toggle('sel', false);
      cl.toggle('peer', false);
      cl.toggle('same', false);
      cl.toggle('conflict', false);
      cl.toggle('wrong', false);
      cl.toggle('hint', false);
      cl.toggle('target', false);
      cl.toggle('good', !!(state.lessonSolved && st.targets && st.targets.indexOf(i) >= 0));
      cl.toggle('dim', dim && !bright.has(i));
      el.firstElementChild.textContent = v ? String(v) : '';
      clearNotes(el);
    }

    if (peersCell != null) {
      for (let k = 0; k < n * n; k++) {
        if (k === peersCell) continue;
        const rr = (k / n) | 0, cc = k % n;
        if (rr === pr || cc === pc ||
            (rr >= br0 && rr < br0 + box && cc >= bc0 && cc < bc0 + box)) {
          cells[k].classList.add('peer');
        }
      }
      cells[peersCell].classList.add('sel');
    }
    (st.focus || []).forEach(function (i) { if (cells[i]) cells[i].classList.add('sel'); });
  }

  function paintExBoard(st) {
    const ex = st.ex;
    ensureLessonBoard(9);
    const cells = state.lessonCells;
    const g = Uint8Array.from(ex.before);

    const revealed = (st.kind === 'watch' && state.lessonPlaced) ||
      (st.kind === 'find' && state.lessonSolved);

    if (revealed && ex.step.place.length) {
      ex.step.place.forEach(function (p) { g[p[0]] = p[1]; });
    }

    const bright = new Set();
    ex.focus.forEach(function (i) { bright.add(i); });
    ex.accept.forEach(function (i) { bright.add(i); });
    ex.targets.forEach(function (i) { bright.add(i); });
    if (ex.unit != null) C.UNITS[ex.unit].forEach(function (i) { bright.add(i); });
    if (ex.tech === 'nakedSingle' || ex.tech === 'hiddenSingle') {
      C.PEERS[ex.accept[0]].forEach(function (i) { bright.add(i); });
    }

    for (let i = 0; i < 81; i++) {
      const el = cells[i];
      const v = g[i];
      const cl = el.classList;
      cl.toggle('given', !!ex.puzzle[i]);
      cl.toggle('user', !ex.puzzle[i] && !!v);
      cl.toggle('sel', st.kind === 'watch' && ex.focus.indexOf(i) >= 0 && !v);
      cl.toggle('peer', false);
      cl.toggle('same', false);
      cl.toggle('conflict', false);
      cl.toggle('wrong', false);
      cl.toggle('dim', !bright.has(i));
      cl.toggle('hint', revealed && ex.focus.indexOf(i) >= 0 && !v);
      cl.toggle('target', revealed && ex.targets.indexOf(i) >= 0 && !g[i]);
      cl.toggle('good', revealed && ex.accept.indexOf(i) >= 0);

      el.firstElementChild.textContent = v ? String(v) : '';
      if (!v && ex.cand[i]) paintNotes(el, ex.cand[i]);
      else clearNotes(el);
    }
  }

  /* ---------- 互动 ---------- */

  function lessonClick(i) {
    const st = state.lessonSteps[state.lessonIdx];
    if (!st || state.lessonSolved) return;

    if (st.kind === 'click') {
      if ((st.targets || []).indexOf(i) >= 0) succeedStatic(st);
      else failStatic(st);
      return;
    }
    if (st.kind === 'find') {
      if (st.ex.accept.indexOf(i) >= 0) succeedFind(st);
      else failFind(st, i);
    }
  }

  function shakeCell(i) {
    const el = state.lessonCells[i];
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 420);
  }

  function succeedStatic(st) {
    state.lessonSolved = true;
    paintStatic(st);
    const fb = $('#lesson-feedback');
    fb.className = 'lesson-feedback good';
    fb.innerHTML = '<b>就是这个。</b>' + fmt(st.explain || '');
    const cont = $('#lesson-continue');
    cont.hidden = false;
    cont.textContent = '继续';
    $('#lesson-reveal').hidden = true;
    sfx.ok();
  }

  function failStatic(st) {
    const fb = $('#lesson-feedback');
    fb.className = 'lesson-feedback bad';
    fb.textContent = '不是这一格。' + (st.hint || '');
  }

  function succeedFind(st) {
    state.lessonSolved = true;
    paintExBoard(st);
    const fb = $('#lesson-feedback');
    fb.className = 'lesson-feedback good';
    fb.innerHTML = '<b>对。</b>' + fmt(st.ex.explain);
    const cont = $('#lesson-continue');
    cont.hidden = false;
    cont.textContent = '继续';
    $('#lesson-reveal').hidden = true;
    sfx.ok();
  }

  function failFind(st, i) {
    state.lessonAttempts++;

    if (state.lessonAttempts === 1) {
      shakeCell(i);
    } else {
      const empty = !st.ex.before[i];
      const cands = empty && st.ex.cand[i] ? C.bits(st.ex.cand[i]) : [];
      if (cands.length > 1) {
        const fb = $('#lesson-feedback');
        fb.className = 'lesson-feedback bad';
        fb.textContent = '这一格有 ' + cands.length + ' 个候选（' + cands.join('、') + '），不是我们要找的那一格。';
        if (state.lessonAttempts >= 2) {
          $('#lesson-reveal').hidden = false;
          $('#lesson-reveal').textContent = '直接看答案';
        }
        return;
      }
    }

    const fb = $('#lesson-feedback');
    fb.className = 'lesson-feedback bad';
    fb.innerHTML = (state.lessonAttempts === 1 ? '不是这里。' : '') + fmt(st.hint || '');
    if (state.lessonAttempts >= 2) {
      $('#lesson-reveal').hidden = false;
      $('#lesson-reveal').textContent = '直接看答案';
    }
  }

  function answerQuiz(k) {
    const st = state.lessonSteps[state.lessonIdx];
    if (!st || st.kind !== 'quiz' || state.lessonSolved) return;

    const opts = $$('#step-options .opt');
    if (k === st.answer) {
      state.lessonSolved = true;
      opts.forEach(function (b, idx) {
        b.classList.add(idx === k ? 'right' : 'mute');
        b.disabled = true;
      });
      const fb = $('#lesson-feedback');
      fb.className = 'lesson-feedback good';
      fb.innerHTML = '<b>对。</b>' + fmt(st.explain || '');
      const cont = $('#lesson-continue');
      cont.hidden = false;
      cont.textContent = '继续';
      if (st.board) paintStatic(st);
      sfx.ok();
    } else {
      opts[k].classList.add('wrong');
      const fb = $('#lesson-feedback');
      fb.className = 'lesson-feedback bad';
      fb.textContent = '再想一下——把行、列、宫三处的数都划掉再数一遍。';
    }
  }

  function revealAnswer() {
    const st = state.lessonSteps[state.lessonIdx];
    if (!st || state.lessonSolved) return;
    if (st.kind !== 'find' && st.kind !== 'click') return;

    state.lessonAnswerShown = true;
    state.lessonSolved = true;

    if (st.kind === 'click') paintStatic(st);
    else paintExBoard(st);

    const fb = $('#lesson-feedback');
    fb.className = 'lesson-feedback';
    fb.innerHTML = '<b>答案标出来了。</b>' + fmt((st.ex || {}).explain || st.explain || '');
    const cont = $('#lesson-continue');
    cont.hidden = false;
    cont.textContent = '继续';
    $('#lesson-reveal').hidden = true;
  }

  function continueStep() {
    if (state.lessonIdx >= state.lessonSteps.length - 1) { finishLesson(); return; }
    state.lessonIdx++;
    renderStep();
  }

  function finishLesson() {
    const lesson = state.lesson;
    if (!lesson) { nav('codex'); return; }
    Store.markLesson(lesson.id);

    const list = SD.tutorial.LESSONS;
    let idx = -1;
    for (let k = 0; k < list.length; k++) if (list[k].id === lesson.id) idx = k;
    const next = idx >= 0 ? list[idx + 1] : null;
    state.lessonNextId = next ? next.id : null;

    $('#step-label').textContent = '完成';
    $('#step-instruction').textContent = '这一课过了。';
    $('#step-body').innerHTML = fmt(lesson.goal || '');
    $('#step-options').innerHTML = '';
    $('#lesson-feedback').className = 'lesson-feedback good';
    $('#lesson-feedback').innerHTML = '<b>✓ ' + esc(lesson.title) + '</b>' +
      '<p class="muted">' + (next ? '下一课：' + esc(next.title) : '你已经学完所有课了，去实战吧。') + '</p>';
    $('#lesson-continue').hidden = true;
    $('#lesson-reveal').hidden = true;
    const n = $('#lesson-next');
    n.hidden = false;
    n.textContent = next ? '下一课 →' : '回到课程目录';
    $('#lesson-left').hidden = true;
    $('#lesson-wrap').classList.add('no-board');
    sfx.ok();
  }

  function nextLesson() {
    if (!state.lessonNextId) { nav('codex'); return; }
    openLesson(state.lessonNextId);
  }

  /* ============================================================
   * 设置
   * ============================================================ */

  function renderSettings() {
    const s = Store.data.settings;
    const rows = [
      { key: 'strictErrors', name: '错误即时标红', desc: '填错的数字马上标红并计一次失误。关掉后不标红，但仍会计失误。' },
      { key: 'autoNotes', name: '自动清理笔记', desc: '填入一个数后，同行同列同宫里这个数的候选笔记自动消失。' },
      { key: 'highlightPeers', name: '高亮同行同列同宫', desc: '选中格子时，把它的 20 个邻居也轻轻标出来。' },
      { key: 'sound', name: '音效', desc: '落子、出错、通关的轻音。默认关闭。' }
    ];

    const head = '<h3>对局</h3>';
    const body = rows.map(function (r) {
      return '<div class="set-row">' +
        '<div class="set-txt"><b>' + r.name + '</b><i>' + r.desc + '</i></div>' +
        '<button class="switch' + (s[r.key] ? ' on' : '') + '" data-set="' + r.key + '" aria-pressed="' + !!s[r.key] + '"><span></span></button>' +
        '</div>';
    }).join('');
    $('#settings-card').innerHTML = head + body;
  }

  /* ============================================================
   * 事件绑定
   * ============================================================ */

  function bind() {
    document.addEventListener('click', function (e) {
      const navEl = e.target.closest('[data-nav]');
      if (navEl) {
        e.preventDefault();
        nav(navEl.dataset.nav);
        return;
      }

      const actEl = e.target.closest('[data-act]');
      if (actEl) {
        handleAction(actEl.dataset.act, actEl);
        return;
      }

      const lessonBtn = e.target.closest('[data-lesson]');
      if (lessonBtn) {
        openLesson(lessonBtn.dataset.lesson);
        return;
      }

      const opt = e.target.closest('[data-opt]');
      if (opt) {
        answerQuiz(Number(opt.dataset.opt));
        return;
      }

      const diffBtn = e.target.closest('.diff-card');
      if (diffBtn) {
        startGame({ level: Number(diffBtn.dataset.level) });
        return;
      }

      const num = e.target.closest('.num');
      if (num) {
        inputValue(Number(num.dataset.v));
        return;
      }

      const sw = e.target.closest('.switch');
      if (sw) {
        const key = sw.dataset.set;
        Store.setting(key, !Store.setting(key));
        renderSettings();
        if (key === 'sound') tone(520, 0.08, 'sine');
        return;
      }

      // 棋盘点击
      const cellEl = e.target.closest('.cell');
      if (cellEl) {
        const i = Number(cellEl.dataset.i);
        if (cellEl.closest('#board')) {
          const g = state.game;
          if (g && !g.paused && !g.finished) { g.select(i); }
        } else if (cellEl.closest('#lesson-board')) {
          lessonClick(i);
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (state.screen !== 'game' || !state.game) return;
      const g = state.game;
      const k = e.key;

      if (e.ctrlKey || e.metaKey) {
        if (k.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
        if (k.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
        return;
      }

      if (k >= '1' && k <= '9') { e.preventDefault(); inputValue(Number(k)); return; }
      if (k === 'Backspace' || k === 'Delete' || k === ' ' || k === '0') {
        e.preventDefault();
        if (g.selected >= 0) { g.erase(); sfx.note(); }
        return;
      }
      if (k === 'n' || k === 'N') { e.preventDefault(); toggleNote(); return; }
      if (k === 'h' || k === 'H') { e.preventDefault(); openHint(); return; }
      if (k === 'ArrowUp') { e.preventDefault(); g.move(-1, 0); return; }
      if (k === 'ArrowDown') { e.preventDefault(); g.move(1, 0); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); g.move(0, -1); return; }
      if (k === 'ArrowRight') { e.preventDefault(); g.move(0, 1); return; }
      if (k === 'Escape') { closeHint(); }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.game && !state.game.finished) {
        state.game.pause();
        $('#pause-veil').hidden = false;
        renderGame();
      }
    });

    root.addEventListener('beforeunload', function () {
      if (state.game && !state.game.finished) Store.saveGame(state.game.serialize());
    });

    const fileInput = $('#import-file');
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        const ok = Store.importJSON(String(reader.result));
        toast(ok ? '导入成功' : '这个文件读不出来');
        if (ok) { renderSettings(); renderHome(); }
      };
      reader.readAsText(f);
      fileInput.value = '';
    });
  }

  function handleAction(act, el) {
    switch (act) {
      case 'to-home':
        if (state.game && !state.game.finished) Store.saveGame(state.game.serialize());
        state.game = null;
        nav('home');
        break;
      case 'pause': doPause(); break;
      case 'unpause':
        if (state.game) { state.game.resume(); $('#pause-veil').hidden = true; renderGame(); }
        break;
      case 'undo': doUndo(); break;
      case 'redo': doRedo(); break;
      case 'erase':
        if (state.game && state.game.selected >= 0) { state.game.erase(); sfx.note(); }
        else toast('先点一个格子');
        break;
      case 'note': toggleNote(); break;
      case 'hint': openHint(); break;
      case 'hint-next':
        if (state.hintLevel >= 3) closeHint();
        else hintNext();
        break;
      case 'hint-close': closeHint(); break;

      case 'daily-start':
        startGame({ level: C.dailyConfig(Store.todayStr()).level, mode: 'daily', day: Store.todayStr() });
        break;
      case 'daily-continue': resumeGame(); break;
      case 'daily-again':
        startGame({ level: C.dailyConfig(Store.todayStr()).level, mode: 'daily', day: Store.todayStr() });
        break;
      case 'daily-share': {
        const r = Store.data.daily.done[Store.todayStr()];
        if (r) copyText('纸上数独 · 每日挑战 ' + Store.todayStr() + '\n' + fmtTime(r.timeSec) + ' · ' + '★'.repeat(r.stars));
        break;
      }
      case 'resume': resumeGame(); break;
      case 'discard':
        Store.clearGame();
        renderHome();
        toast('存档已清掉');
        break;

      case 'win-again':
        if (winCleanup) winCleanup();
        if (state.lastMode === 'daily') startGame({ level: C.dailyConfig(Store.todayStr()).level, mode: 'daily', day: Store.todayStr() });
        else startGame({ level: state.lastLevel });
        break;
      case 'win-share':
        if (state.lastResult) copyText(shareText(state.lastResult));
        break;
      case 'win-home':
        if (winCleanup) winCleanup();
        state.game = null;
        nav('home');
        break;

      case 'lesson-back': nav('codex'); break;
      case 'lesson-continue': continueStep(); break;
      case 'lesson-reveal': revealAnswer(); break;
      case 'lesson-next': nextLesson(); break;

      case 'export': {
        const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'paper-sudoku-backup-' + Store.todayStr() + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        break;
      }
      case 'import': $('#import-file').click(); break;
      case 'reset':
        if (root.confirm('确定清空所有战绩、成就和进度？这个动作没法撤销。')) {
          Store.resetAll();
          renderSettings();
          renderHome();
          toast('已清空');
        }
        break;
      default:
        break;
    }
  }

  /* ============================================================
   * 启动
   * ============================================================ */

  function init() {
    state.gameCells = makeBoard($('#board'));
    state.lessonCells = makeBoard($('#lesson-board'));
    bind();
    showScreen('home');
    renderHome();
    renderSettings();

    setInterval(function () {
      const g = state.game;
      if (!g || g.finished || g.paused) return;
      if (state.screen !== 'game') return;
      g.tick();
      updateTimerUI();
    }, 1000);

    if (Store.isBroken()) {
      setTimeout(function () { toast('浏览器不让存本地数据，成绩可能记不住'); }, 800);
    }
  }

  SD.ui = {
    init: init,
    nav: nav,
    showScreen: showScreen,
    state: state
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
