/**
 * 快乐小鸡 - Canvas 版
 * 切图：eggs.png（8 个蛋横排）、chickens.png（4 帧小鸡横排），ctx.drawImage 九参数绘制
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const parentSettings = document.getElementById('parent-settings');
const soundToggle = document.getElementById('sound-toggle');
const autofullscreenToggle = document.getElementById('autofullscreen-toggle');
const resetBtn = document.getElementById('reset-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

// 精灵图：鸡蛋 8 枚横排、小鸡 4 帧横排
const eggSheet = new Image();
eggSheet.src = 'eggs.png';
const chickSheet = new Image();
chickSheet.src = 'chickens.png';

// 切图数据：图片加载后按均分计算 (sx, sy, sWidth, sHeight)
// eggs.png: 8 个蛋，顺序 [棕, 蓝纹, 粉纹, 橙点, 绿纹, 紫星, 黄格, 浅蓝几何]
const EGG_COUNT = 8;
const CHICK_FRAME_COUNT = 4;
const eggRects = [];   // { sx, sy, sWidth, sHeight } x8
const chickRects = []; // { sx, sy, sWidth, sHeight } x4

function computeEggRects() {
  eggRects.length = 0;
  if (!eggSheet.complete || !eggSheet.naturalWidth) return;
  const w = eggSheet.naturalWidth;
  const h = eggSheet.naturalHeight;
  const sWidth = w / EGG_COUNT;
  const sHeight = h;
  for (let i = 0; i < EGG_COUNT; i++) {
    eggRects.push({
      sx: i * sWidth,
      sy: 0,
      sWidth,
      sHeight,
    });
  }
}

function computeChickRects() {
  chickRects.length = 0;
  if (!chickSheet.complete || !chickSheet.naturalWidth) return;
  const w = chickSheet.naturalWidth;
  const h = chickSheet.naturalHeight;
  const sWidth = w / CHICK_FRAME_COUNT;
  const sHeight = h;
  for (let i = 0; i < CHICK_FRAME_COUNT; i++) {
    chickRects.push({
      sx: i * sWidth,
      sy: 0,
      sWidth,
      sHeight,
    });
  }
}

// eggs.png：第一个为普通鸡蛋，后面 7 个为彩色鸡蛋（记分时彩蛋算一类）
// 索引 0=普通棕蛋，1–7=彩蛋（蓝/粉/橙/绿/紫/黄/浅蓝）
function getEggSheetIndex(eggType) {
  const map = { brown: 0, blue: 1, pink: 2, orange: 3, green: 4, purple: 5, yellow: 6, lightblue: 7 };
  return map[eggType] ?? 0;
}

// 画布上绘制尺寸（缩放以适配屏幕）
const EGG_DISPLAY_W = 65;
const EGG_DISPLAY_H = 70;

// 蛋破后孵出的小鸡：按蛋的尺寸等比例缩放，保证从蛋里“钻出来”大小合适且不变形
function getChickDisplaySizeFromEgg() {
  if (chickRects.length > 0) {
    const r = chickRects[0];
    const scale = Math.min(EGG_DISPLAY_W / r.sWidth, EGG_DISPLAY_H / r.sHeight);
    return {
      w: Math.round(r.sWidth * scale),
      h: Math.round(r.sHeight * scale),
    };
  }
  return { w: 65, h: 70 };
}

const GameState = {
  soundEnabled: true,
  autofullscreen: true,
  activeTouches: new Map(),
  maxConcurrentTouches: 5,
};

let audioContext = null;
let henAudio = null;   // <audio src="chick_3s.mp3">，与图片一样从当前目录加载
let henStopTimeout = null;   // 下蛋声只播 0–2s
let crackAudio = null; // <audio src="egg.mp3">
let crackStopTimeout = null; // 播放 0–2s 后暂停用
// 普通蛋 50%，7 种彩蛋合计 50%（每种彩蛋均分）
const SPECIAL_EGG_PROBABILITY = 0.5;

// 游戏实体
const eggs = [];
const chickens = [];
let animationId = null;

// 记分：普通蛋、彩蛋（彩蛋算一类）
let normalEggCount = 0;
let coloredEggCount = 0;

// 屏幕上常驻的一只大鸡：点击后先飞快跑过去，到了再下蛋
const MAIN_CHICKEN_PX_PER_FRAME = 10;  // 每帧移动像素，飞快
const MAIN_CHICKEN_SCALE = 1.85;       // 大鸡相对“蛋里孵出的小鸡”的放大倍数
let mainChicken = null;

function getMainChickSize() {
  const base = getChickDisplaySizeFromEgg();
  return {
    w: Math.round(base.w * MAIN_CHICKEN_SCALE),
    h: Math.round(base.h * MAIN_CHICKEN_SCALE),
  };
}

function initMainChicken() {
  const size = getMainChickSize();
  const x0 = canvas.width / 2 - size.w / 2;
  const y0 = canvas.height * 0.65 - size.h / 2;
  mainChicken = {
    x: x0,
    y: y0,
    startX: x0,
    startY: y0,
    targetX: null,
    targetY: null,
    pendingEgg: null,  // 到达后要下的蛋：{ centerX, centerY }
    displayW: size.w,
    displayH: size.h,
    walkStartTime: 0,
    idleFacingLeft: false, // 停下后面朝方向：true=朝左，false=朝右（精灵默认朝右）
  };
}

function updateMainChicken() {
  if (!mainChicken) return;
  const m = mainChicken;
  if (m.targetX == null || m.targetY == null || !m.pendingEgg) return;
  const dx = m.targetX - m.x;
  const dy = m.targetY - m.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 3) {
    m.x = m.targetX;
    m.y = m.targetY;
    // 停下后保持面朝刚才的移动方向
    m.idleFacingLeft = m.targetX < (m.startX ?? m.x);
    // 蛋下在鸡屁股下面，不重叠
    const eggCenterX = m.x + m.displayW / 2;
    const eggCenterY = m.y + m.displayH + 4 + EGG_DISPLAY_H / 2;
    layEggAtPosition(eggCenterX, eggCenterY);
    m.pendingEgg = null;
    m.targetX = null;
    m.targetY = null;
    return;
  }
  const move = Math.min(dist, MAIN_CHICKEN_PX_PER_FRAME);
  m.x += (dx / dist) * move;
  m.y += (dy / dist) * move;
}

function init() {
  henAudio = document.getElementById('audio-hen');
  crackAudio = document.getElementById('audio-crack');
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('音频上下文初始化失败:', e);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  gameContainer.addEventListener('click', handleClick);
  gameContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
  gameContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
  gameContainer.addEventListener('touchcancel', handleTouchEnd, { passive: true });

  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });

  let settingsKeyPress = '';
  let settingsKeyTimeout = null;
  document.addEventListener('keydown', (e) => {
    const target = 'PARENT';
    if (e.key.toUpperCase() === target[settingsKeyPress.length]) {
      settingsKeyPress += e.key.toUpperCase();
      clearTimeout(settingsKeyTimeout);
      settingsKeyTimeout = setTimeout(() => { settingsKeyPress = ''; }, 2000);
      if (settingsKeyPress === target) {
        showParentSettings();
        settingsKeyPress = '';
      }
    } else {
      settingsKeyPress = '';
    }
  });

  soundToggle.addEventListener('change', (e) => {
    GameState.soundEnabled = e.target.checked;
    saveSettings();
  });
  autofullscreenToggle.addEventListener('change', (e) => {
    GameState.autofullscreen = e.target.checked;
    saveSettings();
  });
  resetBtn.addEventListener('click', () => {
    eggs.length = 0;
    chickens.length = 0;
    normalEggCount = 0;
    coloredEggCount = 0;
    GameState.activeTouches.clear();
    if (mainChicken && canvas.width > 0) {
      const size = getMainChickSize();
      mainChicken.x = canvas.width / 2 - size.w / 2;
      mainChicken.y = canvas.height * 0.65 - size.h / 2;
      mainChicken.targetX = null;
      mainChicken.targetY = null;
      mainChicken.pendingEgg = null;
    }
    hideParentSettings();
  });
  closeSettingsBtn.addEventListener('click', hideParentSettings);

  loadSettings();

  if (GameState.autofullscreen) {
    gameContainer.addEventListener('click', () => {
      if (GameState.autofullscreen && !document.fullscreenElement) toggleFullscreen();
    }, { once: true });
  }

  gameLoop();
  eggSheet.onload = () => {
    computeEggRects();
    console.log('eggs.png 已加载:', eggSheet.naturalWidth, 'x', eggSheet.naturalHeight);
  };
  eggSheet.onerror = () => console.error('eggs.png 加载失败，请与 index.html 同目录');
  chickSheet.onload = () => {
    computeChickRects();
    console.log('chickens.png 已加载:', chickSheet.naturalWidth, 'x', chickSheet.naturalHeight);
  };
  chickSheet.onerror = () => console.error('chickens.png 加载失败，请与 index.html 同目录');
}

function resizeCanvas() {
  const w = Math.max(gameContainer.clientWidth || window.innerWidth, 300);
  const h = Math.max(gameContainer.clientHeight || window.innerHeight, 300);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

function getCanvasRect() {
  return canvas.getBoundingClientRect();
}

function clientToCanvas(clientX, clientY) {
  const rect = getCanvasRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function handleClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const { x, y } = clientToCanvas(e.clientX, e.clientY);
  createEggAtPosition(x, y);
}

function handleTouchStart(e) {
  e.preventDefault();
  const touches = Array.from(e.touches);
  const maxTouches = Math.min(touches.length, GameState.maxConcurrentTouches);
  for (let i = 0; i < maxTouches; i++) {
    const touch = touches[i];
    if (!GameState.activeTouches.has(touch.identifier)) {
      GameState.activeTouches.set(touch.identifier, true);
      const { x, y } = clientToCanvas(touch.clientX, touch.clientY);
      createEggAtPosition(x, y);
    }
  }
}

function handleTouchEnd(e) {
  Array.from(e.changedTouches).forEach(t => GameState.activeTouches.delete(t.identifier));
}

// 彩蛋对应 eggs.png 中第 2–8 枚（索引 1–7）
const SPECIAL_EGG_TYPES = ['blue', 'pink', 'orange', 'green', 'purple', 'yellow', 'lightblue'];

function ensureAudioResumed() {
  if (audioContext && audioContext.state === 'suspended') {
    return audioContext.resume();
  }
  return Promise.resolve();
}

// 大鸡到达后真正下蛋（生成蛋 + 音效）
function layEggAtPosition(centerX, centerY) {
  ensureAudioResumed();
  const isSpecial = Math.random() < SPECIAL_EGG_PROBABILITY;
  const eggType = isSpecial
    ? SPECIAL_EGG_TYPES[Math.floor(Math.random() * SPECIAL_EGG_TYPES.length)]
    : 'brown';

  eggs.push({
    x: centerX - EGG_DISPLAY_W / 2,
    y: centerY - EGG_DISPLAY_H / 2,
    phase: 'appear',
    phaseStartTime: performance.now(),
    isSpecial,
    eggType,
  });

  if (isSpecial) coloredEggCount += 1;
  else normalEggCount += 1;

  // 母鸡每次下蛋都叫
  if (GameState.soundEnabled) playHenLaySound();
  if (GameState.soundEnabled) playEggAppearSound(); // 蛋出现：egg.mp3 开头 0.5 秒
}

// 点击：大鸡先飞快跑过去，到了再下蛋（这里只设目标与待下蛋位置）
function createEggAtPosition(centerX, centerY) {
  ensureAudioResumed();
  if (!mainChicken) return;
  const size = getMainChickSize();
  mainChicken.startX = mainChicken.x;
  mainChicken.startY = mainChicken.y;
  mainChicken.targetX = centerX - size.w / 2;
  mainChicken.targetY = centerY - size.h / 2;
  mainChicken.pendingEgg = { centerX, centerY };
}

// 从 eggs.png 切图绘制第 index 枚蛋 (0–7)
function drawEggSprite(eggIndex, dx, dy, dWidth, dHeight) {
  const r = eggRects[eggIndex];
  if (r && eggSheet.complete && eggSheet.naturalWidth > 0) {
    ctx.drawImage(
      eggSheet,
      r.sx, r.sy, r.sWidth, r.sHeight,
      dx, dy, dWidth, dHeight
    );
  } else {
    ctx.fillStyle = '#fff3e0';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(dx + dWidth / 2, dy + dHeight / 2, dWidth / 2, dHeight / 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// 从 chickens.png 切图绘制第 frameIndex 帧 (0–3)
function drawChickSprite(frameIndex, dx, dy, dWidth, dHeight) {
  const r = chickRects[frameIndex];
  if (r && chickSheet.complete && chickSheet.naturalWidth > 0) {
    ctx.drawImage(
      chickSheet,
      r.sx, r.sy, r.sWidth, r.sHeight,
      dx, dy, dWidth, dHeight
    );
  } else {
    ctx.fillStyle = '#ffeb3b';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.fillRect(dx, dy, dWidth, dHeight);
    ctx.strokeRect(dx, dy, dWidth, dHeight);
  }
}

function getEggSheetIndexForEgg(egg) {
  return getEggSheetIndex(egg.eggType);
}

function updateEggs(now) {
  const toRemove = [];
  const toAddChickens = [];

  for (let i = 0; i < eggs.length; i++) {
    const egg = eggs[i];
    const elapsed = now - egg.phaseStartTime;

    if (egg.phase === 'appear' && elapsed > 100) {
      egg.phase = 'shake';
      egg.phaseStartTime = now;
      if (GameState.soundEnabled) playEggShakeSound();
    } else if (egg.phase === 'shake' && elapsed > 2400) {
      egg.phase = 'crack';
      egg.phaseStartTime = now;
      if (GameState.soundEnabled) playCrackSound();
    } else if (egg.phase === 'crack' && elapsed > 450) {
      const size = getChickDisplaySizeFromEgg();
      toAddChickens.push({
        x: egg.x + EGG_DISPLAY_W / 2 - size.w / 2,
        y: egg.y + EGG_DISPLAY_H / 2 - size.h / 2,
        isSpecial: egg.isSpecial,
        eggType: egg.eggType,
        displayW: size.w,
        displayH: size.h,
      });
      toRemove.push(i);
    }
  }

  toRemove.reverse().forEach(index => eggs.splice(index, 1));
  toAddChickens.forEach(c => {
    chickens.push(createChickenState(c.x, c.y, c.isSpecial, c.eggType, c.displayW, c.displayH));
    if (GameState.soundEnabled) playChickenSound();
  });
}

function createChickenState(x, y, isSpecial, eggType, displayW, displayH) {
  const size = displayW != null && displayH != null
    ? { w: displayW, h: displayH }
    : getChickDisplaySizeFromEgg();
  const edges = ['top', 'bottom', 'left', 'right'];
  const edge = edges[Math.floor(Math.random() * edges.length)];
  const duration = 2200;
  const cw = canvas.width;
  const ch = canvas.height;
  let targetX = x;
  let targetY = y;
  if (edge === 'top') targetY = -size.h - 20;
  else if (edge === 'bottom') targetY = ch + 20;
  else if (edge === 'left') targetX = -size.w - 20;
  else targetX = cw + 20;

  return {
    x, y,
    startX: x, startY: y,
    targetX, targetY,
    startTime: performance.now(),
    duration,
    displayW: size.w,
    displayH: size.h,
    facingLeft: edge === 'left',  // chickens.png 默认朝右；往左走时翻转面朝左
    isSpecial,
    color: isSpecial ? (eggType === 'pink' ? 'pink' : 'blue') : 'yellow',
  };
}

function getChickenFrameIndex(chicken, now) {
  const elapsed = now - chicken.startTime;
  return Math.floor(elapsed / 120) % CHICK_FRAME_COUNT;
}

function updateChickens(now) {
  for (let i = chickens.length - 1; i >= 0; i--) {
    const c = chickens[i];
    const elapsed = now - c.startTime;
    const t = Math.min(1, elapsed / c.duration);
    c.x = c.startX + (c.targetX - c.startX) * t;
    c.y = c.startY + (c.targetY - c.startY) * t;
    if (t >= 1) chickens.splice(i, 1);
  }
}

function drawBackground() {
  const w = canvas.width;
  const h = canvas.height;

  // 天空：从上到下的蓝色渐变
  const skyG = ctx.createLinearGradient(0, 0, 0, h);
  skyG.addColorStop(0, '#4FC3F7');
  skyG.addColorStop(0.5, '#81D4FA');
  skyG.addColorStop(1, '#B3E5FC');
  ctx.fillStyle = skyG;
  ctx.fillRect(0, 0, w, h);

  // 草地：一两个大曲线，像远山/大地平线
  const baseY = h * 0.55;
  const wave1 = h * 0.07;  // 第一道大起伏
  const wave2 = h * 0.04;  // 第二道略小
  const len1 = w * 0.7;    // 波长约屏宽 70%，一整道大弧
  const len2 = w * 1.1;    // 第二道更缓

  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  const yR = baseY + wave1 * Math.sin((w / len1) * Math.PI * 2) + wave2 * Math.sin((w / len2) * Math.PI * 2 + 0.8);
  ctx.lineTo(w, yR);
  for (let x = w - 2; x >= 0; x -= 2) {
    const y = baseY + wave1 * Math.sin((x / len1) * Math.PI * 2) + wave2 * Math.sin((x / len2) * Math.PI * 2 + 0.8);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  const grassG = ctx.createLinearGradient(0, baseY, 0, h);
  grassG.addColorStop(0, '#7CB342');
  grassG.addColorStop(0.4, '#8BC34A');
  grassG.addColorStop(1, '#689F38');
  ctx.fillStyle = grassG;
  ctx.fill();
}

function gameLoop() {
  const now = performance.now();

  if (!mainChicken && canvas.width > 0) initMainChicken();
  updateMainChicken();
  updateEggs(now);
  updateChickens(now);

  drawBackground();

  // 先画大鸡（在蛋和小鸡下层）
  if (mainChicken) {
    const m = mainChicken;
    const size = getMainChickSize();
    m.displayW = size.w;
    m.displayH = size.h;
    const w = m.displayW;
    const h = m.displayH;
    const moving = m.targetX != null && m.targetY != null;
    const frameIndex = moving ? Math.floor(now / 120) % CHICK_FRAME_COUNT : 0;
    // chickens.png 默认面朝右。往左走或停下朝左时需水平翻转
    const movingLeft = moving && m.targetX < (m.startX ?? m.x);
    const faceLeft = moving ? movingLeft : m.idleFacingLeft;
    if (faceLeft) {
      ctx.save();
      ctx.translate(m.x + w, m.y);
      ctx.scale(-1, 1);
      drawChickSprite(frameIndex, 0, 0, w, h);
      ctx.restore();
    } else {
      drawChickSprite(frameIndex, m.x, m.y, w, h);
    }
  }

  for (const egg of eggs) {
    const index = getEggSheetIndexForEgg(egg);
    if (egg.phase === 'shake') {
      const elapsed = now - egg.phaseStartTime;
      const bounceDur = 350;
      const bounceY = elapsed < bounceDur
        ? -6 * Math.sin((elapsed / bounceDur) * Math.PI)
        : 0;
      const tiltElapsed = elapsed - bounceDur;
      const angle = tiltElapsed >= 0
        ? Math.sin(tiltElapsed * 0.01) * 0.1
        : 0;
      ctx.save();
      ctx.translate(0, bounceY);
      ctx.translate(egg.x + EGG_DISPLAY_W / 2, egg.y + EGG_DISPLAY_H);
      ctx.rotate(angle);
      ctx.translate(-EGG_DISPLAY_W / 2, -EGG_DISPLAY_H);
      drawEggSprite(index, 0, 0, EGG_DISPLAY_W, EGG_DISPLAY_H);
      ctx.restore();
    } else {
      drawEggSprite(index, egg.x, egg.y, EGG_DISPLAY_W, EGG_DISPLAY_H);
    }
  }

  for (const chicken of chickens) {
    const frameIndex = getChickenFrameIndex(chicken, now);
    const w = chicken.displayW ?? getChickDisplaySizeFromEgg().w;
    const h = chicken.displayH ?? getChickDisplaySizeFromEgg().h;
    if (chicken.facingLeft) {
      ctx.save();
      ctx.translate(chicken.x + w, chicken.y);
      ctx.scale(-1, 1);
      drawChickSprite(frameIndex, 0, 0, w, h);
      ctx.restore();
    } else {
      drawChickSprite(frameIndex, chicken.x, chicken.y, w, h);
    }
  }

  drawScore();
  animationId = requestAnimationFrame(gameLoop);
}

function drawScore() {
  const scale = 1.6;
  const padding = Math.round(10 * scale);
  const iconSize = Math.round(28 * scale);
  const lineHeight = iconSize + Math.round(6 * scale);
  const gap = Math.round(8 * scale);
  ctx.save();
  // 透明背景，不画底板

  const iconH = Math.round(iconSize * (EGG_DISPLAY_H / EGG_DISPLAY_W));
  const cy1 = padding + lineHeight / 2 - iconH / 2;
  const cy2 = padding + lineHeight + lineHeight / 2 - iconH / 2;

  drawEggSprite(0, padding, cy1, iconSize, iconH);
  drawEggSprite(1, padding, cy2, iconSize, iconH);

  ctx.font = `bold ${Math.round(18 * scale)}px sans-serif`;
  ctx.fillStyle = '#333';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(String(normalEggCount), padding + iconSize + gap, padding + lineHeight / 2);
  ctx.fillText(String(coloredEggCount), padding + iconSize + gap, padding + lineHeight + lineHeight / 2);
  ctx.restore();
}

// 母鸡下蛋：用 <audio src="chick_3s.mp3"> 播放，与图片同目录、file:// 可用
// 鸡下蛋：只播放 0–2 秒，不播太久
function playHenLaySound() {
  if (henAudio) {
    if (henStopTimeout) clearTimeout(henStopTimeout);
    henAudio.currentTime = 0;
    henAudio.play().catch(() => {});
    henStopTimeout = setTimeout(() => {
      henAudio.pause();
      henAudio.currentTime = 0;
      henStopTimeout = null;
    }, 2000);
  }
}

// 蛋出现：短促提示音（不用 egg.mp3，蛋破裂才用）
function playEggAppearSound() {
  if (!audioContext) return;
  ensureAudioResumed();
  try {
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(380, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  } catch (e) {}
}

function playEggShakeSound() {
  if (!audioContext) return;
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, audioContext.currentTime);
    gain.gain.setValueAtTime(0.15, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.3);
  } catch (e) {}
}

// 蛋壳破裂：用 <audio src="egg.mp3"> 只播放 0–2 秒
function playCrackSound() {
  if (crackAudio) {
    if (crackStopTimeout) clearTimeout(crackStopTimeout);
    crackAudio.currentTime = 0;
    crackAudio.play().catch(() => {});
    crackStopTimeout = setTimeout(() => {
      crackAudio.pause();
      crackAudio.currentTime = 0;
      crackStopTimeout = null;
    }, 2000);
  } else {
    ensureAudioResumed().then(() => { try { playCrackSoundFallback(); } catch (e) {} });
  }
}

function playCrackSoundFallback() {
  if (!audioContext) return;
  try {
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch (e) {}
}

function playChickenSound() {
  if (!audioContext) return;
  try {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + 0.2);
    osc.frequency.exponentialRampToValueAtTime(700, audioContext.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.4);
  } catch (e) {}
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (gameContainer.requestFullscreen) gameContainer.requestFullscreen();
    else if (gameContainer.webkitRequestFullscreen) gameContainer.webkitRequestFullscreen();
    else if (gameContainer.msRequestFullscreen) gameContainer.msRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }
}

function showParentSettings() {
  parentSettings.classList.remove('hidden');
  soundToggle.checked = GameState.soundEnabled;
  autofullscreenToggle.checked = GameState.autofullscreen;
}

function hideParentSettings() {
  parentSettings.classList.add('hidden');
}

function saveSettings() {
  try {
    localStorage.setItem('happyChickenSettings', JSON.stringify({
      soundEnabled: GameState.soundEnabled,
      autofullscreen: GameState.autofullscreen,
    }));
  } catch (e) {}
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('happyChickenSettings');
    if (saved) {
      const s = JSON.parse(saved);
      GameState.soundEnabled = s.soundEnabled !== undefined ? s.soundEnabled : true;
      GameState.autofullscreen = s.autofullscreen !== undefined ? s.autofullscreen : true;
    }
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
