import { useEffect, useRef, useState, useCallback } from 'react';
import { detectBeats } from './beatDetect';

// ── Constants ──
const LANES = 4;
const NOTE_H = 30;
const JUDGE_Y_RATIO = 0.82;
const PERFECT_RANGE = 55;
const GOOD_RANGE = 90;
const MISS_RANGE = 90;
const MAX_HP = 150;


const INTERVAL_OPTIONS = [
  { label: '稀', value: 1400 },
  { label: '普通', value: 900 },
  { label: '密', value: 600 },
  { label: '極密', value: 380 },
  { label: '地獄', value: 150 },
];
const LANE_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#facc15'];
const LANE_KEYS = ['e', 'f', 'k', 'o'];
const LANE_LABELS = ['E', 'F', 'K', 'O'];

interface Note {
  id: number; lane: number; y: number;
  hit?: 'perfect' | 'good' | 'miss'; hitTimer?: number;
}
interface HitEffect {
  id: number; text: string; color: string;
  x: number; y: number; alpha: number;
}

export default function RhythmApp({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'start' | 'analyzing' | 'countdown' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [hp, setHp] = useState(MAX_HP);
  const [result, setResult] = useState<{ score: number; maxCombo: number } | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [noteSpeed, setNoteSpeed] = useState(3);
  const [noteInterval, setNoteInterval] = useState(900);

  // Music state
  const [musicName, setMusicName] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [beatMode, setBeatMode] = useState<'random' | 'music'>('random');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const beatScheduleRef = useRef<number[]>([]); // seconds
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicStartTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown effect
  useEffect(() => {
    if (gameState !== 'countdown') return;
    const t = setTimeout(() => {
      if (countdown <= 1) setGameState('playing');
      else setCountdown(c => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [gameState, countdown]);

  const notes = useRef<Note[]>([]);
  const effects = useRef<HitEffect[]>([]);
  const noteId = useRef(0);
  const effectId = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const hpRef = useRef(MAX_HP);
  const pressedLanes = useRef<Set<number>>(new Set());
  const frameRef = useRef<number>(0);
  const lastSpawn = useRef(0);
  const beatIdxRef = useRef(0); // index into beatScheduleRef
  const lastTimeRef = useRef(0);

  const speedRef = useRef(noteSpeed);
  useEffect(() => { speedRef.current = noteSpeed; }, [noteSpeed]);
  const spawnIntervalRef = useRef(noteInterval);
  useEffect(() => { spawnIntervalRef.current = noteInterval; }, [noteInterval]);
  const hpPenaltyRef = useRef(10);

  const canvasWidth = Math.min(window.innerWidth, 480);
  const canvasHeight = Math.min(window.innerHeight - 120, 680);
  const laneWidth = canvasWidth / LANES;
  const judgeY = canvasHeight * JUDGE_Y_RATIO;

  // ── Load & Analyze Music ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMusicName(file.name);
    setGameState('analyzing');
    setAnalyzeProgress(10);

    try {
      const arrayBuffer = await file.arrayBuffer();
      setAnalyzeProgress(40);

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const decoded = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      audioBufferRef.current = decoded;
      setAnalyzeProgress(60);

      const beats = await detectBeats(decoded);
      beatScheduleRef.current = beats;
      setAnalyzeProgress(100);
      setBeatMode('music');
      setGameState('start');
    } catch (err) {
      console.error('Beat analysis failed:', err);
      setMusicName(null);
      setBeatMode('random');
      setGameState('start');
    }
  };

  const loadBuiltInMusic = async () => {
    setMusicName('Viper (MDN Demo)');
    setGameState('analyzing');
    setAnalyzeProgress(10);
    try {
      const res = await fetch('/viper.mp3');
      const arrayBuffer = await res.arrayBuffer();
      setAnalyzeProgress(40);

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const decoded = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      audioBufferRef.current = decoded;
      setAnalyzeProgress(60);

      const beats = await detectBeats(decoded);
      beatScheduleRef.current = beats;
      setAnalyzeProgress(100);
      setBeatMode('music');
      setGameState('start');
    } catch (err) {
      console.error('Failed to load built-in music:', err);
      setMusicName(null);
      setBeatMode('random');
      setGameState('start');
    }
  };

  // ── Judge ──
  const judgePress = useCallback((lane: number) => {
    let bestNote: Note | null = null;
    let bestDist = Infinity;
    for (const n of notes.current) {
      if (n.lane !== lane || n.hit) continue;
      const dist = Math.abs(n.y - judgeY);
      if (dist < bestDist) { bestDist = dist; bestNote = n; }
    }
    if (!bestNote || bestDist > MISS_RANGE) return;
    const x = (bestNote.lane + 0.5) * laneWidth;
    let judgement: 'perfect' | 'good' | 'miss';
    let pts = 0; let color = '#fff';
    if (bestDist <= PERFECT_RANGE) { judgement = 'perfect'; pts = 300; color = '#fde047'; }
    else if (bestDist <= GOOD_RANGE) { judgement = 'good'; pts = 150; color = '#86efac'; }
    else { judgement = 'miss'; pts = 0; color = '#f87171'; }
    bestNote.hit = judgement; bestNote.hitTimer = 20;
    if (judgement !== 'miss') {
      comboRef.current++;
      if (comboRef.current > maxComboRef.current) maxComboRef.current = comboRef.current;
      scoreRef.current += pts * (1 + Math.floor(comboRef.current / 10) * 0.1);
      setScore(Math.round(scoreRef.current)); setCombo(comboRef.current);
    } else {
      comboRef.current = 0; setCombo(0);
      hpRef.current = Math.max(0, hpRef.current - hpPenaltyRef.current);
      setHp(hpRef.current);
    }
    effects.current.push({ id: effectId.current++, text: judgement.toUpperCase(), color, x, y: judgeY - 40, alpha: 1 });
  }, [judgeY, laneWidth]);

  // ── Keyboard ──
  useEffect(() => {
    if (gameState !== 'playing') return;
    const onDown = (e: KeyboardEvent) => {
      const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (idx >= 0 && !pressedLanes.current.has(idx)) { pressedLanes.current.add(idx); judgePress(idx); }
    };
    const onUp = (e: KeyboardEvent) => {
      const idx = LANE_KEYS.indexOf(e.key.toLowerCase());
      if (idx >= 0) pressedLanes.current.delete(idx);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [gameState, judgePress]);

  // ── Game Loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (gameState !== 'playing') { cancelAnimationFrame(frameRef.current); return; }

    // Start music playback if music mode
    if (beatMode === 'music' && audioBufferRef.current && audioCtxRef.current) {
      const src = audioCtxRef.current.createBufferSource();
      src.buffer = audioBufferRef.current;
      src.connect(audioCtxRef.current.destination);
      src.start(0);
      musicSourceRef.current = src;
      musicStartTimeRef.current = audioCtxRef.current.currentTime;
    }

    const spawnNote = (now: number, musicTime?: number) => {
      if (beatMode === 'music' && musicTime !== undefined) {
        // 音符從 y = -NOTE_H 掉到 y = judgeY，總距離是 judgeY + NOTE_H
        // 依照目前的落下速度與 60fps 基準，計算需要提早幾秒生成
        const lookahead = (judgeY + NOTE_H) / speedRef.current / 60;
        const schedule = beatScheduleRef.current;
        while (beatIdxRef.current < schedule.length && schedule[beatIdxRef.current] <= musicTime + lookahead) {
          const lane = Math.floor(Math.random() * LANES);
          notes.current.push({ id: noteId.current++, lane, y: -NOTE_H });
          beatIdxRef.current++;
        }
      } else {
        // Random interval mode
        const interval = spawnIntervalRef.current * (0.7 + Math.random() * 0.6);
        if (now - lastSpawn.current < interval) return;
        lastSpawn.current = now;
        const lane = Math.floor(Math.random() * LANES);
        notes.current.push({ id: noteId.current++, lane, y: -NOTE_H });
      }
    };

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      
      // 計算相對於 60fps (16.666ms) 的倍率，並加上上限避免切換分頁回來瞬間穿越
      const dtMultiplier = Math.min(delta / 16.666, 3);

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const musicTime = beatMode === 'music' && audioCtxRef.current
        ? audioCtxRef.current.currentTime - musicStartTimeRef.current
        : undefined;

      // Background
      for (let i = 0; i < LANES; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(i * laneWidth, 0, laneWidth, canvasHeight);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(i * laneWidth, 0); ctx.lineTo(i * laneWidth, canvasHeight); ctx.stroke();
      }

      // Judge line
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, judgeY); ctx.lineTo(canvasWidth, judgeY); ctx.stroke();

      // Zone labels
      ctx.font = '500 11px sans-serif'; ctx.textAlign = 'left'; ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#fde047'; ctx.fillText('PERFECT', 4, judgeY - PERFECT_RANGE + 14);
      ctx.fillStyle = '#86efac'; ctx.fillText('GOOD', 4, judgeY - GOOD_RANGE + 14);
      ctx.globalAlpha = 1;

      // Lane key indicators
      for (let i = 0; i < LANES; i++) {
        const pressed = pressedLanes.current.has(i);
        const lx = i * laneWidth + laneWidth / 2;
        ctx.fillStyle = pressed ? LANE_COLORS[i] : 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.roundRect(i * laneWidth + 8, judgeY + 14, laneWidth - 16, 38, 8); ctx.fill();
        ctx.fillStyle = pressed ? '#000' : '#fff';
        ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(LANE_LABELS[i], lx, judgeY + 38);
      }

      spawnNote(timestamp, musicTime);

      // Notes
      for (const n of notes.current) {
        if (!n.hit) {
          n.y += speedRef.current * dtMultiplier;
          if (n.y > judgeY + MISS_RANGE && !n.hit) {
            n.hit = 'miss'; n.hitTimer = 15;
            comboRef.current = 0; setCombo(0);
            hpRef.current = Math.max(0, hpRef.current - hpPenaltyRef.current);
            setHp(hpRef.current);
            effects.current.push({ id: effectId.current++, text: 'MISS', color: '#f87171', x: (n.lane + 0.5) * laneWidth, y: judgeY - 30, alpha: 1 });
          }
        } else if (n.hitTimer) n.hitTimer--;
        if (n.hitTimer === 0) continue;
        const nx = n.lane * laneWidth + 8;
        const alpha = n.hit ? (n.hitTimer || 0) / 20 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = LANE_COLORS[n.lane];
        ctx.beginPath(); ctx.roundRect(nx, n.y, laneWidth - 16, NOTE_H, 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.roundRect(nx + 4, n.y + 4, laneWidth - 24, 6, 3); ctx.fill();
        ctx.globalAlpha = 1;
      }
      notes.current = notes.current.filter(n => !n.hit || (n.hitTimer !== undefined && n.hitTimer > 0));

      // Effects
      for (const e of effects.current) {
        ctx.globalAlpha = e.alpha; ctx.fillStyle = e.color;
        ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(e.text, e.x, e.y);
        ctx.globalAlpha = 1; e.y -= 1.2 * dtMultiplier; e.alpha -= 0.025 * dtMultiplier;
      }
      effects.current = effects.current.filter(e => e.alpha > 0);

      // HP check
      if (hpRef.current <= 0) {
        // Stop music
        try { musicSourceRef.current?.stop(); } catch (_) { /* ok */ }
        setGameState('gameover');
        setResult({ score: Math.round(scoreRef.current), maxCombo: maxComboRef.current });
        cancelAnimationFrame(frameRef.current);
        return;
      }

      // Music-mode: stop game when song ends
      if (beatMode === 'music' && musicTime !== undefined && musicTime >= (audioBufferRef.current?.duration ?? Infinity)) {
        try { musicSourceRef.current?.stop(); } catch (_) { /* ok */ }
        setGameState('gameover');
        setResult({ score: Math.round(scoreRef.current), maxCombo: maxComboRef.current });
        cancelAnimationFrame(frameRef.current);
        return;
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frameRef.current);
      try { musicSourceRef.current?.stop(); } catch (_) { /* ok */ }
    };
  }, [gameState, canvasWidth, canvasHeight, judgeY, laneWidth, noteSpeed, noteInterval, beatMode]);

  const startGame = () => {
    notes.current = []; effects.current = [];
    noteId.current = 0; effectId.current = 0;
    scoreRef.current = 0; comboRef.current = 0; maxComboRef.current = 0;
    hpRef.current = MAX_HP;
    pressedLanes.current = new Set();
    lastSpawn.current = 0;
    beatIdxRef.current = 0;
    lastTimeRef.current = 0;
    setScore(0); setCombo(0); setHp(MAX_HP); setResult(null);
    setCountdown(3);
    setGameState('countdown');
  };

  const handleTouchLane = (lane: number) => {
    if (gameState !== 'playing') return;
    pressedLanes.current.add(lane);
    judgePress(lane);
    setTimeout(() => pressedLanes.current.delete(lane), 80);
  };

  return (
    <div className="game-app">
      <div className="bg-layer rhythm-bg-layer" />
      <div className="app-container">
        <div className="weather-header">
          <button className="back-btn" onClick={onBack} aria-label="返回首頁">‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>🎵 節奏大師</span>
            {musicName && <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{musicName}</div>}
          </div>
          <div style={{ width: 42 }} />
        </div>

        {/* HUD */}
        {gameState === 'playing' && (
          <div className="rhythm-hud">
            <div className="rhythm-score">
              <div className="rhythm-label">SCORE</div>
              <div className="rhythm-value">{score.toLocaleString()}</div>
            </div>
            <div className="rhythm-combo" style={{ opacity: combo > 0 ? 1 : 0.3 }}>
              <div className="rhythm-label">COMBO</div>
              <div className="rhythm-value" style={{ color: combo >= 20 ? '#fde047' : combo >= 10 ? '#f472b6' : '#fff' }}>
                {combo}x
              </div>
            </div>
            <div className="rhythm-hp">
              <div className="rhythm-label">HP</div>
              <div className="hp-bar">
                <div className="hp-fill" style={{ width: `${hp}%`, background: hp > 60 ? '#34d399' : hp > 30 ? '#facc15' : '#f87171' }} />
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleFileChange} />

        <div style={{ position: 'relative' }}>
          <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="rhythm-canvas" />

          {gameState === 'playing' && (
            <div className="rhythm-touch-row">
              {LANE_LABELS.map((label, i) => (
                <button key={i} className="rhythm-touch-btn"
                  style={{ background: LANE_COLORS[i] + '33', borderColor: LANE_COLORS[i] }}
                  onPointerDown={() => handleTouchLane(i)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Analyzing overlay */}
          {gameState === 'analyzing' && (
            <div className="game-overlay">
              <div style={{ fontSize: '2rem', marginBottom: 20 }}>🎵</div>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>分析節拍中...</div>
              <div className="analyze-bar">
                <div className="analyze-fill" style={{ width: `${analyzeProgress}%` }} />
              </div>
              <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
                {analyzeProgress < 100 ? `${analyzeProgress}%` : '完成！'}
              </div>
            </div>
          )}

          {/* Countdown overlay */}
          {gameState === 'countdown' && (
            <div className="game-overlay" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <div style={{ fontSize: '7rem', fontWeight: 900, lineHeight: 1,
                color: countdown === 1 ? '#f87171' : '#fff' }}>
                {countdown}
              </div>
              <div style={{ marginTop: 16, fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>準備好了嗎？</div>
            </div>
          )}

          {/* Start overlay */}
          {gameState === 'start' && (
            <div className="game-overlay">
              <h2 style={{ fontSize: '2rem' }}>🎵 節奏大師</h2>
              <p style={{ marginTop: 10, lineHeight: 1.8, color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                方塊落到判定線時<br />按鍵盤 E F K O 或點擊軌道
              </p>

              {/* Music selector */}
              <div style={{ marginTop: 20, marginBottom: 8, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 2 }}>音樂模式</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 4 }}>
                <button className="music-mode-btn" onClick={() => { setBeatMode('random'); setMusicName(null); audioBufferRef.current = null; }}>
                  <span>🎲</span><br />隨機生成
                  {beatMode === 'random' && <div className="mode-selected-dot" />}
                </button>
                <button className="music-mode-btn" onClick={() => fileInputRef.current?.click()}>
                  <span>📂</span><br />上傳音樂
                  {beatMode === 'music' && musicName !== 'Viper (MDN Demo)' && <div className="mode-selected-dot" />}
                </button>
                <button className="music-mode-btn" onClick={loadBuiltInMusic}>
                  <span>🎧</span><br />內建預設
                  {beatMode === 'music' && musicName === 'Viper (MDN Demo)' && <div className="mode-selected-dot" />}
                </button>
              </div>
              {musicName && beatMode === 'music' && (
                <div style={{ fontSize: '0.78rem', color: '#60a5fa', marginBottom: 12, maxWidth: '85%', margin: '6px auto 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ✅ {musicName}
                </div>
              )}

              {/* Speed & interval (only for random mode) */}
              {beatMode === 'random' && (<>
                <div style={{ marginTop: 16, marginBottom: 4, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 2 }}>
                  落下速度：<span style={{ color: '#fff', fontWeight: 'bold' }}>{noteSpeed}</span>
                </div>
                <div style={{ padding: '0 20px', marginBottom: 20 }}>
                  <input type="range" min="1" max="20" step="1"
                    value={noteSpeed} onChange={(e) => setNoteSpeed(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#60a5fa', cursor: 'pointer' }} />
                </div>
                <div style={{ marginBottom: 4, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 2 }}>出現頻率</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {INTERVAL_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setNoteInterval(opt.value)}
                      style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', background: noteInterval === opt.value ? '#f472b6' : 'rgba(255,255,255,0.12)', color: '#fff' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>)}

              <button className="game-btn" style={{ marginTop: 8 }} onClick={startGame}
                disabled={beatMode === 'music' && !musicName}>
                {beatMode === 'music' && !musicName ? '請先選擇音樂' : '開始'}
              </button>
            </div>
          )}

          {/* Game Over */}
          {gameState === 'gameover' && result && (
            <div className="game-overlay">
              <h2 style={{ color: '#f87171', fontSize: '1.8rem' }}>GAME OVER</h2>
              <div style={{ margin: '20px 0', lineHeight: 2.2 }}>
                <div>得分 <strong style={{ fontSize: '1.8rem', color: '#fde047' }}>{result.score.toLocaleString()}</strong></div>
                <div style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)' }}>最高 Combo：{result.maxCombo}x</div>
              </div>
              <button className="game-btn" onClick={startGame}>再挑戰</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
