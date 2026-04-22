import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// ── Types ──────────────────────────────────────────────
interface Cell {
  r: number; c: number
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjacent: number
}

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTIES: Record<Difficulty, { rows: number; cols: number; mines: number }> = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
}

// ── Helpers ────────────────────────────────────────────
function buildEmptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      r, c, mine: false, revealed: false, flagged: false, adjacent: 0,
    }))
  )
}

function inBounds(r: number, c: number, rows: number, cols: number) {
  return r >= 0 && r < rows && c >= 0 && c < cols
}

function neighbours(r: number, c: number, board: Cell[][]): Cell[] {
  const rows = board.length, cols = board[0].length
  const result: Cell[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      if (inBounds(r + dr, c + dc, rows, cols)) result.push(board[r + dr][c + dc])
    }
  return result
}

function placeMines(board: Cell[][], safeR: number, safeC: number, mines: number): Cell[][] {
  const next = board.map(row => row.map(cell => ({ ...cell })))
  const rows = next.length, cols = next[0].length
  const safe = new Set<string>()
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeR + dr, nc = safeC + dc
      if (inBounds(nr, nc, rows, cols)) safe.add(`${nr},${nc}`)
    }
  let placed = 0
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    if (!next[r][c].mine && !safe.has(`${r},${c}`)) { next[r][c].mine = true; placed++ }
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (!next[r][c].mine)
        next[r][c].adjacent = neighbours(r, c, next).filter(nb => nb.mine).length
  return next
}

function floodReveal(board: Cell[][], r: number, c: number): Cell[][] {
  const next = board.map(row => row.map(cell => ({ ...cell })))
  const queue = [[r, c]]
  const visited = new Set([`${r},${c}`])
  while (queue.length) {
    const [cr, cc] = queue.shift()!
    const cell = next[cr][cc]
    if (cell.revealed || cell.flagged) continue
    cell.revealed = true
    if (cell.adjacent === 0 && !cell.mine) {
      for (const nb of neighbours(cr, cc, next)) {
        const key = `${nb.r},${nb.c}`
        if (!visited.has(key) && !nb.revealed && !nb.flagged && !nb.mine) {
          visited.add(key); queue.push([nb.r, nb.c])
        }
      }
    }
  }
  return next
}

// ── Component ──────────────────────────────────────────
export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [board, setBoard] = useState<Cell[][]>(() => buildEmptyBoard(9, 9))
  const [started, setStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [minesLeft, setMinesLeft] = useState(10)
  const [timer, setTimer] = useState(0)
  const [showOverlay, setShowOverlay] = useState(false)
  const [explodingMines, setExplodingMines] = useState<Set<string>>(new Set())
  const [hitCell, setHitCell] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const startTimer = useCallback(() => {
    stopTimer()
    timerRef.current = setInterval(() => setTimer(t => Math.min(t + 1, 999)), 1000)
  }, [stopTimer])

  const initGame = useCallback((diff: Difficulty) => {
    stopTimer()
    const { rows, cols, mines } = DIFFICULTIES[diff]
    setDifficulty(diff)
    setBoard(buildEmptyBoard(rows, cols))
    setStarted(false)
    setGameOver(false)
    setWon(false)
    setMinesLeft(mines)
    setTimer(0)
    setShowOverlay(false)
    setExplodingMines(new Set())
    setHitCell(null)
  }, [stopTimer])

  // Cleanup on unmount
  useEffect(() => () => stopTimer(), [stopTimer])

  const handleLeftClick = useCallback((r: number, c: number) => {
    if (gameOver) return
    const cell = board[r][c]
    if (cell.revealed || cell.flagged) return

    let currentBoard = board
    let currentStarted = started

    if (!currentStarted) {
      currentBoard = placeMines(board, r, c, DIFFICULTIES[difficulty].mines)
      currentStarted = true
      setStarted(true)
      startTimer()
    }

    if (currentBoard[r][c].mine) {
      // Explosion
      stopTimer()
      setGameOver(true)
      setHitCell(`${r},${c}`)
      const updatedBoard = currentBoard.map(row => row.map(cell => ({ ...cell })))
      updatedBoard[r][c].revealed = true
      setBoard(updatedBoard)

      // Reveal other mines with cascade
      const otherMines: string[] = []
      for (let dr = 0; dr < updatedBoard.length; dr++)
        for (let dc = 0; dc < updatedBoard[0].length; dc++)
          if (updatedBoard[dr][dc].mine && !(dr === r && dc === c))
            otherMines.push(`${dr},${dc}`)

      let delay = 80
      const revealing = new Set<string>()
      otherMines.forEach(key => {
        setTimeout(() => {
          setExplodingMines(prev => { const s = new Set(prev); s.add(key); return s })
        }, delay)
        delay += 25
      })
      void revealing
      setTimeout(() => setShowOverlay(true), delay + 400)
      return
    }

    const nextBoard = floodReveal(currentBoard, r, c)
    setBoard(nextBoard)

    // Check win
    const { rows, cols, mines } = DIFFICULTIES[difficulty]
    const total = rows * cols
    let revealedCount = 0
    for (let dr = 0; dr < rows; dr++)
      for (let dc = 0; dc < cols; dc++)
        if (nextBoard[dr][dc].revealed) revealedCount++
    if (revealedCount === total - mines) {
      stopTimer()
      setGameOver(true)
      setWon(true)
      // Auto-flag mines
      const flaggedBoard = nextBoard.map(row => row.map(cell =>
        cell.mine ? { ...cell, flagged: true } : cell
      ))
      setBoard(flaggedBoard)
      setMinesLeft(0)
      setTimeout(() => setShowOverlay(true), 600)
    }
  }, [board, started, gameOver, difficulty, startTimer, stopTimer])

  const handleRightClick = useCallback((e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault()
    if (gameOver) return
    const cell = board[r][c]
    if (cell.revealed) return
    const nextBoard = board.map(row => row.map(c2 =>
      c2 === cell ? { ...c2, flagged: !c2.flagged } : c2
    ))
    setBoard(nextBoard)
    setMinesLeft(m => m + (cell.flagged ? 1 : -1))
  }, [board, gameOver])

  const face = gameOver ? (won ? '😎' : '😵') : (started ? '🙂' : '😊')
  const { cols } = DIFFICULTIES[difficulty]

  return (
    <>
      <div className="bg-orb orb1" />
      <div className="bg-orb orb2" />
      <div className="bg-orb orb3" />

      <div className="app-wrapper">
        {/* Header */}
        <header className="app-header">
          <div className="logo">
            <span className="logo-icon">💣</span>
            <h1 className="logo-text">踩地雷</h1>
          </div>
        </header>

        {/* Control Panel */}
        <section className="control-panel" aria-label="遊戲控制">
          <div className="difficulty-group">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                className={`diff-btn${difficulty === d ? ' active' : ''}`}
                onClick={() => initGame(d)}
              >
                {d === 'easy' ? '初級' : d === 'medium' ? '中級' : '高級'}
              </button>
            ))}
          </div>

          <div className="status-bar">
            <div className="stat-box" aria-label="剩餘地雷數">
              <span className="stat-icon">💣</span>
              <span className="stat-value">{String(minesLeft).padStart(3, '0')}</span>
            </div>

            <button
              className="reset-btn"
              title="重新開始"
              aria-label="重新開始"
              onClick={() => initGame(difficulty)}
            >
              {face}
            </button>

            <div className="stat-box" aria-label="已用時間">
              <span className="stat-icon">⏱</span>
              <span className="stat-value">{String(timer).padStart(3, '0')}</span>
            </div>
          </div>
        </section>

        {/* Board */}
        <main className="board-container" aria-label="遊戲棋盤">
          <div
            className="board"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            onContextMenu={e => e.preventDefault()}
          >
            {board.map(row => row.map(cell => {
              const key = `${cell.r},${cell.c}`
              const isHit = hitCell === key
              const isExploding = explodingMines.has(key)
              let className = 'cell'
              if (cell.revealed || isHit || isExploding) {
                className += ' revealed'
                if (cell.mine || isHit || isExploding) {
                  className += isHit ? ' mine-hit' : ' mine-revealed'
                } else if (cell.adjacent > 0) {
                  className += ` n${cell.adjacent}`
                }
              } else if (cell.flagged) {
                className += ' flagged'
              }

              let content: React.ReactNode = null
              if (cell.flagged && !cell.revealed && !isHit && !isExploding) content = '🚩'
              else if (cell.mine && (cell.revealed || isHit || isExploding)) content = '💣'
              else if (cell.revealed && !cell.mine && cell.adjacent > 0) content = cell.adjacent

              return (
                <div
                  key={key}
                  className={className}
                  role="button"
                  aria-label={`列${cell.r + 1} 欄${cell.c + 1}`}
                  onClick={() => handleLeftClick(cell.r, cell.c)}
                  onContextMenu={e => handleRightClick(e, cell.r, cell.c)}
                >
                  {content}
                </div>
              )
            }))}
          </div>
        </main>

        {/* Overlay */}
        {showOverlay && (
          <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="overlay-title">
            <div className="overlay-card">
              <div className="overlay-emoji">{won ? '🎉' : '💥'}</div>
              <h2 className="overlay-title" id="overlay-title">{won ? '你贏了！' : '踩到地雷！'}</h2>
              <p className="overlay-subtitle">
                {won ? `用時 ${timer} 秒，太厲害了！` : '別灰心，再試一次！'}
              </p>
              <button className="play-again-btn" onClick={() => initGame(difficulty)}>再來一局</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
