/*!
 * tutorial.js — 十二课技巧教学 + 图鉴数据
 * 每课的例子不是手写死的，而是现场找一道「真的会用到这一招」的题，
 * 截到该技巧出现的那一刻给你点。
 */
(function (root) {
  'use strict';
  const SD = (root.SD = root.SD || {});
  const C = SD.core;
  const internals = C._internals;
  const randomFullGrid = internals.randomFullGrid;
  const dig = internals.dig;

  /* ---------------- 课程 ---------------- */

  const LESSONS = [
    {
      id: 1, tech: 'nakedSingle', tag: '基础', name: '唯一候选',
      sub: '一格只剩一个数，先把它捡起来',
      what: '看一个空格。它所在的行、列、宫加起来有 20 个邻居，如果这 20 个格子里已经出现了 1–9 中的 8 个，那这一格就只剩一个数能填。',
      why: '1–9 每个数在一行、一列、一宫里都只能出现一次。8 个位置已经被占了，第 9 个数字无处可去，只能落在这里。这是整局里最没有争议的一步。',
      prompt: '盘面上有一格只剩一个候选数。点它。',
      tip: '新手最常见的错误是「觉得这个数应该填这儿」。唯一候选不需要觉得，它是算出来的。'
    },
    {
      id: 2, tech: 'hiddenSingle', tag: '基础', name: '隐性唯一',
      sub: '这个数在这条线里，只有一个位置容得下它',
      what: '反过来想：盯着一个数字看。在某一宫（或某一行、某一列）里，这个数字能落脚的位置只剩一个——哪怕那一格还有别的候选，它也必须填这个数。',
      why: '每一宫都必须出现 1–9 各一次。这个数迟早要进来，而整宫只剩一个位置没被同行同列的同数挡住，那它就只能在那儿。',
      prompt: '找一个数字，它在某条线里只剩一个位置。点那一格。',
      tip: '卡住的时候换个视角：别再从格子找数，从数找格子。'
    },
    {
      id: 3, tech: 'lockedCandidates', tag: '基础', name: '区块排除',
      sub: '一宫里的数被挤在一条线上，就能反推这条线',
      what: '某个数在某一宫里，能放的位置全都在同一行（或同一列）。那这一行（列）的其它宫，就都不能再放这个数了。',
      why: '这一宫的该数反正要落在这一行里，而一行只能有一个该数——名额被这一宫占死了。',
      prompt: '点出因为这条推理而被删掉候选的格子。',
      tip: '先横着看宫，再竖着看宫，两个方向都要试。'
    },
    {
      id: 4, tech: 'nakedPair', tag: '进阶', name: '显性数对',
      sub: '两格两数，别的格子让路',
      what: '同一宫（或行、列）里，有两个格子的候选数完全相同，都只有两个。那这两个数就被它们包了。',
      why: '这两个数必须分别落进这两格，只是不知道谁是谁。既然位置被占了，同一单元里其它格子就不能再出现这两个数。',
      prompt: '点出被排除掉候选的格子。',
      tip: '数对的关键不是「这两格是什么」，而是「别处不能再是什么」。'
    },
    {
      id: 5, tech: 'hiddenPair', tag: '进阶', name: '隐性数对',
      sub: '两个数挤在两格里，别的候选都是多余的',
      what: '同一单元里，有两个数字能放的位置都只有同样那两格。那这两格就必须装下这两个数。',
      why: '这两个数各自都得在这单元里出现一次，而它们只有两个容身之处，于是一格一个。格子被占满，格子里其它的候选数就全是噪音。',
      prompt: '点出这两格中被清理掉多余候选的那一格。',
      tip: '显性数对看「格子有什么」，隐性数对看「数字能去哪」。'
    },
    {
      id: 6, tech: 'nakedTriple', tag: '进阶', name: '显性三数组',
      sub: '三格三数，比数对更隐蔽',
      what: '同一单元里三个格子的候选数合起来正好是三个数。这三个数被这三格锁死，同单元其它格子全部排除它们。',
      why: '三个数要填三个格子，一格一个，没有余量给别处。注意：三格不必各自都只有三个候选，只要它们的并集是三个就行。',
      prompt: '点出被排除掉候选的格子。',
      tip: '三个格子可以是「2+3+3」这种组合，别只盯着整齐的三三三。'
    },
    {
      id: 7, tech: 'xWing', tag: '进阶', name: 'X-Wing',
      sub: '两行两列，四个角锁死一个数',
      what: '某个数在两行里都只剩两个位置，而且恰好落在同样的两列上。这四个角组成一个矩形。',
      why: '这两行里的该数一定落在这四个角上，且每列各一个。既然这两列的名额被这两个角占了，这两列的其它行就都不可能是这个数。',
      prompt: '点出因这个矩形而被排除候选的格子。',
      tip: 'X-Wing 只关心「恰好两个位置」。三个位置的行不参与。'
    },
    {
      id: 8, tech: 'xyWing', tag: '高级', name: 'XY-Wing',
      sub: '一个中心，两个翅膀，夹死一个候选',
      what: '找一个只有两个候选的格子（记作 AB）。它的两个邻居也各只有两个候选，且分别是 AC 和 BC。',
      why: '中心填 A 时，AC 那格就只能是 C；中心填 B 时，BC 那格只能是 C。不管怎样，C 一定出现在其中一个翅膀里。所以同时看见两个翅膀的格子，不可能是 C。',
      prompt: '点出被夹掉 C 的那个格子。',
      tip: '两个翅膀必须都看得见中心格；被排除的格子必须同时看得见两个翅膀。'
    },
    {
      id: 9, tech: 'swordfish', tag: '高级', name: '剑鱼',
      sub: 'X-Wing 的三行版',
      what: '某个数在三行里，每行只有 2–3 个位置，而这些位置加起来总共只占三列。',
      why: '三行里的该数被这三列包办，每列正好一个。于是这三列的其它行，都不能再是该数。',
      prompt: '点出被排除候选的格子。',
      tip: '剑鱼比 X-Wing 更容易看漏，因为它允许每行有三个位置。先在纸上把候选标出来再找。'
    },
    {
      id: 10, tech: 'uniqueRect', tag: '高级', name: '唯一矩形',
      sub: '题目只有一个解，这件事本身就是线索',
      what: '四个格子组成矩形，其中三个都只剩同样的一对数。第四格如果也只留这两个数，题目就会出现两个解。',
      why: '数独保证唯一解。真出现「四格两数」的矩形，把这两个数整体对调，仍然是一个合法解——矛盾。所以第四格不能保留这一对，从它身上删掉。',
      prompt: '点出那个必须被删掉候选的第四格。',
      tip: '这是唯一一个「利用题目唯一解」的技巧，不是纯逻辑推导，但完全合法。'
    },
    {
      id: 11, tech: 'coloring', tag: '高级', name: '单数着色',
      sub: '把候选连成链，用颜色找矛盾',
      what: '盯着一个数字。某条线里它只剩两个位置，这两格就构成一条「共轭对」：一真一假。把整条链交替涂成两色。',
      why: '链上相邻两格必定一真一假，所以同一种颜色要么全真、要么全假。如果两格同色却互相看得见，这一色就不可能全真——整色删掉。',
      prompt: '点出被排除掉候选的那一格。',
      tip: '这一步通常得在纸上做。用两种颜色的笔，比在脑子里记靠谱得多。'
    },
    {
      id: 12, tech: null, tag: '收尾', name: '接下来怎么练',
      sub: '技巧学完了，剩下的是手感',
      recap: true,
      what: '你现在手里有 11 件工具：单数、区块排除、数对、三数组、X-Wing、XY-Wing、剑鱼、唯一矩形、着色。',
      why: '真实对局里，90% 的时间只用到前四件。真正需要 X-Wing 以上的题不多，遇到了也别慌——先确认前四件真的用尽了。',
      prompt: '建议的练法：先用「中等」连打五局，每局卡住时先不点提示，问自己「我刚才漏了哪种数对」。',
      tip: '提示是分三级的：先给方向，再给位置，最后才给答案。能停在第一级最好。'
    }
  ];

  const byId = {};
  LESSONS.forEach(function (l) { byId[l.id] = l; });

  /* ---------------- 图鉴 ---------------- */

  const CODEX = [
    { tech: 'nakedSingle', one: '这一格只剩一个数能填', when: '开局扫一遍，能填先填' },
    { tech: 'hiddenSingle', one: '这个数在这条线里只剩一个位置', when: '从数找格子，比从格子找数快' },
    { tech: 'lockedCandidates', one: '一宫的某数被挤在一条线上，这条线就被它占了', when: '单数推不动时第一个该想到的' },
    { tech: 'nakedPair', one: '两格只含两数，同单元别处排除这两数', when: '候选标出来之后一眼可见' },
    { tech: 'hiddenPair', one: '两数只进两格，这两格的其它候选全是噪音', when: '显性数对找不到时换个方向' },
    { tech: 'nakedTriple', one: '三格的候选并集正好三个数', when: '比数对少见，但经常是破局点' },
    { tech: 'xWing', one: '两行两列四个角，锁死一个数', when: '中高难度题的分水岭' },
    { tech: 'swordfish', one: '三行三列的大号 X-Wing', when: 'X-Wing 找不到时往上看' },
    { tech: 'xyWing', one: '一个 AB 中心带两个 AC、BC 翅膀，夹掉 C', when: '候选只剩两个的格子多的时候' },
    { tech: 'uniqueRect', one: '四格两数会造成双解，所以第四格必须删', when: '题目保证唯一解才成立' },
    { tech: 'coloring', one: '共轭对涂两色，同色相撞整色作废', when: '需要动笔的题，通常在第 5 档以后' }
  ];

  const LEVEL_OF_TECH = {};
  C.TECHNIQUES.forEach(function (t) { LEVEL_OF_TECH[t.name] = t.level; });

  /* ---------------- 例子生成 ---------------- */

  const cache = {};

  /**
   * 找一道真的会用到某个技巧的题，并截到那一步。
   * @param {object} lesson
   * @param {number} variant 换一题时递增
   */
  function build(lesson, variant) {
    if (!lesson.tech) return null;
    variant = variant || 0;
    const key = lesson.id + '#' + variant;
    if (cache[key]) return cache[key];

    const baseSeed = lesson.id * 100003 + variant * 7919;

    for (let attempt = 0; attempt < 500; attempt++) {
      const seed = (baseSeed + attempt * 104729) >>> 0;
      const rng = C.mulberry32(seed);

      const full = randomFullGrid(rng);
      const lo = 21 + (attempt % 3);
      const puzzle = dig(full, lo, rng, true);
      if (C.countSolutions(puzzle, 2) !== 1) continue;

      const an = C.analyze(puzzle);
      let idx = -1;
      for (let k = 0; k < an.steps.length; k++) {
        if (an.steps[k].name === lesson.tech) { idx = k; break; }
      }
      if (idx < 0) continue;

      const step = an.steps[idx];
      const accept = step.place.length ? [step.place[0][0]] : step.targets.slice();
      if (!accept.length) continue;

      const built = {
        lessonId: lesson.id,
        tech: lesson.tech,
        puzzle: puzzle,
        solution: an.solution,
        before: C.parse(step.before),
        cand: step.candBefore,
        step: step,
        level: step.level,
        focus: step.focus.slice(),
        targets: step.targets.slice(),
        accept: accept,
        explain: step.text
      };
      cache[key] = built;
      return built;
    }
    return null;
  }

  function checkExample(ex, cell) {
    return ex.accept.indexOf(cell) >= 0;
  }

  /* ---------------- 导出 ---------------- */

  SD.tutorial = {
    LESSONS: LESSONS,
    byId: byId,
    CODEX: CODEX,
    LEVEL_OF_TECH: LEVEL_OF_TECH,
    build: build,
    check: checkExample,
    clearCache: function () {
      Object.keys(cache).forEach(function (k) { delete cache[k]; });
    }
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
