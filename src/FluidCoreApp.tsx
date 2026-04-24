import React, { useEffect, useRef, useState, useCallback } from 'react';

type GameState = 'menu' | 'playing' | 'gameover';

interface Pt { x: number; y: number; }
interface Wall { x0: number; y0: number; x1: number; y1: number; life: number; }
interface Drop { id: number; x: number; y: number; vx: number; vy: number; radius: number; }

const MAX_DROPS = 1200;
const CORE_RADIUS = 30;
const MAX_WALL_LENGTH = 50; // segments
const WALL_LIFETIME = 5; // seconds

interface LeaderboardEntry { date: string; score: number; }
const getLeaderboard = (): LeaderboardEntry[] => JSON.parse(localStorage.getItem('fc_leaderboard') || '[]');
const saveLeaderboard = (lb: LeaderboardEntry[]) => localStorage.setItem('fc_leaderboard', JSON.stringify(lb));

export default function FluidCoreApp({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [score, setScore] = useState(0);
  const [coreHp, setCoreHp] = useState(100);
  const [energy, setEnergy] = useState(0); // For Supernova 0 ~ 100
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(getLeaderboard());
  
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  const dropsRef = useRef<Drop[]>([]);
  const wallsRef = useRef<Wall[]>([]);
  const pointerRef = useRef<{ isDown: boolean; last?: Pt }>({ isDown: false });
  const entityIdRef = useRef(0);
  const playTimeRef = useRef(0); // total seconds

  const canvasWidth = Math.min(window.innerWidth, 500);
  const canvasHeight = Math.min(window.innerHeight - 80, 800);

  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setCoreHp(100);
    setEnergy(0);
    playTimeRef.current = 0;
    dropsRef.current = [];
    wallsRef.current = [];
    pointerRef.current = { isDown: false };
    lastTimeRef.current = performance.now();
  };

  const supernova = useCallback(() => {
    if (energy < 100) return;
    setEnergy(0);
    // Blast all drops away
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    for (const d of dropsRef.current) {
       const dx = d.x - cx; const dy = d.y - cy;
       const mag = Math.hypot(dx, dy) || 1;
       d.vx += (dx / mag) * 1500;
       d.vy += (dy / mag) * 1500;
    }
  }, [energy, canvasWidth, canvasHeight]);

  useEffect(() => {
    const hKey = (e: KeyboardEvent) => { if (e.code === 'Space') supernova(); };
    window.addEventListener('keydown', hKey);
    return () => window.removeEventListener('keydown', hKey);
  }, [supernova]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    const loop = (time: number) => {
      const dt = Math.min(0.1, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;
      frameRef.current = requestAnimationFrame(loop);

      playTimeRef.current += dt;
      setScore(Math.floor(playTimeRef.current * 10));

      // Spawn Drops
      // Spawn rate increases over time
      const spawnRate = Math.min(MAX_DROPS, 20 + playTimeRef.current * 5); // drops per second
      const dropstospawn = spawnRate * dt;
      const tks = Math.floor(dropstospawn) + (Math.random() < (dropstospawn % 1) ? 1 : 0);
      for(let i=0; i<tks && dropsRef.current.length < MAX_DROPS; i++){
         const angle = Math.random() * Math.PI * 2;
         const dist = canvasHeight + 100;
         dropsRef.current.push({
            id: ++entityIdRef.current,
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            vx: (Math.random()-0.5)*50,
            vy: (Math.random()-0.5)*50,
            radius: 3 + Math.random()*2
         });
      }

      // Energy recovery
      setEnergy(e => Math.min(100, e + dt * 2));

      // Update Walls
      for (let i = wallsRef.current.length - 1; i >= 0; i--) {
        const w = wallsRef.current[i];
        w.life -= dt;
        if (w.life <= 0) wallsRef.current.splice(i, 1);
      }

      let hpDmg = 0;

      // Update Drops
      for (let i = dropsRef.current.length - 1; i >= 0; i--) {
         const d = dropsRef.current[i];
         
         // Attract to core
         const dirX = cx - d.x; const dirY = cy - d.y;
         const mag = Math.hypot(dirX, dirY) || 1;
         
         // Core hit check
         if (mag < CORE_RADIUS + d.radius) {
            hpDmg += 1;
            dropsRef.current.splice(i, 1);
            continue;
         }

         const force = 150 + Math.random()*100; // gravity force
         d.vx += (dirX / mag) * force * dt;
         d.vy += (dirY / mag) * force * dt;

         // Friction
         d.vx *= 0.99; d.vy *= 0.99;
         
         // Apply speed limit
         const curSpeed = Math.hypot(d.vx, d.vy);
         if (curSpeed > 600) {
            d.vx = (d.vx/curSpeed)*600;
            d.vy = (d.vy/curSpeed)*600;
         }

         // Next Pos
         let nx = d.x + d.vx * dt;
         let ny = d.y + d.vy * dt;

         // Wall Collision
         for (const w of wallsRef.current) {
            const dx = w.x1 - w.x0; const dy = w.y1 - w.y0;
            const l2 = dx*dx + dy*dy;
            if (l2 === 0) continue;
            let t = ((nx - w.x0) * dx + (ny - w.y0) * dy) / l2;
            t = Math.max(0, Math.min(1, t));
            const px = w.x0 + t*dx; const py = w.y0 + t*dy;
            const distSq = (nx - px)**2 + (ny - py)**2;
            
            if (distSq < (d.radius+2)**2) {
               const dist = Math.sqrt(distSq) || 0.01;
               const normX = (nx - px) / dist; const normY = (ny - py) / dist;
               nx = px + normX * (d.radius+2);
               ny = py + normY * (d.radius+2);
               const dot = d.vx * normX + d.vy * normY;
               if (dot < 0) {
                  d.vx -= 1.8 * dot * normX; d.vy -= 1.8 * dot * normY;
                  d.vx += (Math.random()-0.5)*50; d.vy += (Math.random()-0.5)*50; // chaotic splash
               }
            }
         }

         // Add some separation from other drops to simulate fluid (naive approach)
         // Fast approx: only check a few random drops per frame or local grid 
         // For O(N) performance, we pick 5 random drops to repel against instead of all N^2
         for(let k=0; k<3; k++) {
            const oidx = Math.floor(Math.random()*dropsRef.current.length);
            const o = dropsRef.current[oidx];
            if(o && o.id !== d.id) {
               const odx = nx - o.x; const ody = ny - o.y;
               const odist = Math.hypot(odx, ody);
               const minDist = d.radius + o.radius;
               if(odist > 0 && odist < minDist) {
                  const push = (minDist - odist) * 0.5;
                  nx += (odx/odist)*push; ny += (ody/odist)*push;
               }
            }
         }

         d.x = nx; d.y = ny;
      }

      if (hpDmg > 0) {
         setCoreHp(h => {
           const nh = h - hpDmg;
           if (nh <= 0 && gameState === 'playing') {
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
           return nh;
         });
      }

      // Render
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Render Walls
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 10;
      for (const w of wallsRef.current) {
         const alpha = w.life / WALL_LIFETIME;
         ctx.beginPath();
         ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1);
         ctx.strokeStyle = `rgba(14, 165, 233, ${alpha})`;
         ctx.shadowColor = '#38bdf8';
         ctx.lineWidth = 4;
         ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Render Drops
      ctx.fillStyle = 'rgba(6, 182, 212, 0.7)';
      for (const d of dropsRef.current) {
         ctx.beginPath();
         ctx.arc(d.x, d.y, d.radius, 0, Math.PI*2);
         ctx.fill();
      }

      // Render Core
      const coreHue = hpDmg > 0 ? '0, 100%, 60%' : '14, 100%, 60%';
      ctx.shadowBlur = 20;
      ctx.shadowColor = `hsla(${coreHue}, 0.8)`;
      ctx.fillStyle = `hsla(${coreHue}, 1)`;
      ctx.beginPath();
      ctx.arc(cx, cy, CORE_RADIUS + Math.sin(time*0.005)*5, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState, canvasWidth, canvasHeight, leaderboard]);

  const handlePtrDown = (e: React.PointerEvent) => {
    if(gameState!=='playing') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if(!rect) return;
    pointerRef.current = { isDown: true, last: { x: e.clientX - rect.left, y: e.clientY - rect.top } };
  };

  const handlePtrMove = (e: React.PointerEvent) => {
    if(!pointerRef.current.isDown || !pointerRef.current.last) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if(!rect) return;
    const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
    
    const lx = pointerRef.current.last.x; const ly = pointerRef.current.last.y;
    const dist = Math.hypot(cx - lx, cy - ly);
    if (dist > 15) {
       wallsRef.current.push({ x0: lx, y0: ly, x1: cx, y1: cy, life: WALL_LIFETIME });
       if (wallsRef.current.length > MAX_WALL_LENGTH) wallsRef.current.shift();
       pointerRef.current.last = { x: cx, y: cy };
    }
  };

  const handlePtrUp = () => pointerRef.current.isDown = false;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020617', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
       <div style={{ padding: '20px' }}>
         <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>{"< 返回"}</button>
       </div>

       {gameState === 'menu' && (
         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff', gap: 20 }}>
           <h1 style={{ color: '#38bdf8', fontSize: '3rem', textShadow: '0 0 20px #0ea5e9' }}>FLUID CORE</h1>
           <p style={{ color: '#94a3b8' }}>拖動滑鼠畫出光牆，防禦來自四面八方的流體海嘯！</p>
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
           <button onClick={startGame} style={{ padding: '15px 40px', background: '#0284c7', border: 'none', borderRadius: 30, color: '#fff', fontSize: '1.5rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 20px #0ea5e9' }}>啟動核心</button>
         </div>
       )}

       {gameState === 'playing' && (
         <div style={{ position: 'relative' }}>
           <div style={{ position: 'absolute', top: 10, left: 10, color: '#fff', zIndex: 10, fontSize: '1.2rem', textShadow: '0 0 5px #000' }}>
              <div>HP: {coreHp} / 100</div>
              <div>能量: {Math.floor(energy)}% {energy >= 100 && '(按SPACE引爆!)'}</div>
              <div>存活: {score} 分</div>
           </div>
           {energy >= 100 && (
             <button onClick={supernova} style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', background: '#f59e0b', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 'bold', zIndex: 10 }}>[超新星爆發]</button>
           )}
           <canvas 
             ref={canvasRef} 
             width={canvasWidth} 
             height={canvasHeight} 
             style={{ background: '#0f172a', borderRadius: 12, boxShadow: '0 0 20px rgba(0,0,0,0.5)', touchAction: 'none' }}
             onPointerDown={handlePtrDown}
             onPointerMove={handlePtrMove}
             onPointerUp={handlePtrUp}
             onPointerCancel={handlePtrUp}
           />
         </div>
       )}

       {gameState === 'gameover' && (
         <div style={{ position: 'relative' }}>
           <canvas width={canvasWidth} height={canvasHeight} style={{ background: '#0f172a', borderRadius: 12, opacity: 0.5 }} />
           <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
             <h2 style={{ fontSize: '3rem', color: '#ef4444', textShadow: '0 0 10px #f87171' }}>核心熔毀</h2>
             <div style={{ fontSize: '1.5rem', color: '#fff' }}>存活時間: {score} 分</div>
             <button onClick={startGame} style={{ padding: '10px 30px', background: '#38bdf8', color: '#000', borderRadius: 20, border: 'none', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>重新啟動</button>
           </div>
         </div>
       )}
    </div>
  );
}
