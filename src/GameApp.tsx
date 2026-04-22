import { useEffect, useRef, useState } from 'react';

// ── Game Constants ──
const WIDTH = 500;
const HEIGHT = 600;
const GRAVITY = 0.6;
const MAX_JUMP = 20;
const CHARGE_RATE = 0.3;
const CHAR_WIDTH = 30;
const CHAR_HEIGHT = 30;
const PLAT_HEIGHT = 16;
const MAX_SPEED_X = 3;

interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
}

export default function GameApp({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState(0);
  const [highScores, setHighScores] = useState<number[]>(() => {
    const saved = localStorage.getItem('kids_jump_scores');
    return saved ? JSON.parse(saved) : [];
  });
  const requestRef = useRef<number>(0);

  // Input states
  const isCharging = useRef(false);
  
  // Game states
  const char = useRef({
    x: WIDTH / 2 - CHAR_WIDTH / 2,
    y: HEIGHT - 100, // Starts on first platform
    vx: MAX_SPEED_X,
    vy: 0,
    dir: 1,
    charge: 0,
    highestY: HEIGHT - 100
  });

  const cameraY = useRef(0);
  const platforms = useRef<Platform[]>([]);
  const scoreRef = useRef(0);
  const platformId = useRef(0);


  const saveScore = (s: number) => {
    setHighScores(prev => {
      const newScores = [...prev, s].sort((a, b) => b - a).slice(0, 5);
      localStorage.setItem('kids_jump_scores', JSON.stringify(newScores));
      return newScores;
    });
  };

  const spawnPlatform = (y: number) => {
    const w = 100; // 固定平台寬度
    const x = Math.random() * (WIDTH - w);
    platforms.current.push({ id: platformId.current++, x, y, w });
  };

  const initGame = () => {
    char.current = {
      x: WIDTH / 2 - CHAR_WIDTH / 2,
      y: HEIGHT - 120, // Sit on the initial long platform
      vx: MAX_SPEED_X,
      vy: 0,
      dir: 1,
      charge: 0,
      highestY: HEIGHT - 120
    };
    cameraY.current = 0;
    scoreRef.current = 0;
    setScore(0);
    isCharging.current = false;
    platformId.current = 0;

    platforms.current = [
      { id: platformId.current++, x: 0, y: HEIGHT - 80, w: WIDTH }, // Ground
    ];
    let nextY = HEIGHT - 200;
    while (nextY > -HEIGHT) {
      spawnPlatform(nextY);
      nextY -= Math.random() * 40 + 60;
    }
  };

  const startGame = () => {
    initGame();
    setGameState('playing');
  };

  const handlePointerDown = () => {
    if (gameState !== 'playing') return;
    // Only charge if grounded
    if (char.current.vy === 0) {
      isCharging.current = true;
    }
  };

  const handlePointerUp = () => {
    if (gameState !== 'playing') return;
    if (isCharging.current) {
      char.current.vy = -char.current.charge;
      isCharging.current = false;
      char.current.charge = 0;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState !== 'playing') {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    const loop = () => {
      const c = char.current;

      // 1. Charge logic
      if (isCharging.current) {
        c.charge += CHARGE_RATE;
        if (c.charge > MAX_JUMP) c.charge = 0; // 滿了就歸零重集
        // 不再設定 c.vx = 0，讓移動與集氣可以同時進行
      } else {
        c.charge = 0;
        if (c.vy === 0) {
          c.vx = MAX_SPEED_X * c.dir;
        }
      }

      // 2. Physics calculation
      c.vy += GRAVITY;
      c.x += c.vx;
      c.y += c.vy;

      // 3. Wall collisions
      if (c.x <= 0) {
        c.x = 0;
        c.dir = 1;
        c.vx = MAX_SPEED_X;
      } else if (c.x + CHAR_WIDTH >= WIDTH) {
        c.x = WIDTH - CHAR_WIDTH;
        c.dir = -1;
        c.vx = -MAX_SPEED_X;
      }

      // 4. Platform collisions (only when falling)
      let landed = false;
      if (c.vy > 0) {
        for (const p of platforms.current) {
          // AABB collision relative to camera
          const px = p.x;
          // Platform world Y
          const py = p.y;
          
          if (
            c.y + CHAR_HEIGHT >= py &&
            c.y + CHAR_HEIGHT - c.vy <= py + 2 && // was above it previous frame roughly
            c.x + CHAR_WIDTH > px &&
            c.x < px + p.w
          ) {
            c.y = py - CHAR_HEIGHT;
            c.vy = 0;
            landed = true;
            break;
          }
        }
      }
      if (landed && !isCharging.current) {
        c.vx = MAX_SPEED_X * c.dir;
      }

      // 5. Camera logic (scroll up if char is high)
      const targetScreenY = c.y - cameraY.current;
      if (targetScreenY < HEIGHT / 2) {
        cameraY.current -= (HEIGHT / 2 - targetScreenY) * 0.2; // Smooth camera
      }

      // 6. Platform generation & cleanup
      // highest platform
      const highestPlat = platforms.current[platforms.current.length - 1];
      if (highestPlat.y - cameraY.current > 0) {
        spawnPlatform(highestPlat.y - (Math.random() * 40 + 60));
      }
      
      // score update (based on height climbed)
      if (c.y < c.highestY) {
        c.highestY = c.y;
        const newScore = Math.floor((HEIGHT - c.highestY) / 100);
        if (newScore > scoreRef.current) {
          scoreRef.current = newScore;
          setScore(newScore);
        }
      }

      // 7. Game Over check
      if (c.y - cameraY.current > HEIGHT) {
        setGameState('gameover');
        saveScore(scoreRef.current);
        cancelAnimationFrame(requestRef.current!);
        return;
      }

      // ── Render ──
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      
      // Draw platforms
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      for (const p of platforms.current) {
        ctx.fillRect(p.x, p.y - cameraY.current, p.w, PLAT_HEIGHT);
      }

      // Draw character
      ctx.fillStyle = c.vy === 0 ? (isCharging.current ? '#f87171' : '#60a5fa') : '#a78bfa';
      ctx.fillRect(c.x, c.y - cameraY.current, CHAR_WIDTH, CHAR_HEIGHT);

      // Draw charge bar
      if (isCharging.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(c.x, c.y - cameraY.current - 10, CHAR_WIDTH, 6);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(c.x, c.y - cameraY.current - 10, (c.charge / MAX_JUMP) * CHAR_WIDTH, 6);
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]);

  return (
    <div className="game-app">
      <div className="bg-layer game-bg-layer" />
      <div className="app-container">
        
        <div className="weather-header">
          <button className="back-btn" onClick={onBack} aria-label="返回首頁">‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>Kids Jump</span>
          </div>
          <div style={{ width: 42 }}></div>
        </div>

        <div className="game-container" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
          <div className="game-hud">
            層數 {score}
          </div>
          
          <canvas 
            ref={canvasRef} 
            width={WIDTH} 
            height={HEIGHT} 
            className="game-canvas" 
          />

          {gameState === 'start' && (
            <div className="game-overlay">
              <h2>小朋友上樓梯🏃</h2>
              <p style={{marginTop: 10, lineHeight: 1.6}}>
                長按螢幕集氣跳躍<br/>
                不要掉下去！
              </p>
              <button className="game-btn" onClick={startGame}>開始遊戲</button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="game-overlay">
              <h2 style={{color: '#f87171'}}>GAME OVER</h2>
              <div style={{fontSize: '2rem', fontWeight: 800, margin: '15px 0'}}>層數：{score}</div>
              
              <div className="leaderboard">
                <h3>🏆 排行榜</h3>
                {highScores.length === 0 && <p>無紀錄</p>}
                {highScores.map((s, i) => (
                  <div key={i} className="lb-row">
                    <span>#{i + 1}</span>
                    <span>{s} 層</span>
                  </div>
                ))}
              </div>

              <button className="game-btn" style={{marginTop: 20}} onClick={startGame}>再玩一次</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
