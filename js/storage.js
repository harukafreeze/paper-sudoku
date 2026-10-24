/*!
 * storage.js — 本地存档
 * 战绩 / 成就 / 课程进度 / 未完成的对局，全部走 localStorage。
 */
(function (root) {
  'use strict';
  const SD = (root.SD = root.SD || {});
  const KEY = 'paper-sudoku.v1';

  function blank() {
    return {
      version: 1,
      settings: {
        strictErrors: true,
        autoNotes: true,
        highlightPeers: true,
        sound: false
      },
      stats: {},
      history: [],
      achievements: {},
      techniques: {},
      daily: { lastDate: null, streak: 0, best: 0, done: {} },
      tutorial: {},
      game: null
    };
  }

  let data = blank();
  let broken = false;

  function load() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(KEY);
      if (!raw) return data;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return data;
      data = Object.assign(blank(), parsed);
      data.settings = Object.assign(blank().settings, parsed.settings || {});
      data.daily = Object.assign(blank().daily, parsed.daily || {});
      if (!Array.isArray(data.history)) data.history = [];
      if (!data.stats || typeof data.stats !== 'object') data.stats = {};
      if (!data.achievements || typeof data.achievements !== 'object') data.achievements = {};
      if (!data.techniques || typeof data.techniques !== 'object') data.techniques = {};
      if (!data.tutorial || typeof data.tutorial !== 'object') data.tutorial = {};
      return data;
    } catch (e) {
      broken = true;
      return data;
    }
  }

  function save() {
    try {
      if (root.localStorage) root.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* 隐私模式或超配额，静默失败 */ }
  }

  /* ---------------- 设置 ---------------- */

  function setting(key, value) {
    if (value === undefined) return data.settings[key];
    data.settings[key] = value;
    save();
    return value;
  }

  /* ---------------- 统计 ---------------- */

  function statFor(diffKey) {
    if (!data.stats[diffKey]) {
      data.stats[diffKey] = {
        played: 0, won: 0,
        bestTime: null, bestScore: 0, bestStars: 0,
        streak: 0, maxStreak: 0, totalTime: 0,
        lastPlayed: null
      };
    }
    return data.stats[diffKey];
  }

  function todayStr(d) {
    d = d || new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function dayGap(a, b) {
    const ta = new Date(a + 'T00:00:00').getTime();
    const tb = new Date(b + 'T00:00:00').getTime();
    return Math.round((tb - ta) / 86400000);
  }

  /* ---------------- 对局记录 ---------------- */

  /**
   * @param {object} result {diffKey, level, timeSec, mistakes, hints, stars, score, mode, used, givens}
   * @returns {string[]} 新解锁的成就 id
   */
  function recordWin(result) {
    const st = statFor(result.diffKey);
    st.played++;
    st.won++;
    st.totalTime += result.timeSec;
    st.streak++;
    if (st.streak > st.maxStreak) st.maxStreak = st.streak;
    if (st.bestTime == null || result.timeSec < st.bestTime) st.bestTime = result.timeSec;
    if (result.score > st.bestScore) st.bestScore = result.score;
    if (result.stars > st.bestStars) st.bestStars = result.stars;
    st.lastPlayed = todayStr();

    data.history.unshift({
      date: new Date().toISOString(),
      day: todayStr(),
      diffKey: result.diffKey,
      diffName: result.diffName || result.diffKey,
      level: result.level,
      timeSec: result.timeSec,
      mistakes: result.mistakes,
      hints: result.hints,
      stars: result.stars,
      score: result.score,
      mode: result.mode || 'classic',
      used: result.used || {}
    });
    if (data.history.length > 80) data.history.length = 80;

    if (result.used) {
      Object.keys(result.used).forEach(function (k) {
        data.techniques[k] = (data.techniques[k] || 0) + result.used[k];
      });
    }

    if (result.mode === 'daily' && result.day) {
      const d = data.daily;
      if (d.lastDate !== result.day) {
        d.streak = (d.lastDate && dayGap(d.lastDate, result.day) === 1) ? d.streak + 1 : 1;
        d.lastDate = result.day;
        if (d.streak > d.best) d.best = d.streak;
      }
      d.done[result.day] = { timeSec: result.timeSec, stars: result.stars, score: result.score };
    }

    const unlocked = evaluate(result);
    save();
    return unlocked;
  }

  function recordAbort(diffKey) {
    const st = statFor(diffKey);
    st.played++;
    st.streak = 0;
    save();
  }

  /* ---------------- 成就 ---------------- */

  const ACHIEVEMENTS = [
    { id: 'first', name: '初次落笔', desc: '完成第一局' },
    { id: 'clean', name: '一尘不染', desc: '零失误完成一局' },
    { id: 'nohint', name: '自己来', desc: '不用提示完成「困难」或更高' },
    { id: 'allsix', name: '六面', desc: '六个基础难度各完成一局' },
    { id: 'extreme', name: '极限', desc: '完成一局「极限」难度' },
    { id: 'speed', name: '手快', desc: '90 秒内完成「入门」' },
    { id: 'streak3', name: '三连', desc: '同一难度连续完成三局' },
    { id: 'daily1', name: '每日打卡', desc: '完成一次每日挑战' },
    { id: 'daily7', name: '七日不辍', desc: '每日挑战连续 7 天' },
    { id: 'logic', name: '逻辑之美', desc: '不用提示完成一局 X-Wing 级别的题' },
    { id: 'night', name: '夜猫子', desc: '凌晨 0 点到 5 点之间完成一局' }
  ];

  function has(id) { return !!data.achievements[id]; }

  function evaluate(result) {
    const fresh = [];
    const give = function (id, cond) {
      if (cond && !has(id)) {
        data.achievements[id] = new Date().toISOString();
        fresh.push(id);
      }
    };

    give('first', data.history.length >= 1);
    give('clean', result.mistakes === 0);
    give('nohint', result.hints === 0 && result.level >= 4);
    give('allsix', SD.core.DIFFS.filter(function (d) { return d.id <= 6; }).every(function (d) {
      const s = data.stats[d.key];
      return s && s.won > 0;
    }));
    give('extreme', result.diffKey === 'extreme');
    give('speed', result.diffKey === 'novice' && result.timeSec <= 90);
    give('streak3', (data.stats[result.diffKey] || {}).streak >= 3);
    give('daily1', result.mode === 'daily');
    give('daily7', data.daily.streak >= 7);
    give('logic', result.hints === 0 && result.level >= 4);
    give('night', (function () {
      const h = new Date().getHours();
      return h >= 0 && h < 5;
    })());

    return fresh;
  }

  function achievementList() {
    return ACHIEVEMENTS.map(function (a) {
      return {
        id: a.id, name: a.name, desc: a.desc,
        unlocked: !!data.achievements[a.id],
        at: data.achievements[a.id] || null
      };
    });
  }

  /* ---------------- 每日挑战 ---------------- */

  function dailyDone(day) {
    return !!(data.daily.done && data.daily.done[day]);
  }

  /* ---------------- 课程 ---------------- */

  function lessonDone(id) { return !!data.tutorial[id]; }

  function markLesson(id) {
    if (!data.tutorial[id]) {
      data.tutorial[id] = new Date().toISOString();
      save();
    }
  }

  function lessonProgress() {
    const list = (SD.tutorial && SD.tutorial.LESSONS) ? SD.tutorial.LESSONS : [];
    let done = 0;
    list.forEach(function (l) { if (data.tutorial[l.id]) done++; });
    return { done: done, total: list.length };
  }

  /* ---------------- 存档对局 ---------------- */

  function saveGame(state) {
    data.game = state;
    save();
  }

  function loadGame() { return data.game || null; }

  function clearGame() {
    data.game = null;
    save();
  }

  /* ---------------- 导入导出 ---------------- */

  function exportJSON() {
    return JSON.stringify(data, null, 2);
  }

  function importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return false; }
    if (!parsed || typeof parsed !== 'object' || !parsed.version) return false;
    data = Object.assign(blank(), parsed);
    data.settings = Object.assign(blank().settings, parsed.settings || {});
    data.daily = Object.assign(blank().daily, parsed.daily || {});
    save();
    return true;
  }

  function resetAll() {
    data = blank();
    save();
  }

  function summary() {
    let played = 0, won = 0, totalTime = 0;
    Object.keys(data.stats).forEach(function (k) {
      played += data.stats[k].played || 0;
      won += data.stats[k].won || 0;
      totalTime += data.stats[k].totalTime || 0;
    });
    let bestStreak = 0;
    Object.keys(data.stats).forEach(function (k) {
      bestStreak = Math.max(bestStreak, data.stats[k].maxStreak || 0);
    });
    return {
      played: played, won: won, totalTime: totalTime,
      bestStreak: bestStreak,
      dailyStreak: data.daily.streak || 0,
      achievements: Object.keys(data.achievements).length,
      totalAchievements: ACHIEVEMENTS.length
    };
  }

  load();

  SD.store = {
    data: data,
    load: load,
    save: save,
    setting: setting,
    statFor: statFor,
    recordWin: recordWin,
    recordAbort: recordAbort,
    achievementList: achievementList,
    evaluate: evaluate,
    dailyDone: dailyDone,
    lessonDone: lessonDone,
    markLesson: markLesson,
    lessonProgress: lessonProgress,
    saveGame: saveGame,
    loadGame: loadGame,
    clearGame: clearGame,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
    summary: summary,
    todayStr: todayStr,
    ACHIEVEMENTS: ACHIEVEMENTS,
    isBroken: function () { return broken; }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
