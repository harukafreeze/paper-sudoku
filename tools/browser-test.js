/*
 * 浏览器端冒烟测试：用 CDP 驱动无头 Chrome
 * 跑法：node tools/browser-test.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const ROOT = path.resolve(__dirname, '..');
const URL_MAIN = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(__dirname, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-chrome-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--force-device-scale-factor=1',
  '--window-size=1280,1000',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  URL_MAIN
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* 还没起来 */ }
    await sleep(200);
  }
  throw new Error('连不上 Chrome');
}

let ws, msgId = 0;
const pending = new Map();
const errors = [];
const logs = [];

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (r.exceptionDetails) {
    throw new Error('页面异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

(async function main() {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception && d.exception.description || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const t = msg.params.type;
      const text = msg.params.args.map(a => a.value === undefined ? a.description : a.value).join(' ');
      if (t === 'error') errors.push(text);
      logs.push(t + ': ' + text);
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push(e.text);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await sleep(600);
  await evaluate("window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(e.message+' @'+e.filename+':'+e.lineno+':'+e.colno)})");

  console.log('\n[1] 首页');
  check('SD 命名空间存在', await evaluate('!!window.SD && !!SD.core && !!SD.ui'));
  check('七个难度卡', (await evaluate("document.querySelectorAll('.diff-card').length")) === 7);
  check('极限是横贯卡', await evaluate("!!document.querySelector('.diff-extreme')"));
  check('每日卡片已渲染', (await evaluate("document.querySelector('#daily-card').innerHTML.length")) > 40);
  await shot('01-home');
  const fullH = await evaluate('document.documentElement.scrollHeight');
  {
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1280, height: Math.min(fullH, 2600), scale: 1 }
    });
    fs.writeFileSync(path.join(SHOTS, '01b-home-full.png'), Buffer.from(r.data, 'base64'));
  }

  console.log('\n[2] 开一局中等');
  await evaluate("document.querySelector('.diff-card[data-level=\\\"3\\\"]').click()");
  await sleep(1200);
  check('棋盘 81 格', (await evaluate("document.querySelectorAll('#board .cell').length")) === 81);
  const info = await evaluate("(function(){var g=SD.ui.state.game; return g?{givens:81-SD.core.countEmpty(g.puzzle),level:g.difficulty.id,empty:SD.core.countEmpty(g.grid)}:null})()");
  check('生成了对局', !!info, info);
  check('难度是中等', info && info.level === 3, info);
  check('提示数在合理范围', info && info.givens >= 20 && info.givens <= 45, info);
  check('游戏屏已激活', await evaluate("document.querySelector('[data-screen=game]').classList.contains('active')"));
  check('加载遮罩已隐藏', await evaluate("document.querySelector('#loading-veil').hidden"));

  console.log('\n[3] 填数');
  const firstEmpty = await evaluate("SD.ui.state.game.grid.findIndex(function(v){return v===0})");
  await evaluate("document.querySelectorAll('#board .cell')[" + firstEmpty + "].click()");
  await sleep(60);
  const firstVal = await evaluate("SD.ui.state.game.solution[" + firstEmpty + "]");
  await evaluate("document.querySelectorAll('.num')[" + (firstVal - 1) + "].click()");
  await sleep(120);
  const after = await evaluate("(function(){var g=SD.ui.state.game;return {v:g.grid[" + firstEmpty + "],mistakes:g.mistakes,text:document.querySelectorAll('#board .cell')[" + firstEmpty + "].textContent}})()");
  check('格子显示了数字', after.text.trim().length > 0, after);
  check('输入被记录', after.v > 0, after);

  console.log('\n[4] 笔记模式 / 撤销');
  await evaluate("document.querySelector('[data-act=note]').click()");
  const empty2 = await evaluate("SD.ui.state.game.grid.findIndex(function(v){return v===0})");
  await evaluate("document.querySelectorAll('#board .cell')[" + empty2 + "].click()");
  await evaluate("document.querySelectorAll('.num')[1].click()");
  await sleep(80);
  check('笔记写进去了', await evaluate("SD.ui.state.game.notes[" + empty2 + "] > 0"));
  await evaluate("document.querySelector('[data-act=note]').click()");
  await evaluate("document.querySelector('[data-act=undo]').click()");
  await sleep(80);
  check('撤销生效', (await evaluate("SD.ui.state.game.notes[" + empty2 + "]")) === 0);

  console.log('\n[5] 三级提示');
  await evaluate("document.querySelector('[data-act=hint]').click()");
  await sleep(200);
  check('提示浮层出现', await evaluate("!document.querySelector('#hint-popover').hidden"));
  const h1 = await evaluate("document.querySelector('#pop-kicker').textContent");
  check('第一级提示', h1.indexOf('1 / 3') >= 0, h1);
  const title1 = await evaluate("document.querySelector('#pop-title').textContent");
  check('提示带技巧名', title1.length > 0, title1);
  await evaluate("document.querySelector('[data-act=hint-next]').click()");
  await sleep(150);
  check('第二级提示', (await evaluate("document.querySelector('#pop-kicker').textContent")).indexOf('2 / 3') >= 0);
  await evaluate("document.querySelector('[data-act=hint-next]').click()");
  await sleep(300);
  check('第三级提示已落子', (await evaluate("SD.ui.state.game.hints")) === 1);
  await evaluate("document.querySelector('[data-act=hint-close]').click()");
  await sleep(3600);

  await shot('02-game');

  console.log('\n[6] 暂停');
  await evaluate("document.querySelector('[data-act=pause]').click()");
  await sleep(120);
  check('暂停遮罩显示', await evaluate("!document.querySelector('#pause-veil').hidden"));
  await evaluate("document.querySelector('[data-act=unpause]').click()");
  await sleep(120);
  check('恢复后遮罩隐藏', await evaluate("document.querySelector('#pause-veil').hidden"));

  console.log('\n[7] 通关流程');
  const sol = await evaluate("SD.core.format(SD.ui.state.game.solution)");
  await evaluate("(function(){var g=SD.ui.state.game; g.grid=SD.core.parse('" + sol + "'); g._finish();})()");
  await sleep(500);
  check('胜利弹窗出现', await evaluate("!document.querySelector('#win-modal').hidden"));
  check('星级已渲染', (await evaluate("document.querySelectorAll('#win-stars .star.on').length")) >= 1);
  const rec = await evaluate("JSON.parse(localStorage.getItem('paper-sudoku.v1'))");
  check('战绩已写入', !!(rec && rec.stats && rec.stats.medium && rec.stats.medium.won === 1), rec && rec.stats);
  await shot('03-win');
  await evaluate("document.querySelector('[data-act=win-home]').click()");
  await sleep(400);

  console.log('\n[8] 战绩页');
  await evaluate("document.querySelector('.tab[data-nav=stats]').click()");
  await sleep(300);
  check('难度表有 7 行', (await evaluate("document.querySelectorAll('#diff-table tbody tr').length")) === 7);
  check('成就 11 个', (await evaluate("document.querySelectorAll('#ach-grid .ach').length")) === 11);
  check('至少解锁一个成就', (await evaluate("document.querySelectorAll('#ach-grid .ach.on').length")) >= 1);
  await shot('04-stats');

  console.log('\n[9] 图鉴');
  await evaluate("document.querySelector('.tab[data-nav=codex]').click()");
  await sleep(300);
  check('图鉴 11 张卡', (await evaluate("document.querySelectorAll('#codex-grid .codex-card').length")) === 11);
  await shot('05-codex');

  console.log('\n[10] 课程');
  await evaluate("document.querySelector('#codex-grid [data-lesson=\\\"1\\\"]').click()");
  await sleep(1500);
  check('课程屏激活', await evaluate("document.querySelector('[data-screen=lesson]').classList.contains('active')"));
  check('教学棋盘渲染了给定数', (await evaluate("document.querySelectorAll('#lesson-board .cell.given').length")) > 15);
  const accept = await evaluate("SD.ui.state.lessonEx ? SD.ui.state.lessonEx.accept[0] : -1");
  check('找到了示例', accept >= 0, accept);
  if (accept >= 0) {
    await evaluate("document.querySelectorAll('#lesson-board .cell')[" + accept + "].click()");
    await sleep(220);
    check('答对后给出解释', (await evaluate("document.querySelector('#lesson-feedback').className")).indexOf('good') >= 0);
    check('下一课按钮出现', await evaluate("!document.querySelector('#lesson-next').hidden"));
    check('课程进度已记录', await evaluate("!!JSON.parse(localStorage.getItem('paper-sudoku.v1')).tutorial['1']"));
  }
  await shot('06-lesson');

  console.log('\n[11] 设置');
  await evaluate("document.querySelector('.tab[data-nav=settings]').click()");
  await sleep(300);
  check('四个开关', (await evaluate("document.querySelectorAll('.switch').length")) === 4);
  const before = await evaluate("SD.store.setting('strictErrors')");
  await evaluate("document.querySelector('.switch[data-set=strictErrors]').click()");
  await sleep(150);
  check('开关可切换', (await evaluate("SD.store.setting('strictErrors')")) === !before);
  await evaluate("document.querySelector('.switch[data-set=strictErrors]').click()");
  await shot('07-settings');

  console.log('\n[12] 刷新后存档');
  await evaluate("document.querySelector('.tab[data-nav=home]').click()");
  await sleep(300);
  check('首页显示战绩统计', (await evaluate("document.querySelector('#foot-plays').textContent")) !== '0');
  await shot('08-home-after');

  console.log('\n[13] 手机尺寸');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });
  await send('Page.reload');
  await sleep(1600);
  const w = await evaluate("document.querySelector('.board').getBoundingClientRect().width");
  const vw = await evaluate('window.innerWidth');
  check('棋盘不溢出屏幕', w <= vw, { w, vw });
  const cols = await evaluate("getComputedStyle(document.querySelector('#diff-grid')).gridTemplateColumns.split(' ').length");
  check('手机上难度卡两列', cols === 2, cols);
  await shot('09-mobile-home');
  {
    const mh = await evaluate('document.documentElement.scrollHeight');
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 390, height: Math.min(mh, 2600), scale: 1 }
    });
    fs.writeFileSync(path.join(SHOTS, '09b-mobile-full.png'), Buffer.from(r.data, 'base64'));
  }
  await evaluate("document.querySelector('.diff-card[data-level=\\\"3\\\"]').click()");
  await sleep(1200);
  await shot('10-mobile-game');
  check('手机对局可玩', (await evaluate("document.querySelectorAll('#board .cell').length")) === 81);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(200);

  console.log('\n[14] 每日挑战');
  await evaluate("document.querySelector('.tab[data-nav=home]').click()");
  await sleep(400);
  check('每日卡有开始按钮', await evaluate("!!document.querySelector('[data-act=daily-start]')"));
  await evaluate("document.querySelector('[data-act=daily-start]').click()");
  await sleep(1500);
  const dmode = await evaluate("SD.ui.state.game && SD.ui.state.game.mode");
  check('进入每日模式', dmode === 'daily', dmode);
  check('今日日期已记录', await evaluate("SD.ui.state.game && SD.ui.state.game.day === SD.store.todayStr()"));
  const dsol = await evaluate("SD.core.format(SD.ui.state.game.solution)");
  await evaluate("(function(){var g=SD.ui.state.game; g.grid=SD.core.parse('" + dsol + "'); g._finish();})()");
  await sleep(500);
  const dailyRec = await evaluate("(function(){var d=JSON.parse(localStorage.getItem('paper-sudoku.v1'));return {done:!!d.daily.done[SD.store.todayStr()],streak:d.daily.streak}})()");
  check('每日成绩落库', dailyRec.done, dailyRec);
  check('连续天数 +1', dailyRec.streak >= 1, dailyRec);
  await evaluate("document.querySelector('[data-act=win-home]').click()");
  await sleep(400);
  check('每日卡变成已完成', await evaluate("!!document.querySelector('#daily-card .pill.done')"));

  console.log('\n[15] 极限难度');
  await evaluate("document.querySelector('.diff-extreme').click()");
  await sleep(2200);
  const exInfo = await evaluate("SD.ui.state.game ? {id:SD.ui.state.game.difficulty.id, sub:document.querySelector('#game-sub').textContent} : null");
  check('进入极限档', exInfo && exInfo.id === 7, exInfo);
  check('副标题说明了规则', !!(exInfo && exInfo.sub.indexOf('给一格') >= 0), exInfo && exInfo.sub);
  const needDepth = await evaluate("SD.core.assistDepth(SD.ui.state.game.puzzle, SD.ui.state.game.solution, 2)");
  check('这道题真的需要多格试探', needDepth >= 2, needDepth);
  check('极限盘面 81 格', (await evaluate("document.querySelectorAll('#board .cell').length")) === 81);
  await shot('11-extreme');

  console.log('\n---- 控制台错误 ----');
  const pageErrs = await evaluate("window.__errs || []");
  if (pageErrs.length) pageErrs.forEach(e => console.log('  ! ' + e));
  if (errors.length) {
    errors.slice(0, 12).forEach(e => console.log('  ! ' + String(e).split('\n')[0]));
  } else {
    console.log('  无');
  }

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败 / ' + errors.length + ' 报错');
  ws.close();
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('测试崩了:', e);
  try { ws && ws.close(); } catch (_) {}
  chrome.kill();
  process.exit(2);
});
