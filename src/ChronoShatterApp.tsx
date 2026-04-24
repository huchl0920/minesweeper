import { useRef, useEffect, useState } from 'react';

type GameState = 'menu' | 'playing' | 'gameover';

//interface Pt { x: number; y: number; }
interface RecPt { x: number; y: number; time: number; }
interface Clone { id: number; path: RecPt[]; startTime: number; maxTime: number; }
interface Enemy { id: number; x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; isElite?: boolean; dead?: boolean; }
interface Bullet { id: number; x: number; y: number; vx: number; vy: number; life: number; }

interface LeaderboardEntry { date: string; score: number; }
const getLeaderboard = (): LeaderboardEntry[] => JSON.parse(localStorage.getItem('cs_leaderboard') || '[]');
const saveLeaderboard = (lb: LeaderboardEntry[]) => localStorage.setItem('cs_leaderboard', JSON.stringify(lb));

export default function ChronoShatterApp({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [score, setScore] = useState(0);
  const [playerHp, setPlayerHp] = useState(100);
  const [isRecording, setIsRecording] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(getLeaderboard());
  
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const joystickRef = useRef({ vx: 0, vy: 0 });
  const [joystickThumb, setJoystickThumb] = useState({ x: 0, y: 0 });
  const joystickBaseRef = useRef<HTMLDivElement>(null);
  
  const pRef = useRef({ x: 250, y: 400, hp: 100, maxHp: 100, speed: 250 });
  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const clonesRef = useRef<Clone[]>([]);
  
  // Recording logic state (keep refs for physics but use state for UI)
  const recordingPathRef = useRef<RecPt[]>([]);
  const recordStartTimeRef = useRef(0);
  
  const entityIdRef = useRef(0);
  const playTimeRef = useRef(0);
  const lastEnemySpawnRef = useRef(0);
  const lastFireRef = useRef(0);

  // Shatter effect
  const shatterRef = useRef<{ time: number; duration: number; type: 'glass' }>({ time: 0, duration: 0, type: 'glass' });

  // Make canvas height consider mobile bottom controls
  const isMobile = window.innerWidth <= 768;
  const canvasWidth = Math.min(window.innerWidth, 500);
  const canvasHeight = Math.min(window.innerHeight - (isMobile ? 220 : 80), 800);

  const handleActionDown = () => {
       if (gameState === 'playing' && !isRecording) {
          setIsRecording(true);
          recordStartTimeRef.current = playTimeRef.current;
          recordingPathRef.current = [];
       }
  };

  const handleActionUp = () => {
       if (gameState === 'playing') {
          setIsRecording(false);
          if (recordingPathRef.current.length > 5) {
             clonesRef.current.push({
                id: ++entityIdRef.current,
                path: [...recordingPathRef.current],
                startTime: playTimeRef.current,
                maxTime: recordingPathRef.current[recordingPathRef.current.length-1].time
             });
          }
          recordingPathRef.current = [];
       }
  };

  const handleJoystickStart = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      handleJoystickMove(e);
  };

  const handleJoystickMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const maxR = rect.width / 2;
      const mag = Math.hypot(dx, dy);
      
      if (mag > maxR) {
          dx = (dx / mag) * maxR;
          dy = (dy / mag) * maxR;
      }
      setJoystickThumb({ x: dx, y: dy });
      joystickRef.current = { vx: dx / maxR, vy: dy / maxR };
  };

  const handleJoystickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setJoystickThumb({ x: 0, y: 0 });
      joystickRef.current = { vx: 0, vy: 0 };
  };

  const startGame = () => {
    setGameState('playing');
     setScore(0);
     setPlayerHp(100);
     pRef.current = { x: canvasWidth/2, y: canvasHeight/2, hp: 100, maxHp: 100, speed: 250 };
     enemiesRef.current = [];
     bulletsRef.current = [];
     clonesRef.current = [];
     setIsRecording(false);
     recordingPathRef.current = [];
     playTimeRef.current = 0;
    shatterRef.current.duration = 0;
    lastTimeRef.current = performance.now();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
       keysRef.current[e.code] = true; 
       if (e.code === 'Space') handleActionDown();
    };
    const handleKeyUp = (e: KeyboardEvent) => { 
       keysRef.current[e.code] = false; 
       if (e.code === 'Space') handleActionUp();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [gameState, isRecording]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const loop = (time: number) => {
      const dt = Math.min(0.1, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;
      frameRef.current = requestAnimationFrame(loop);

      playTimeRef.current += dt;
      const gameTime = playTimeRef.current;

      const p = pRef.current;

      // Shatter pause
      if (shatterRef.current.duration > 0) {
         shatterRef.current.duration -= dt;
         // Draw shattered screen simply by offsetting context lines
         // Extremely naive glass shatter effect
         ctx.save();
         ctx.lineWidth = 2;
         ctx.strokeStyle = 'rgba(255,255,255,0.8)';
         ctx.beginPath();
         ctx.moveTo(0, 0); ctx.lineTo(canvasWidth, canvasHeight);
         ctx.moveTo(canvasWidth, 0); ctx.lineTo(0, canvasHeight);
         ctx.moveTo(canvasWidth/2, 0); ctx.lineTo(canvasWidth/2, canvasHeight);
         ctx.stroke();
         ctx.restore();
         // If still freezing due to hit-stop, skip logic update
         if (shatterRef.current.duration > 0.1) return; 
      }

      // Movement
      let vx = joystickRef.current.vx;
      let vy = joystickRef.current.vy;
      
      if (vx === 0 && vy === 0) {
         if (keysRef.current['KeyW']) vy -= 1;
         if (keysRef.current['KeyS']) vy += 1;
         if (keysRef.current['KeyA']) vx -= 1;
         if (keysRef.current['KeyD']) vx += 1;
         const mag = Math.hypot(vx, vy);
         if (mag > 0) { vx /= mag; vy /= mag; }
      }
      
      p.x += vx * p.speed * dt;
      p.y += vy * p.speed * dt;

      // Bound clamp
      p.x = Math.max(15, Math.min(canvasWidth - 15, p.x));
      p.y = Math.max(15, Math.min(canvasHeight - 15, p.y));

      // Record
      if (isRecording) {
         recordingPathRef.current.push({ x: p.x, y: p.y, time: gameTime - recordStartTimeRef.current });
      }

      // Player auto shoot
      if (gameTime - lastFireRef.current > 0.5) {
         lastFireRef.current = gameTime;
         // Shoot nearest
         let minDist = Infinity; let nearest = null;
         for (const e of enemiesRef.current) { const d = Math.hypot(e.x-p.x, e.y-p.y); if(d<minDist){minDist=d; nearest=e;} }
         if (nearest) {
            const dx = nearest.x - p.x; const dy = nearest.y - p.y;
            const dmag = Math.hypot(dx, dy) || 1;
            bulletsRef.current.push({ id: ++entityIdRef.current, x: p.x, y: p.y, vx: dx/dmag*800, vy: dy/dmag*800, life: 1 });
         }
      }

      // Update Bullets
      for (let i = bulletsRef.current.length-1; i>=0; i--) {
         const b = bulletsRef.current[i];
         b.x += b.vx * dt; b.y += b.vy * dt;
         b.life -= dt;
         if (b.life <= 0) { bulletsRef.current.splice(i, 1); continue; }
         for (const e of enemiesRef.current) {
            if (Math.hypot(b.x-e.x, b.y-e.y) < e.radius + 5) {
               e.hp -= 10; b.life = 0; break;
            }
         }
      }

      // Spawn Enemies
      if (gameTime - lastEnemySpawnRef.current > (1.5 - Math.min(1.2, gameTime*0.01))) {
         lastEnemySpawnRef.current = gameTime;
         const angle = Math.random() * Math.PI*2;
         const dist = Math.max(canvasWidth, canvasHeight);
         const isElite = Math.random() < 0.05 + gameTime * 0.001;
         enemiesRef.current.push({
            id: ++entityIdRef.current, x: p.x + Math.cos(angle)*dist, y: p.y + Math.sin(angle)*dist,
            hp: isElite ? 150 : 20, maxHp: isElite ? 150 : 20, speed: isElite ? 180 : 100 + Math.random()*50,
            radius: isElite ? 20 : 12, isElite
         });
      }

      const damageEnemy = (e: Enemy, dmg: number) => {
         e.hp -= dmg;
         if (e.hp <= 0 && !e.dead) {
            e.dead = true;
            setScore(s => s + (e.isElite ? 50 : 10));
            if (e.isElite) {
               // Activate Shatter effect / hit stop
               shatterRef.current = { time: gameTime, duration: 0.15, type: 'glass' };
            }
         }
      };

      // Clones
      for (let i = clonesRef.current.length-1; i>=0; i--) {
         const c = clonesRef.current[i];
         const cTime = gameTime - c.startTime;
         if (cTime > c.maxTime) { clonesRef.current.splice(i, 1); continue; }
         // find interpolated position
         let pos = c.path[c.path.length-1];
         for (let j=0; j<c.path.length-1; j++) {
            if (cTime >= c.path[j].time && cTime <= c.path[j+1].time) {
               const t = (cTime - c.path[j].time) / (c.path[j+1].time - c.path[j].time);
               pos = { x: c.path[j].x + (c.path[j+1].x - c.path[j].x)*t, y: c.path[j].y + (c.path[j+1].y - c.path[j].y)*t, time: 0 };
               break;
            }
         }
         // Damage overlap enemies
         for (const e of enemiesRef.current) {
            if (Math.hypot(pos.x - e.x, pos.y - e.y) < e.radius + 20) damageEnemy(e, 200 * dt);
         }
      }

      // Update Enemies
      for (let i = enemiesRef.current.length-1; i>=0; i--) {
         const e = enemiesRef.current[i];
         if (e.dead) { enemiesRef.current.splice(i, 1); continue; }
         const dx = p.x - e.x; const dy = p.y - e.y; const mag = Math.hypot(dx, dy) || 1;
         e.x += dx/mag * e.speed * dt; e.y += dy/mag * e.speed * dt;

         if (mag < e.radius + 15) {
            p.hp -= 20 * dt;
            setPlayerHp(p.hp);
            if (p.hp <= 0 && gameState === 'playing') {
               setScore(s => {
                  const lb = [...leaderboard, { date: new Date().toLocaleDateString(), score: s }];
                  lb.sort((a,b) => b.score - a.score);
                  const top5 = lb.slice(0, 5);
                  setLeaderboard(top5);
                  saveLeaderboard(top5);
                  return s;
               });
               setGameState('gameover');
               cancelAnimationFrame(frameRef.current);
            }
         }
      }

      // Render
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Render Grid
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      for(let i=0; i<canvasWidth; i+=40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvasHeight); ctx.stroke(); }
      for(let i=0; i<canvasHeight; i+=40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvasWidth, i); ctx.stroke(); }

      ctx.shadowBlur = 15;

      // Draw Enemies
      for (const e of enemiesRef.current) {
         ctx.fillStyle = e.isElite ? '#ef4444' : '#fff';
         ctx.shadowColor = e.isElite ? '#ef4444' : 'transparent';
         ctx.beginPath();
         // draw triangle
         const dx = p.x - e.x; const dy = p.y - e.y; const ang = Math.atan2(dy, dx);
         ctx.moveTo(e.x + Math.cos(ang)*e.radius, e.y + Math.sin(ang)*e.radius);
         ctx.lineTo(e.x + Math.cos(ang+2.5)*e.radius, e.y + Math.sin(ang+2.5)*e.radius);
         ctx.lineTo(e.x + Math.cos(ang-2.5)*e.radius, e.y + Math.sin(ang-2.5)*e.radius);
         ctx.fill();
      }

      // Draw Clones
      for (const c of clonesRef.current) {
         const cTime = gameTime - c.startTime;
         let pos = c.path[c.path.length-1];
         for (let j=0; j<c.path.length-1; j++) {
            if (cTime >= c.path[j].time && cTime <= c.path[j+1].time) {
               const t = (cTime - c.path[j].time) / (c.path[j+1].time - c.path[j].time);
               pos = { x: c.path[j].x + (c.path[j+1].x - c.path[j].x)*t, y: c.path[j].y + (c.path[j+1].y - c.path[j].y)*t, time: 0 };
               break;
            }
         }
         ctx.fillStyle = 'rgba(168, 85, 247, 0.6)';
         ctx.shadowColor = '#a855f7';
         ctx.beginPath();
         ctx.arc(pos.x, pos.y, 15, 0, Math.PI*2);
         ctx.fill();
      }

      // Draw Bullets
      ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047';
      for (const b of bulletsRef.current) {
         ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI*2); ctx.fill();
      }

      // Draw Player
      ctx.fillStyle = isRecording ? '#38bdf8' : '#fff';
      ctx.shadowColor = isRecording ? '#38bdf8' : '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
      ctx.fill();
      
      // Draw Recording Trail
      if (isRecording && recordingPathRef.current.length > 0) {
         ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
         ctx.lineWidth = 4;
         ctx.beginPath();
         ctx.moveTo(recordingPathRef.current[0].x, recordingPathRef.current[0].y);
         for(let i=1; i<recordingPathRef.current.length; i++) ctx.lineTo(recordingPathRef.current[i].x, recordingPathRef.current[i].y);
         ctx.stroke();
      }

      ctx.shadowBlur = 0;

    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState, canvasWidth, canvasHeight, isRecording, leaderboard]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
       <div style={{ padding: '20px' }}>
         <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>{"< 返回"}</button>
       </div>

       {gameState === 'menu' && (
         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff', gap: 20 }}>
           <h1 style={{ color: '#a855f7', fontSize: '3rem', textShadow: '0 0 20px #a855f7', letterSpacing: 5 }}>CHRONO SHATTER</h1>
           <p style={{ color: '#94a3b8' }}>按住 SPACE 錄製軌跡，放開後召喚無敵破壞分身！</p>
           {leaderboard.length > 0 && (
             <div style={{ background: 'rgba(0,0,0,0.5)', padding: 15, borderRadius: 10, width: '80%', maxWidth: 400 }}>
               <h3 style={{ margin: '0 0 10px 0', color: '#fde047' }}>🏆 排行榜 TOP 5</h3>
               {leaderboard.map((entry, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: 5 }}>
                    <span>#{idx+1} {entry.date}</span>
                    <span style={{ fontWeight: 'bold' }}>{entry.score} 分</span>
                  </div>
               ))}
             </div>
           )}
           <button onClick={startGame} style={{ padding: '15px 40px', background: '#7e22ce', border: 'none', borderRadius: 30, color: '#fff', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px #a855f7' }}>進入碎時空</button>
         </div>
       )}

        {gameState === 'playing' && (
          <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 10, left: 10, color: '#fff', zIndex: 10, fontSize: '1.2rem', textShadow: '0 0 5px #000', pointerEvents: 'none' }}>
                 <div>HP: {Math.max(0, Math.floor(playerHp))} / 100</div>
                 <div>存活: {score} 分</div>
                 {isRecording && <div style={{ color: '#38bdf8', fontWeight: 'bold', marginTop: 10 }}>[REC] 正在錄製時間軸...</div>}
              </div>
              <canvas 
                ref={canvasRef} 
                width={canvasWidth} 
                height={canvasHeight} 
                style={{ background: '#000', borderRadius: 12, boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}
              />
            </div>
            
            {!isMobile && <div style={{ width: '100%', textAlign: 'center', color: '#94a3b8', marginTop: 10 }}>WASD 移動 | 長按空白鍵 (SPACE) 錄製分身</div>}
            
            {/* Mobile Virtual Controls */}
            {isMobile && (
              <div style={{ display: 'flex', width: canvasWidth, justifyContent: 'space-between', alignItems: 'center', marginTop: 15, padding: '0 20px', boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
                 {/* Virtual Joystick */}
                 <div 
                    ref={joystickBaseRef}
                    onPointerDown={handleJoystickStart}
                    onPointerMove={handleJoystickMove}
                    onPointerUp={handleJoystickEnd}
                    onPointerCancel={handleJoystickEnd}
                    style={{ 
                        width: 140, height: 140, borderRadius: '50%', background: 'rgba(39, 39, 42, 0.6)', 
                        border: '2px solid rgba(63, 63, 70, 0.8)', position: 'relative', touchAction: 'none' 
                    }}
                 >
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', width: 60, height: 60,
                        background: 'radial-gradient(circle, #a1a1aa 0%, #52525b 100%)',
                        borderRadius: '50%', boxShadow: '0 0 10px rgba(0,0,0,0.5)', pointerEvents: 'none',
                        transform: `translate(calc(-50% + ${joystickThumb.x}px), calc(-50% + ${joystickThumb.y}px))`
                    }} />
                 </div>
                 
                 {/* Action Button */}
                 <button 
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handleActionDown(); }}
                    onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); handleActionUp(); }}
                    onPointerCancel={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); handleActionUp(); }}
                    style={{ 
                      width: 100, height: 100, borderRadius: '50%', 
                      background: 'radial-gradient(circle, #a855f7 0%, #7e22ce 100%)', 
                      border: '4px solid #c084fc', color: '#fff', fontWeight: 'bold', fontSize: '1.4rem',
                      boxShadow: '0 0 20px rgba(168, 85, 247, 0.8)', touchAction: 'none'
                    }}
                 >
                    SPLIT
                 </button>
              </div>
            )}
            
          </div>
        )}

       {gameState === 'gameover' && (
         <div style={{ position: 'relative' }}>
           <canvas width={canvasWidth} height={canvasHeight} style={{ background: '#000', borderRadius: 12, opacity: 0.5 }} />
           <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
             <h2 style={{ fontSize: '3rem', color: '#ef4444', textShadow: '0 0 10px #f87171' }}>時空消散</h2>
             <div style={{ fontSize: '1.5rem', color: '#fff' }}>得分: {score}</div>
             <button onClick={startGame} style={{ padding: '10px 30px', background: '#a855f7', color: '#fff', borderRadius: 20, border: 'none', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>再次挑戰</button>
           </div>
         </div>
       )}
    </div>
  );
}
