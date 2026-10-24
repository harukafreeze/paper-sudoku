/*!
 * tutorial.js — 课程
 *
 * 设计原则：
 *   1. 每一步只做一件事，并且明确告诉你「现在要做什么」。
 *   2. 先看系统演示，再自己动手，最后才总结。
 *   3. 棋盘上只留相关区域，其余变暗——初学者的最大障碍是「不知道看哪儿」。
 *   4. 前 3 课用 4×4 小棋盘教规则，16 格看得完，再上 9×9。
 */
(function (root) {
  'use strict';
  const SD = (root.SD = root.SD || {});
  const C = SD.core;
  const internals = C._internals;
  const randomFullGrid = internals.randomFullGrid;
  const dig = internals.dig;

  /* ============================================================
   * 章节
   * ============================================================ */

  const CHAPTERS = [
    { id: 1, title: '认识它', sub: '规则 · 看哪儿 · 候选数', desc: '用 4×4 的小棋盘，把规则一次讲透。' },
    { id: 2, title: '先学会填', sub: '唯一候选 · 隐性唯一', desc: '这两种方法能解决掉一局里一半以上的格子。' },
    { id: 3, title: '卡住的时候', sub: '区块排除 · 笔记', desc: '单数用完、又还没到高级技巧时，先学会这两件事。' },
    { id: 4, title: '候选数技巧', sub: '数对 · 三数组 · X-Wing', desc: '从这里开始，眼睛要盯着「候选数」而不是数字。' },
    { id: 5, title: '高手区', sub: 'XY-Wing · 剑鱼 · 唯一矩形 · 着色', desc: '难题目里才会出现的四招。' },
    { id: 6, title: '上路', sub: '用提示 · 常见错误 · 怎么练', desc: '技巧学完，剩下的是手感。' }
  ];

  /* ============================================================
   * 课程
   * ============================================================ */

  const LESSONS = [

    /* ---------------- 第一章 ---------------- */
    {
      id: 'l1', ch: 1, title: '一行里不能有两个 3', min: 3,
      goal: '知道数独唯一的那条规则。',
      steps: [
        {
          kind: 'text',
          title: '先别看 9×9',
          body: '这是 4×4 数独：每行 4 格，填 1–4。规则只有一句——**每一行、每一列、每一个宫，1–4 各出现一次**。',
          board: { n: 4, box: 2, cells: [3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          caption: '4×4 数独，先看第一行'
        },
        {
          kind: 'click',
          instruction: '看第一行。它坏了——点出问题所在。',
          board: { n: 4, box: 2, cells: [3, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          targets: [0, 3],
          explain: '同一行出现了两个 3。这一行就废了——不管别的格子填什么。',
          hint: '第一行里，有两个一模一样的数字。'
        },
        {
          kind: 'text',
          title: '宫是什么',
          body: '粗线把 4×4 分成四个 2×2 的方块，每个方块叫一个**宫**。规则对宫同样有效：一个宫里也不能有两个相同的数。',
          board: { n: 4, box: 2, cells: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          caption: '左上角这个 2×2，就是一个宫'
        },
        {
          kind: 'click',
          instruction: '这个宫也坏了。点出重复的那两个数。',
          board: { n: 4, box: 2, cells: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          targets: [0, 1],
          explain: '左上这个宫里有两条 1，同样不合法。',
          hint: '左上角那个 2×2 的方框里，有两个 1。'
        },
        {
          kind: 'summary',
          title: '记住这一句',
          body: '**同行、同列、同宫，1–4 各只能有一个。**\n9×9 数独用的是 1–9，规则一个字都不变。'
        }
      ]
    },
    {
      id: 'l2', ch: 1, title: '三个方向一起看', min: 3,
      goal: '知道一格能填什么，由它的行、列、宫共同决定。',
      steps: [
        {
          kind: 'text',
          title: '填一格之前，先看它的三个方向',
          body: '这一格空着。它所在的那一行、那一列、那个宫——三处的数字都会限制它。',
          board: { n: 4, box: 2, cells: [0, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1] },
          peersOf: 0,
          caption: '变亮的，是这一格的三个方向'
        },
        {
          kind: 'quiz',
          instruction: '这一格能填几？',
          board: { n: 4, box: 2, cells: [0, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1] },
          focus: [0],
          options: ['1', '3', '4'],
          answer: 0,
          explain: '第一行已经有 2、3、4，只剩 1。行这一处就够了。'
        },
        {
          kind: 'text',
          title: '有时候行不够',
          body: '现在空了两格：第 3 行少了 1 和 2。光看行，两格都可能填 1 或 2。\n那就看列。',
          board: { n: 4, box: 2, cells: [1, 2, 3, 4, 3, 4, 1, 2, 0, 0, 4, 3, 4, 3, 2, 1] },
          focus: [8],
          caption: '这次要看第 3 行的第一格'
        },
        {
          kind: 'quiz',
          instruction: '左边这一格，能填 1 吗？',
          board: { n: 4, box: 2, cells: [1, 2, 3, 4, 3, 4, 1, 2, 0, 0, 4, 3, 4, 3, 2, 1] },
          focus: [8],
          peersOf: 8,
          options: ['能', '不能，只能是 2'],
          answer: 1,
          explain: '它所在的第 1 列已经有 1 了（最上面那格）。一行只能有一个 1，所以这一格是 2。'
        },
        {
          kind: 'summary',
          title: '记住这一句',
          body: '**行、列、宫，三处都要看。任何一处出现过，就不能再填。**\n只查一处就下笔，是新手最容易犯的错。'
        }
      ]
    },
    {
      id: 'l3', ch: 1, title: '候选数', min: 4,
      goal: '学会列出「这一格还能填什么」。',
      steps: [
        {
          kind: 'text',
          title: '给「可能的数」起个名字',
          body: '一格「还有可能填的数」，叫它的**候选数**。\n把行、列、宫里出现过的数全部划掉，剩下的就是候选数。',
          board: { n: 4, box: 2, cells: [0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          peersOf: 0,
          caption: '先看左上角这一格'
        },
        {
          kind: 'quiz',
          instruction: '这一格的候选数是？',
          board: { n: 4, box: 2, cells: [0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
          peersOf: 0,
          options: ['1 和 4', '1、3、4', '只有 1'],
          answer: 0,
          explain: '行里有 2 → 排除 2；列里有 3 → 排除 3；左上这个宫里也有 3。\n所以候选数是 1 和 4。'
        },
        {
          kind: 'text',
          title: '候选数只剩一个的时候',
          body: '如果一格排除完只剩一个数，那它就必须填这个数。\n这一步没有任何争议，也不叫猜——直接填。',
          board: { n: 4, box: 2, cells: [0, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1] },
          focus: [0],
          caption: '这一格，候选数只有一个'
        },
        {
          kind: 'quiz',
          instruction: '这一格有几个候选数？',
          board: { n: 4, box: 2, cells: [0, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1] },
          peersOf: 0,
          options: ['1 个', '2 个', '3 个'],
          answer: 0,
          explain: '行里有 2、3、4；列里有 3、2、4；宫里也有 2、3、4。\n三处加起来把 2、3、4 全排掉了，只剩 **1**。'
        },
        {
          kind: 'summary',
          title: '记住这一句',
          body: '**候选数 = 1–9 里，被行、列、宫排除之后剩下的。**\n只剩一个，就能直接填。下一章我们就靠它吃饭。'
        }
      ]
    },

    /* ---------------- 第二章 ---------------- */
    {
      id: 'l4', ch: 2, tech: 'nakedSingle', min: 4,
      title: '唯一候选',
      goal: '一眼看出一格里只剩一个数。',
      intro: [
        {
          title: '最没有争议的一步',
          body: '一个格子的候选数只剩一个，它就只能填这个数。不需要推理，也不需要猜。'
        },
        {
          title: '怎么找',
          body: '扫一遍所有空格：哪一格的**同行、同列、同宫加起来已经出现了 8 个不同的数**，剩下那个就是答案。'
        }
      ],
      watchText: '看这一格。它的行、列、宫已经把 8 个数占满了，只剩一个空位。',
      task: '盘面上有一格只剩一个候选数。点它。',
      hint: '别猜。找那种「周围的数已经凑齐 8 个」的格子。',
      summary: '**口诀：能填先填。**开局第一件事，就是把所有唯一候选扫出来。'
    },
    {
      id: 'l5', ch: 2, tech: 'nakedSingle', practice: 3, min: 4,
      title: '唯一候选 · 连做三题',
      goal: '把「扫单数」变成本能。',
      intro: [
        {
          title: '看过一遍不算会',
          body: '这一课没有新东西，就是连着做三题。每道题都有一格只剩一个候选数。'
        },
        {
          title: '扫的顺序',
          body: '一行一行扫，或者从 1 扫到 9 找每个数只能去的地方。两种都行，选一个顺手的。'
        }
      ],
      task: '点出只剩一个候选数的那一格。',
      hint: '一行一行看。看到一格，数一数它周围有几个不同的数。',
      summary: '三题都过了，说明你会扫了。真打的时候，这一步能解决掉一半以上的格子。'
    },
    {
      id: 'l6', ch: 2, tech: 'hiddenSingle', min: 5,
      title: '隐性唯一 · 宫里只剩一个位置',
      goal: '学会反过来：从数字找格子。',
      intro: [
        {
          title: '反过来想',
          body: '有时候一格有好几个候选，看着没戏。换个角度：**盯着一个数字**，看它在某个宫里能放哪儿。'
        },
        {
          title: '只剩一个位置',
          body: '如果这个数在这一宫里只有一个格子容得下它——那这一格就必须是它，哪怕这格还有别的候选。'
        }
      ],
      watchText: '系统会先框出这一宫，再看这个数字还有几个位置。只剩一个，所以它必须落在那儿。',
      task: '找一个数字，它在某一宫里只剩一个位置。点那一格。',
      hint: '从 1 数到 9，每个数在宫里扫一遍：它还有几个空位？',
      summary: '**口诀：从数字找格子。**卡住的时候，换个方向看。'
    },
    {
      id: 'l7', ch: 2, tech: 'hiddenSingle', min: 5,
      title: '隐性唯一 · 行和列也一样',
      goal: '把「唯一位置」用到行和列上。',
      intro: [
        {
          title: '同一个思路，换个方向',
          body: '宫里只剩一个位置，叫隐性唯一。把这个「宫」换成行或者列，一样成立。'
        },
        {
          title: '扫描顺序',
          body: '先看宫，再看行，最后看列。三个方向都扫完，通常能连着填掉好几个。'
        }
      ],
      watchText: '这次的目标在一行里只剩一个位置。',
      task: '这个数字在某一行（或某一列）里只剩一个位置。点它。',
      hint: '宫扫完了吗？试试行，再试试列。',
      summary: '**宫 → 行 → 列，扫三轮。**这一步不需要技巧，只需要耐心。'
    },

    /* ---------------- 第三章 ---------------- */
    {
      id: 'l8', ch: 3, tech: 'lockedCandidates', min: 5,
      title: '区块排除',
      goal: '没有单数可填时，还能靠排除推进。',
      intro: [
        {
          title: '一格都填不了的时候',
          body: '如果每个空格都还有两三个候选，单数就走到头了。这时候开始用**排除**。'
        },
        {
          title: '被挤在一条线上',
          body: '某个数在某一宫里，能放的位置**全都在同一行**。那这一行里、这一宫之外的格子，就都不能再放这个数。'
        },
        {
          title: '为什么',
          body: '这一宫的该数反正要落在这行里，而一行只能有一个。名额被这一宫占死了。'
        }
      ],
      watchText: '系统会先框出这一宫里该数的几个位置，再划掉同一行、宫外面的候选。',
      task: '点出被排除掉候选的那一格。',
      hint: '先找一个「被挤在一条线上」的数字，再看这条线上、宫外面的格子。',
      summary: '**口诀：宫里的数被挤在一条线，这条线就被它占了。**'
    },
    {
      id: 'l9', ch: 3, min: 3,
      title: '笔记：把候选数写下来',
      goal: '学会用笔记，而不是用脑子记。',
      steps: [
        {
          kind: 'text',
          title: '为什么要记笔记',
          body: '到了中等难度，光靠眼睛记候选会崩。\n把候选数**写在格子里**，是所有人都会做的事——包括高手。'
        },
        {
          kind: 'text',
          title: '在这个游戏里怎么记',
          body: '点一个空格，按 <kbd>N</kbd>（或者点下面的「笔记」），再按数字，候选就写进格子里了。\n再按一次同一个数字，就擦掉。'
        },
        {
          kind: 'text',
          title: '填上正经数字时',
          body: '当你填一个正式数字，同行、同列、同宫里这个数的笔记会**自动清掉**。这个可以在设置里关。'
        },
        {
          kind: 'text',
          title: '记什么，不记什么',
          body: '只记还有可能的数。**九个数字全写上，等于没写。**\n一格超过 4 个候选，通常先别管它——去看候选少的格子。'
        },
        {
          kind: 'summary',
          title: '现在去试一次',
          body: '开一局「中等」，从头用笔记标一遍。标完之后，你会发现刚才看不见的数对，自己跳出来了。'
        }
      ]
    },

    /* ---------------- 第四章 ---------------- */
    {
      id: 'l10', ch: 4, tech: 'nakedPair', min: 5,
      title: '显性数对',
      goal: '看到「两格两数」，就能排除别处。',
      intro: [
        {
          title: '先看候选数，不看数字',
          body: '从这里开始，眼睛要盯着**格子里的小数字**（候选数），而不是格子里的数字。'
        },
        {
          title: '两格，两数',
          body: '同一行、同一列或同一宫里，如果有两个格子的候选数**完全一样，都只有两个**——这两格就锁定了这两个数。'
        },
        {
          title: '怎么找',
          body: '标完候选数之后，扫一遍每个宫、每一行、每一列：有没有两个格子的候选**完全一样，都只有两个**。\n找到了先别管它们填什么——先看同一单元里还有谁带着这两个数。'
        },
        {
          title: '然后呢',
          body: '这两个数必定一格一个。所以同一单元里，别的格子都不能再放它们。删掉。'
        }
      ],
      watchText: '系统会圈出这两格，再划掉同一单元里其它格子的这两个候选。',
      task: '点出被删掉候选的那一格。',
      hint: '先找两个候选数完全相同的格子，再看同一行/列/宫里的其它格。',
      summary: '**数对不是让你填，是让你删。**'
    },
    {
      id: 'l11', ch: 4, tech: 'hiddenPair', min: 5,
      title: '隐性数对',
      goal: '两个数只进两格时，把格子清干净。',
      intro: [
        {
          title: '再反过来一次',
          body: '两个数字，在同一单元里能放的位置**都只有同样那两格**。那这两格就必须装下它们。'
        },
        {
          title: '怎么找',
          body: '在同一个单元里挑两个数，分别看它们能放哪儿。\n如果这两个数的位置**都是同样那两格**，就中了。'
        },
        {
          title: '为什么能删',
          body: '这两格被这两个数占满了，格子里其它的候选就都是多余的。删掉，格子会变得很清楚。'
        }
      ],
      watchText: '系统会标出这两个数各自的落点，你会发现是同样两格。',
      task: '点出被清理掉多余候选的那一格。',
      hint: '别找格子有什么，找「这两个数能去哪」。',
      summary: '**显性数对看格子有什么，隐性数对看数字能去哪。**'
    },
    {
      id: 'l12', ch: 4, tech: 'nakedTriple', min: 6,
      title: '三数组',
      goal: '数对的三个格子版本。',
      intro: [
        {
          title: '三格三数',
          body: '同一单元里，三个格子的候选数**合起来正好是三个数**。这三格锁死这三个数。'
        },
        {
          title: '不需要长得整齐',
          body: '三格不必各自都只有三个候选。只要它们的并集是三个数就行——比如 {1,2}、{2,3}、{1,3}。'
        },
        {
          title: '怎么找',
          body: '扫每个单元里**候选数不超过 3 个**的格子（一般没几个）。\n挑三个，把候选并起来数一数——正好三个数，就成立。'
        }
      ],
      watchText: '看这三个格子的候选数合并起来，正好是三个数。',
      task: '点出被排除掉候选的格子。',
      hint: '三个格子的候选加起来，数一数有几种不同的数。',
      summary: '**并集成三，就锁三。**'
    },
    {
      id: 'l13', ch: 4, tech: 'xWing', min: 6,
      title: 'X-Wing',
      goal: '中级和高级的分水岭。',
      intro: [
        {
          title: '两行两列',
          body: '某个数在两行里**都只剩两个位置**，而且恰好落在同样的两列上。四个角组成一个矩形。'
        },
        {
          title: '怎么找',
          body: '从 1 数到 9，一个一个来。\n对每个数，逐行数它还剩几个位置——只记**正好两个**的行；再比较这些行的列号，有两条一模一样的，就是它。\n行扫完了，把行列对调再扫一遍。'
        },
        {
          title: '为什么能排除',
          body: '这两行里的该数一定在这四个角上，而且每列各一个。\n既然这两列的名额被这四角占了，这两列的其它行就不能再有它。'
        }
      ],
      watchText: '先看这两行：这个数都只有两个位置。再看列——两条都对齐了。',
      task: '点出因这个矩形而被排除候选的格子。',
      hint: '只找「恰好两个位置」的行。有三个位置的行不参与。',
      summary: '**四个角锁死一个数。**'
    },

    /* ---------------- 第五章 ---------------- */
    {
      id: 'l14', ch: 5, tech: 'xyWing', min: 7,
      title: 'XY-Wing',
      goal: '用三个双候选格，夹掉一个数。',
      intro: [
        {
          title: '找三个双候选格',
          body: '一个格子只有两个候选（记作 A、B）。它的两个邻居也各只有两个候选，分别是 A、C 和 B、C。'
        },
        {
          title: '怎么找',
          body: '先在盘面上把**只有两个候选**的格子找出来（通常有十几个）。\n挑一个当中心，看它周围有没有两个也只剩两个候选的邻居，而且一个带着 A、一个带着 B。'
        },
        {
          title: '为什么成立',
          body: '中心填 A，则 A、C 那格只能是 C；中心填 B，则 B、C 那格只能是 C。\n不管怎样，C 一定出现在其中一个翅膀里。'
        },
        {
          title: '所以',
          body: '同时看得见两个翅膀的格子，不可能是 C。'
        }
      ],
      watchText: '看这三个双候选格，还有同时看见两个翅膀的那一格。',
      task: '点出被夹掉 C 的那个格子。',
      hint: '两个翅膀都要看得见中心；被排除的格子要同时看得见两个翅膀。',
      summary: '**一个中心，两个翅膀，夹死一个候选。**'
    },
    {
      id: 'l15', ch: 5, tech: 'swordfish', min: 8,
      title: '剑鱼',
      goal: 'X-Wing 的三行版本。',
      intro: [
        {
          title: '三行三列',
          body: '某个数在**三行**里，每行只有 2–3 个位置，而这些位置加起来**总共只占三列**。'
        },
        {
          title: '和 X-Wing 的关系',
          body: 'X-Wing 是两行两列，剑鱼是三行三列，再往上还有四行四列（叫水母）。\n三者是同一个思路，只是规模变大。'
        },
        {
          title: '为什么能排除',
          body: '三行里的该数被这三列包办了，每列正好一个。这三列的其它行，都不能再有它。'
        }
      ],
      watchText: '三行、三列，横竖都被框住了。注意每行只有两三个位置，但合起来只占三列。',
      task: '点出被排除候选的格子。',
      hint: '先在纸上把三行里该数的位置标出来，再看它们占了几列。三列才成立。',
      summary: '**三行锁三列。**看到「每行两三个位置、合起来只占三列」，就是它。'
    },
    {
      id: 'l16', ch: 5, tech: 'uniqueRect', min: 7,
      title: '唯一矩形',
      goal: '用「题目只有一个解」这件事来推理。',
      intro: [
        {
          title: '用题目的唯一性',
          body: '四个格子组成矩形，其中三个都只剩同样的一对数。\n如果第四格也只留这两个数，题目就会出现两个解。'
        },
        {
          title: '怎么找',
          body: '找两行两列围出来的矩形：四个格子都空着，而且落在正好两个宫里。\n看其中三个格子的候选——如果是同一对数，第四格就是目标。'
        },
        {
          title: '为什么',
          body: '真出现「四格两数」的矩形，把这两个数整体对调，仍然是一个合法解——矛盾。\n数独保证唯一解，所以第四格不能保留这一对。'
        }
      ],
      watchText: '三个格子都只剩同一对数，第四个格子是那个「多出来」的。',
      task: '点出那个必须被删掉候选的第四格。',
      hint: '找四个格子组成的矩形，其中三格的候选数一模一样。',
      summary: '**四格两数会双解，所以第四格必须让路。**'
    },
    {
      id: 'l17', ch: 5, tech: 'coloring', min: 8,
      title: '单数着色',
      goal: '把候选连成链，用颜色找矛盾。',
      intro: [
        {
          title: '共轭对',
          body: '盯着一个数字。某条线里它只剩两个位置——这两格一真一假，叫一条**共轭对**。'
        },
        {
          title: '怎么找',
          body: '挑一个数。先在每条行、列、宫里找「只剩两个位置」的线，把这两格连起来。\n一条链连好之后，交替上两种颜色，再看有没有同一颜色的两格互相看得见。'
        },
        {
          title: '涂两色',
          body: '把整条链交替涂成两种颜色。相邻两格必定一真一假，所以同一种颜色要么全真、要么全假。'
        },
        {
          title: '找矛盾',
          body: '如果两格同色却互相看得见，这一色就不可能全真——整色删掉。'
        }
      ],
      watchText: '看这条链是怎么连起来的，还有那两格撞在一起的同色格。',
      task: '点出被排除掉候选的那一格。',
      hint: '这一步通常得在纸上做。用两种颜色的笔，比在脑子里记靠谱得多。',
      summary: '**同色相撞，整色作废。**'
    },

    /* ---------------- 第六章 ---------------- */
    {
      id: 'l18', ch: 6, min: 3,
      title: '卡住了怎么办',
      goal: '知道卡住时该按什么顺序自救。',
      steps: [
        {
          kind: 'text',
          title: '先别点提示',
          body: '卡住是正常的，不是你不会。\n先按这个顺序自查一遍，八成能自己走出来。'
        },
        {
          kind: 'text',
          title: '自查四步',
          body: '1. 单数真的扫干净了吗？再扫一遍宫、行、列。\n2. 有没有某个数被挤在一条线上？（区块排除）\n3. 有没有两个格子的候选完全一样？（数对）\n4. 候选超过 4 个的格子，先放下——去看候选少的。'
        },
        {
          kind: 'text',
          title: '提示是分三级的',
          body: '点「提示」不会直接给答案：\n第一下告诉你**该用哪一招**；第二下指出**位置**；第三下才给数。\n尽量停在第一级——那是真正在学。'
        },
        {
          kind: 'text',
          title: '怎么练到大师',
          body: '入门到中等连打十局，每局逼自己**不用提示**。\n然后往上一档，卡住时先自查，再看提示。\n能稳定通过「困难」，你已经超过绝大多数人了。'
        },
        {
          kind: 'summary',
          title: '最后一句',
          body: '**慢不是问题，跳过分析才是。**\n每一局只要比上一局少点一次提示，就是在进步。'
        }
      ]
    }
  ];

  /* ============================================================
   * 技巧速查（教程页底部）
   * ============================================================ */

  const TECH_REF = [
    { tech: 'nakedSingle', one: '这一格只剩一个数能填', when: '开局扫一遍，能填先填' },
    { tech: 'hiddenSingle', one: '这个数在这条线里只剩一个位置', when: '从数找格子，比从格子找数快' },
    { tech: 'lockedCandidates', one: '一宫的某数被挤在一条线上，这条线就被它占了', when: '单数推不动时第一个该想到的' },
    { tech: 'nakedPair', one: '两格只含两数，同单元别处排除这两数', when: '候选标出来之后一眼可见' },
    { tech: 'hiddenPair', one: '两数只进两格，这两格的其它候选全是噪音', when: '显性数对找不到时换个方向' },
    { tech: 'nakedTriple', one: '三格的候选并集正好三个数', when: '比数对少见，但经常是破局点' },
    { tech: 'xWing', one: '两行两列四个角，锁死一个数', when: '中高难度题的分水岭' },
    { tech: 'swordfish', one: '三行三列的大号 X-Wing', when: 'X-Wing 找不到时往上看' },
    { tech: 'xyWing', one: '一个 AB 中心带两个 AC、BC 翅膀，夹掉 C', when: '双候选格多的时候' },
    { tech: 'uniqueRect', one: '四格两数会造成双解，所以第四格必须删', when: '题目保证唯一解才成立' },
    { tech: 'coloring', one: '共轭对涂两色，同色相撞整色作废', when: '需要动笔的题' }
  ];

  /* ============================================================
   * 例子生成
   * ============================================================ */

  const cache = {};

  function makeExample(tech, lessonId, variant, salt) {
    const key = lessonId + '#' + variant + '#' + (salt || 0);
    if (cache[key]) return cache[key];

    const baseSeed = (lessonId.charCodeAt(1) * 100003) + variant * 7919 + (salt || 0) * 104729;

    for (let attempt = 0; attempt < 600; attempt++) {
      const seed = (baseSeed + attempt * 7919) >>> 0;
      const rng = C.mulberry32(seed);

      const full = randomFullGrid(rng);
      const lo = 21 + (attempt % 3);
      const puzzle = dig(full, lo, rng, true);
      if (C.countSolutions(puzzle, 2) !== 1) continue;

      const an = C.analyze(puzzle);
      let idx = -1;
      for (let k = 0; k < an.steps.length; k++) {
        if (an.steps[k].name === tech) { idx = k; break; }
      }
      if (idx < 0) continue;

      const step = an.steps[idx];
      const accept = step.place.length ? [step.place[0][0]] : step.targets.slice();
      if (!accept.length) continue;

      const built = {
        tech: tech,
        puzzle: puzzle,
        solution: an.solution,
        before: C.parse(step.before),
        cand: step.candBefore,
        step: step,
        focus: step.focus.slice(),
        targets: step.targets.slice(),
        accept: accept,
        unit: step.unit,
        explain: step.text
      };
      cache[key] = built;
      return built;
    }
    return null;
  }

  /* ============================================================
   * 把课程展开成「步骤序列」
   * ============================================================ */

  function materialize(lesson, variant) {
    variant = variant || 0;

    // 手写步骤的课（4×4 与纯文字）
    if (lesson.steps) {
      return { steps: lesson.steps.map(function (s) { return Object.assign({}, s); }), ex: null };
    }

    if (!lesson.tech) return null;

    const steps = [];
    (lesson.intro || []).forEach(function (t) {
      steps.push({ kind: 'text', title: t.title, body: t.body });
    });

    const rounds = lesson.practice || 1;

    if (rounds > 1) {
      for (let r = 0; r < rounds; r++) {
        const ex = makeExample(lesson.tech, lesson.id, variant, r);
        if (!ex) {
          if (r === 0) return null;
          break;
        }
        steps.push({
          kind: 'find',
          ex: ex,
          roundLabel: '第 ' + (r + 1) + ' / ' + rounds + ' 题',
          instruction: lesson.task,
          hint: lesson.hint
        });
      }
      steps.push({ kind: 'summary', title: '记住这一句', body: lesson.summary });
      return { steps: steps, ex: null };
    }

    // 演示用一道题，练习用另一道——不然就是「照着刚才那个点」
    const exWatch = makeExample(lesson.tech, lesson.id, variant, 0);
    if (!exWatch) return null;
    const exFind = makeExample(lesson.tech, lesson.id, variant, 11) || exWatch;

    steps.push({ kind: 'watch', ex: exWatch, body: lesson.watchText || '' });
    steps.push({ kind: 'find', ex: exFind, instruction: lesson.task, hint: lesson.hint });
    steps.push({ kind: 'summary', title: '记住这一句', body: lesson.summary });
    return { steps: steps, ex: null };
  }

  /* ============================================================
   * 导出
   * ============================================================ */

  const byId = {};
  LESSONS.forEach(function (l) { byId[l.id] = l; });

  function chapterOf(ch) {
    for (let i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === ch) return CHAPTERS[i];
    return CHAPTERS[0];
  }

  SD.tutorial = {
    CHAPTERS: CHAPTERS,
    LESSONS: LESSONS,
    byId: byId,
    chapterOf: chapterOf,
    TECH_REF: TECH_REF,
    materialize: materialize,
    clearCache: function () { Object.keys(cache).forEach(function (k) { delete cache[k]; }); }
  };

  // 兼容：旧代码可能还引用 LESSONS.length 之类的字段

})(typeof globalThis !== 'undefined' ? globalThis : this);
