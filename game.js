'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 45;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const LEADERBOARD_KEY = 'tetris-leaderboard';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle-input');
const skinSelect = document.getElementById('skin-select');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControlsList = document.getElementById('pause-controls-list');
const startLevelSelect = document.getElementById('start-level-select');
const leaderboardListEl = document.getElementById('leaderboard-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetLeaderboardBtn = document.getElementById('reset-leaderboard-btn');
const newRecordNote = document.getElementById('new-record-note');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let currentSkin = localStorage.getItem('tetris-skin') || 'retro';
let startLevel = 1;
let combo, maxComboThisGame, pendingScoreSaved;

function updateThemeColors() {
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
}

function computeDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared > 0) {
    combo++;
    if (combo > maxComboThisGame) maxComboThisGame = combo;
  } else {
    combo = 0;
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = computeDropInterval(level);
    updateHUD();
  }
}

// ---- Leaderboard (localStorage) ----

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return { entries: [], bestCombo: 0, maxLines: 0 };
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries.slice(0, 5) : [],
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      maxLines: typeof parsed.maxLines === 'number' ? parsed.maxLines : 0,
    };
  } catch (e) {
    return { entries: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveLeaderboard(data) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage unavailable (private mode, quota, etc.) — ignore silently
  }
}

function wouldBeTopScore(candidateScore) {
  const data = loadLeaderboard();
  if (data.entries.length < 5) return true;
  return candidateScore > data.entries[data.entries.length - 1].score;
}

function renderLeaderboard(highlightIndex) {
  const data = loadLeaderboard();
  leaderboardListEl.innerHTML = '';
  if (data.entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'leaderboard-empty';
    li.textContent = 'Sin puntuaciones';
    leaderboardListEl.appendChild(li);
  } else {
    data.entries.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row' + (i === highlightIndex ? ' new-record' : '');

      const rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = `${i + 1}.`;

      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = entry.name;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'lb-score';
      scoreSpan.textContent = Number(entry.score).toLocaleString();

      li.append(rank, name, scoreSpan);
      leaderboardListEl.appendChild(li);
    });
  }
  bestComboEl.textContent = data.bestCombo;
  maxLinesEl.textContent = data.maxLines;
}

function saveScore() {
  if (!gameOver || pendingScoreSaved) return;
  const rawName = nameInput.value.trim();
  const name = rawName ? rawName.slice(0, 12) : 'AAA';
  const data = loadLeaderboard();
  const newEntry = { name, score };
  data.entries.push(newEntry);
  data.entries.sort((a, b) => b.score - a.score);
  data.entries = data.entries.slice(0, 5);
  if (maxComboThisGame > data.bestCombo) data.bestCombo = maxComboThisGame;
  if (lines > data.maxLines) data.maxLines = lines;
  saveLeaderboard(data);
  const highlightIndex = data.entries.indexOf(newEntry);
  renderLeaderboard(highlightIndex);
  pendingScoreSaved = true;
  nameInput.disabled = true;
  saveScoreBtn.disabled = true;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlockRetro(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS[currentSkin].colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockNeon(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS[currentSkin].colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 15;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // reset shadow immediately so it doesn't bleed onto grid lines / later draws
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBlockPastel(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS[currentSkin].colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  const r = Math.min(6, w / 2, h / 2);

  context.fillStyle = color;
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(px, py, w, h, r);
  } else {
    context.moveTo(px + r, py);
    context.lineTo(px + w - r, py);
    context.quadraticCurveTo(px + w, py, px + w, py + r);
    context.lineTo(px + w, py + h - r);
    context.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
    context.lineTo(px + r, py + h);
    context.quadraticCurveTo(px, py + h, px, py + h - r);
    context.lineTo(px, py + r);
    context.quadraticCurveTo(px, py, px + r, py);
    context.closePath();
  }
  context.fill();

  // soft highlight, inset so it stays within the rounded corners
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px + r, py + 2, Math.max(0, w - 2 * r), 3);
  context.globalAlpha = 1;
}

function drawBlockPixel(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKINS[currentSkin].colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;

  context.fillStyle = color;
  context.fillRect(px, py, w, h);

  // pixel-art checker texture on top of the base fill
  const sub = Math.max(2, Math.floor(size / 6));
  context.fillStyle = 'rgba(0,0,0,0.15)';
  for (let sy = 0, row = 0; sy < h; sy += sub, row++) {
    for (let sx = 0, col = 0; sx < w; sx += sub, col++) {
      if ((row + col) % 2 === 0) {
        context.fillRect(px + sx, py + sy, Math.min(sub, w - sx), Math.min(sub, h - sy));
      }
    }
  }

  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px, py, w, 4);
  context.globalAlpha = 1;
}

const SKINS = {
  retro: {
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#64b5f6', // J - pale blue
      '#ffb74d', // L - orange
    ],
    drawBlock: drawBlockRetro,
  },
  neon: {
    colors: [
      null,
      '#00fff5', // I - electric cyan
      '#faff00', // O - electric yellow
      '#e100ff', // T - magenta
      '#39ff14', // S - electric green
      '#ff2079', // Z - hot pink
      '#00aaff', // J - electric blue
      '#ff8c00', // L - electric orange
    ],
    drawBlock: drawBlockNeon,
  },
  pastel: {
    colors: [
      null,
      '#a8dadc', // I - pastel cyan
      '#fdf1b8', // O - pastel yellow
      '#d8bfd8', // T - pastel purple
      '#b5ead7', // S - pastel green
      '#f7c6c7', // Z - pastel red
      '#bcd4e6', // J - pastel blue
      '#ffdfba', // L - pastel orange
    ],
    drawBlock: drawBlockPastel,
  },
  pixel: {
    colors: [
      null,
      '#4dd0e1',
      '#ffd54f',
      '#ba68c8',
      '#81c784',
      '#e57373',
      '#64b5f6',
      '#ffb74d',
    ],
    drawBlock: drawBlockPixel,
  },
};

// guard against a stale/invalid value in localStorage (e.g. from a removed skin)
if (!SKINS[currentSkin]) currentSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  SKINS[currentSkin].drawBlock(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  pendingScoreSaved = false;
  nameInput.value = '';
  nameInput.disabled = false;
  saveScoreBtn.disabled = false;

  if (wouldBeTopScore(score)) {
    newRecordNote.textContent = '¡Nuevo récord!';
    newRecordNote.classList.remove('hidden');
  } else {
    newRecordNote.textContent = '';
    newRecordNote.classList.add('hidden');
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseOverlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = computeDropInterval(level);
  dropAccum = 0;
  lastTime = performance.now();
  combo = 0;
  maxComboThisGame = 0;
  pendingScoreSaved = false;
  updateThemeColors();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  pauseControlsList.classList.add('hidden');
  newRecordNote.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('light-mode', themeToggle.checked);
  updateThemeColors();
  draw();
  drawNext();
});

skinSelect.value = currentSkin;
skinSelect.addEventListener('change', () => {
  currentSkin = skinSelect.value;
  localStorage.setItem('tetris-skin', currentSkin);
  draw();
  drawNext();
});

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', init);

controlsBtn.addEventListener('click', () => {
  pauseControlsList.classList.toggle('hidden');
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Math.min(10, Math.max(1, parseInt(startLevelSelect.value, 10) || 1));
});

saveScoreBtn.addEventListener('click', saveScore);

nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScore();
});

resetLeaderboardBtn.addEventListener('click', () => {
  if (confirm('¿Seguro que quieres resetear los récords?')) {
    saveLeaderboard({ entries: [], bestCombo: 0, maxLines: 0 });
    renderLeaderboard();
  }
});

renderLeaderboard();
init();
