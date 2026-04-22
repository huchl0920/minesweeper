/* =====================================================
   Minesweeper – app.js
   ===================================================== */

// ── Difficulty presets ─────────────────────────────────
const DIFFICULTIES = {
  easy:   { rows:  9, cols:  9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

// ── State ──────────────────────────────────────────────
let state = {
  difficulty: 'easy',
  rows: 0, cols: 0, mines: 0,
  board: [],        // 2-D array of cell objects
  started: false,   // first click not yet made
  gameOver: false,
  minesLeft: 0,
  timerValue: 0,
  timerInterval: null,
};

// ── DOM refs ───────────────────────────────────────────
const boardEl      = document.getElementById('board');
const minesLeftEl  = document.getElementById('mines-left');
const timerEl      = document.getElementById('timer');
const faceEl       = document.getElementById('face-icon');
const resetBtn     = document.getElementById('reset-btn');
const overlay      = document.getElementById('overlay');
const overlayEmoji = document.getElementById('overlay-emoji');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub   = document.getElementById('overlay-subtitle');
const playAgainBtn = document.getElementById('play-again-btn');
const diffBtns     = document.querySelectorAll('.diff-btn');

// ── Init ───────────────────────────────────────────────
function initGame(difficulty) {
  clearInterval(state.timerInterval);

  const { rows, cols, mines } = DIFFICULTIES[difficulty];

  state = {
    difficulty,
    rows, cols, mines,
    board: [],
    started: false,
    gameOver: false,
    minesLeft: mines,
    timerValue: 0,
    timerInterval: null,
  };

  timerEl.textContent = '000';
  minesLeftEl.textContent = String(mines).padStart(3, '0');
  faceEl.textContent = '😊';
  overlay.classList.add('hidden');

  buildBoard();
  renderBoard();
}

// ── Build logical board ────────────────────────────────
function buildBoard() {
  state.board = [];
  for (let r = 0; r < state.rows; r++) {
    const row = [];
    for (let c = 0; c < state.cols; c++) {
      row.push({
        r, c,
        mine: false,
        revealed: false,
        flagged: false,
        adjacent: 0,
      });
    }
    state.board.push(row);
  }
}

// Place mines – avoid the first-click cell and its neighbours
function placeMines(safeR, safeC) {
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeR + dr, nc = safeC + dc;
      if (inBounds(nr, nc)) safe.add(`${nr},${nc}`);
    }
  }

  let placed = 0;
  while (placed < state.mines) {
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    const cell = state.board[r][c];
    if (!cell.mine && !safe.has(`${r},${c}`)) {
      cell.mine = true;
      placed++;
    }
  }

  // Compute adjacent counts
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (!state.board[r][c].mine) {
        state.board[r][c].adjacent = countAdjMines(r, c);
      }
    }
  }
}

function countAdjMines(r, c) {
  let count = 0;
  eachNeighbour(r, c, nb => { if (nb.mine) count++; });
  return count;
}

// ── Render board ───────────────────────────────────────
function renderBoard() {
  boardEl.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
  boardEl.innerHTML = '';

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.board[r][c];
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.r = r;
      el.dataset.c = c;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `列${r+1} 欄${c+1}`);
      el.addEventListener('click', onLeftClick);
      el.addEventListener('contextmenu', onRightClick);
      boardEl.appendChild(el);
    }
  }
}

// Get DOM element for a cell
function cellEl(r, c) {
  return boardEl.querySelector(`[data-r="${r}"][data-c="${c}"]`);
}

// ── Click handlers ─────────────────────────────────────
function onLeftClick(e) {
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  if (state.gameOver) return;

  const cell = state.board[r][c];
  if (cell.revealed || cell.flagged) return;

  // First click: place mines & start timer
  if (!state.started) {
    state.started = true;
    placeMines(r, c);
    startTimer();
  }

  if (cell.mine) {
    triggerExplosion(r, c);
    return;
  }

  revealCell(r, c);
  checkWin();
}

function onRightClick(e) {
  e.preventDefault();
  const r = +e.currentTarget.dataset.r;
  const c = +e.currentTarget.dataset.c;
  if (state.gameOver) return;

  const cell = state.board[r][c];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;
  state.minesLeft += cell.flagged ? -1 : 1;
  minesLeftEl.textContent = String(state.minesLeft).padStart(3, '0');
  updateCellEl(r, c);
}

// ── Reveal logic (BFS flood-fill) ─────────────────────
function revealCell(r, c) {
  const queue = [[r, c]];
  const visited = new Set([`${r},${c}`]);

  while (queue.length) {
    const [cr, cc] = queue.shift();
    const cell = state.board[cr][cc];
    if (cell.revealed || cell.flagged) continue;

    cell.revealed = true;
    updateCellEl(cr, cc, true);

    if (cell.adjacent === 0 && !cell.mine) {
      eachNeighbour(cr, cc, nb => {
        const key = `${nb.r},${nb.c}`;
        if (!visited.has(key) && !nb.revealed && !nb.flagged && !nb.mine) {
          visited.add(key);
          queue.push([nb.r, nb.c]);
        }
      });
    }
  }
}

// ── Update a single cell's DOM ─────────────────────────
function updateCellEl(r, c, animate = false) {
  const cell = state.board[r][c];
  const el = cellEl(r, c);
  if (!el) return;

  el.className = 'cell';
  el.textContent = '';

  if (cell.revealed) {
    el.classList.add('revealed');
    if (animate) el.classList.add('reveal-anim');
    if (cell.mine) {
      el.textContent = '💣';
      el.classList.add('mine-revealed');
    } else if (cell.adjacent > 0) {
      el.textContent = cell.adjacent;
      el.classList.add(`n${cell.adjacent}`);
    }
  } else if (cell.flagged) {
    el.classList.add('flagged');
    el.textContent = '🚩';
  }
}

// ── Win / Lose ─────────────────────────────────────────
function checkWin() {
  const total = state.rows * state.cols;
  let revealed = 0;
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++)
      if (state.board[r][c].revealed) revealed++;

  if (revealed === total - state.mines) {
    endGame(true);
  }
}

function triggerExplosion(r, c) {
  state.gameOver = true;
  clearInterval(state.timerInterval);
  faceEl.textContent = '😵';

  // Mark the clicked mine
  const clickedCell = state.board[r][c];
  clickedCell.revealed = true;
  const hitEl = cellEl(r, c);
  if (hitEl) { hitEl.className = 'cell mine-hit'; hitEl.textContent = '💣'; }

  // Reveal all other mines with a cascading delay
  let delay = 80;
  for (let dr = 0; dr < state.rows; dr++) {
    for (let dc = 0; dc < state.cols; dc++) {
      const cell = state.board[dr][dc];
      if (cell.mine && !(dr === r && dc === c)) {
        setTimeout(() => {
          cell.revealed = true;
          updateCellEl(dr, dc);
        }, delay);
        delay += 25;
      }
    }
  }

  setTimeout(() => showOverlay(false), delay + 400);
}

function endGame(won) {
  state.gameOver = true;
  clearInterval(state.timerInterval);
  faceEl.textContent = won ? '😎' : '😵';

  if (won) {
    // Auto-flag remaining mines
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = state.board[r][c];
        if (cell.mine && !cell.flagged) {
          cell.flagged = true;
          updateCellEl(r, c);
        }
      }
    }
    minesLeftEl.textContent = '000';
  }

  setTimeout(() => showOverlay(won), 600);
}

function showOverlay(won) {
  overlayEmoji.textContent = won ? '🎉' : '💥';
  overlayTitle.textContent = won ? '你贏了！' : '踩到地雷！';
  const secs = state.timerValue;
  overlaySub.textContent = won
    ? `用時 ${secs} 秒，太厲害了！`
    : '別灰心，再試一次！';
  overlay.classList.remove('hidden');
}

// ── Timer ──────────────────────────────────────────────
function startTimer() {
  state.timerInterval = setInterval(() => {
    state.timerValue = Math.min(state.timerValue + 1, 999);
    timerEl.textContent = String(state.timerValue).padStart(3, '0');
  }, 1000);
}

// ── Helpers ────────────────────────────────────────────
function inBounds(r, c) {
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
}

function eachNeighbour(r, c, fn) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) fn(state.board[nr][nc]);
    }
  }
}

// ── Event listeners ────────────────────────────────────
resetBtn.addEventListener('click', () => initGame(state.difficulty));
playAgainBtn.addEventListener('click', () => initGame(state.difficulty));

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    initGame(btn.dataset.diff);
  });
});

// Prevent context menu on the whole board
boardEl.addEventListener('contextmenu', e => e.preventDefault());

// ── Start ──────────────────────────────────────────────
initGame('easy');
