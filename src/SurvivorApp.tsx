import { useState, useEffect, useRef } from 'react';

// --- Types & Constants ---
type GameState = 'menu' | 'playing' | 'levelup' | 'revive' | 'gameover' | 'paused';

interface Player {
  x: number; y: number; hp: number; maxHp: number; baseSpeed: number; baseMagnet: number;
}

interface Enemy {
  id: number; x: number; y: number; hp: number; maxHp: number; speed: number; radius: number;
  type: 'basic' | 'elite' | 'boss'; dead?: boolean;
}

interface Bullet {
  id: number; x: number; y: number; vx: number; vy: number;
  damage: number; pierce: number; life: number; color: string; radius: number;
  explosive_radius?: number;
  boomerang?: boolean;
  orbit?: { angle: number, radius: number, speed: number };
  dot?: boolean;
}

interface ExpGem { id: number; x: number; y: number; value: number; }
interface CoinDrop { id: number; x: number; y: number; value: number; }
interface DmgText { id: number; text: string; x: number; y: number; life: number; color: string; }
interface Particle { id: number; type: 'lightning' | 'explosion' | 'nuke'; x: number; y: number; tx?: number; ty?: number; radius?: number; life: number; maxLife: number; }

interface LeaderboardEntry { time: number; score: number; date: string; }

// --- Weapon Definitions ---
interface WeaponContext {
  p: Player; time: number; dt: number;
  addBullet: (b: Omit<Bullet, 'id'>) => void;
  enemies: Enemy[]; damageEnemy: (e: Enemy, dmg: number) => void;
  addParticle: (p: Omit<Particle, 'id'>) => void;
}

const getNearest = (p: Player, enemies: Enemy[]) => {
  let nearest: Enemy | null = null; let minDist = Infinity;
  for (const e of enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < minDist) { minDist = d; nearest = e; }
  }
  return nearest;
};
const getRandomTarget = (enemies: Enemy[]) => enemies.length > 0 ? enemies[Math.floor(Math.random() * enemies.length)] : null;
const getDir = (p: Player | Bullet, e: ReturnType<typeof getNearest>) => {
  if(!e) return {dx:0, dy:0, mag:1};
  const dx = e.x - p.x; const dy = e.y - p.y;
  return { dx, dy, mag: Math.hypot(dx, dy) || 1 };
};

interface WeaponDef {
  id: string; name: string; icon: string; maxLevel: number;
  getDesc: (level: number) => string;
  getCd: (level: number) => number;
  fire: (ctx: WeaponContext, level: number) => void;
}

const WEAPONS: Record<string, WeaponDef> = {
  handgun: {
    id: 'handgun', name: '小手槍', icon: '🔫', maxLevel: 8,
    getDesc: (l) => `射擊單體 (傷 ${10 + l*5}, 穿透 ${l})`,
    getCd: (l) => Math.max(100, 400 - l*30),
    fire: (ctx, l) => {
       const target = getNearest(ctx.p, ctx.enemies);
       if(!target || Math.hypot(ctx.p.x - target.x, ctx.p.y - target.y) > 500) return;
       const { dx, dy, mag } = getDir(ctx.p, target);
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: dx/mag*600, vy: dy/mag*600, damage: 10+l*5, pierce: l, life: 1.5, color: '#0ea5e9', radius: 6 });
    }
  },
  shotgun: {
    id: 'shotgun', name: '散彈槍', icon: '💥', maxLevel: 8,
    getDesc: (l) => `面狀射擊 (彈丸 ${2+l}, 傷 ${10+l*3})`,
    getCd: (l) => Math.max(400, 1000 - l*50),
    fire: (ctx, l) => {
       const target = getNearest(ctx.p, ctx.enemies);
       if(!target || Math.hypot(ctx.p.x - target.x, ctx.p.y - target.y) > 400) return;
       const pellets = 2 + l;
       const { dx, dy } = getDir(ctx.p, target);
       const baseAngle = Math.atan2(dy, dx);
       for(let i=0; i<pellets; i++){
          const angle = baseAngle + (Math.random() - 0.5) * 0.8;
          ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: Math.cos(angle)*500, vy: Math.sin(angle)*500, damage: 10+l*3, pierce: 1, life: 0.6, color: '#f59e0b', radius: 4 });
       }
    }
  },
  sniper: {
    id: 'sniper', name: '狙擊槍', icon: '🎯', maxLevel: 8,
    getDesc: (l) => `直線毀滅 (傷 ${50+l*25}, CD -${l*100}ms)`,
    getCd: (l) => Math.max(500, 2000 - l*100),
    fire: (ctx, l) => {
       const target = getNearest(ctx.p, ctx.enemies);
       if(!target) return;
       const { dx, dy, mag } = getDir(ctx.p, target);
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: dx/mag*2000, vy: dy/mag*2000, damage: 50+l*25, pierce: 999, life: 2, color: '#fde047', radius: 8 });
    }
  },
  rocket: {
    id: 'rocket', name: '火箭筒', icon: '🚀', maxLevel: 8,
    getDesc: (l) => `範圍爆炸 (傷 ${30+l*20}, 範圍 ${60+l*10})`,
    getCd: (l) => 2500 - l*100,
    fire: (ctx, l) => {
       const target = getRandomTarget(ctx.enemies); 
       if(!target) return;
       const { dx, dy, mag } = getDir(ctx.p, target);
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: dx/mag*350, vy: dy/mag*350, damage: 30+l*20, pierce: 1, life: 3, color: '#ef4444', radius: 12, explosive_radius: 60+l*10 });
    }
  },
  boomerang: {
    id: 'boomerang', name: '迴旋鏢', icon: '🪃', maxLevel: 8,
    getDesc: (l) => `飛出自轉回歸 (傷 ${15+l*5}, 穿透無數)`,
    getCd: (l) => Math.max(500, 1500 - l*100),
    fire: (ctx, l) => {
       const target = getNearest(ctx.p, ctx.enemies);
       if(!target) return;
       const { dx, dy, mag } = getDir(ctx.p, target);
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: dx/mag*800, vy: dy/mag*800, damage: 15+l*5, pierce: 999, life: 2.5, color: '#fca5a5', radius: 8, boomerang: true });
    }
  },
  mine: {
    id: 'mine', name: '地雷', icon: '💣', maxLevel: 8,
    getDesc: (l) => `放置引爆 (傷 ${50+l*20}, 範圍 ${70+l*10})`,
    getCd: (l) => Math.max(800, 3000 - l*200),
    fire: (ctx, l) => {
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: 0, vy: 0, damage: 50+l*20, pierce: 1, life: 10, color: '#52525b', radius: 10, explosive_radius: 70+l*10 });
    }
  },
  aura: {
    id: 'aura', name: '特斯拉圈', icon: '⚡', maxLevel: 8,
    getDesc: (l) => `電擊周遭 (傷 ${8+l*4}, 範圍 ${90+l*15})`,
    getCd: (l) => Math.max(100, 500 - l*40),
    fire: (ctx, l) => {
       const r = 90 + l*15;
       for (const e of ctx.enemies) {
          if (Math.hypot(e.x - ctx.p.x, e.y - ctx.p.y) < r) {
             ctx.damageEnemy(e, 8+l*4);
             ctx.addParticle({ type: 'lightning', x: ctx.p.x, y: ctx.p.y, tx: e.x, ty: e.y, life: 0.15, maxLife: 0.15 });
          }
       }
    }
  },
  flamer: {
    id: 'flamer', name: '噴火器', icon: '🔥', maxLevel: 8,
    getDesc: (l) => `前方烈火狂噴 (傷 ${5+l*2}, CD極短)`,
    getCd: (l) => Math.max(20, 80 - l*5),
    fire: (ctx, l) => {
       const target = getNearest(ctx.p, ctx.enemies);
       if(!target || Math.hypot(ctx.p.x-target.x, ctx.p.y-target.y) > 250) return;
       const { dx, dy } = getDir(ctx.p, target);
       const angle = Math.atan2(dy, dx) + (Math.random()-0.5)*0.8;
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: Math.cos(angle)*500, vy: Math.sin(angle)*500, damage: 5+l*2, pierce: 3, life: 0.4, color: '#f97316', radius: 6 });
    }
  },
  gear: {
    id: 'gear', name: '旋轉齒輪', icon: '⚙️', maxLevel: 8,
    getDesc: (l) => `環繞絞殺物件 (傷 ${20+l*10}, 數量 ${1+l})`,
    getCd: () => 3000,
    fire: (ctx, l) => {
       const count = 1 + l;
       // We let them last for 3s (which matches the 3000ms CD basically giving 100% uptime)
       for (let i = 0; i<count; i++) {
          ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: 0, vy: 0, damage: 20+l*10, pierce: 999, life: 2.9, color: '#94a3b8', radius: 12, 
            orbit: { angle: (Math.PI*2/count)*i, radius: 100, speed: Math.PI } }); // pi radians per sec
       }
    }
  },
  poison: {
    id: 'poison', name: '毒氣光環', icon: '🧪', maxLevel: 8,
    getDesc: (l) => `定點腐蝕池 (秒傷 ${15+l*10}, 範圍 ${80+l*10})`,
    getCd: (l) => Math.max(800, 2000 - l*100),
    fire: (ctx, l) => {
       ctx.addBullet({ x: ctx.p.x, y: ctx.p.y, vx: 0, vy: 0, damage: 15+l*10, pierce: 999, life: 4, color: 'rgba(34, 197, 94, 0.4)', radius: 80+l*10, dot: true });
    }
  }
};

const MAX_EQUIPPED = 5;

// Global Setup
const getDiamonds = () => parseInt(localStorage.getItem('ns_diamonds') || '0', 10);
const setDiamonds = (val: number) => localStorage.setItem('ns_diamonds', val.toString());
const getGlobalCoins = () => parseInt(localStorage.getItem('ns_coins') || '0', 10);
const setGlobalCoins = (val: number) => localStorage.setItem('ns_coins', val.toString());
const getLeaderboard = (): LeaderboardEntry[] => JSON.parse(localStorage.getItem('ns_leaderboard') || '[]');
const saveLeaderboard = (lb: LeaderboardEntry[]) => localStorage.setItem('ns_leaderboard', JSON.stringify(lb));

const getBaseStats = () => JSON.parse(localStorage.getItem('ns_base_stats') || '{"hp":0, "speed":0, "magnet":0}');
const saveBaseStats = (stats: any) => localStorage.setItem('ns_base_stats', JSON.stringify(stats));

type UpgradeChoice = { id: string; isNew: boolean; level: number; def: WeaponDef };

export default function SurvivorApp({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // App States
  const [gameState, setGameState] = useState<GameState>('menu');
  const [diamonds, setDiamondsState] = useState(getDiamonds());
  const [globalCoins, setGlobalCoinsState] = useState(getGlobalCoins());
  const [leaderboard, setLeaderboardState] = useState<LeaderboardEntry[]>(getLeaderboard());
  const [metaStats, setMetaStats] = useState(getBaseStats());
  
  // Match Stats
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [maxExp, setMaxExp] = useState(10);
  const [score, setScore] = useState(0);
  const [matchCoins, setMatchCoins] = useState(0);
  const [waveTime, setWaveTime] = useState(0);

  // Weapons State
  const [equippedWeapons, setEquippedWeapons] = useState<Record<string, number>>({});
  const [upgradeChoices, setUpgradeChoices] = useState<UpgradeChoice[]>([]);

  // Refs for loop
  const pRef = useRef<Player>({ x: 0, y: 0, hp: 100, maxHp: 100, baseSpeed: 180, baseMagnet: 80 });
  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const expGemsRef = useRef<ExpGem[]>([]);
  const coinDropsRef = useRef<CoinDrop[]>([]);
  const dmgTextsRef = useRef<DmgText[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  const weaponsRef = useRef<Record<string, number>>({});
  const wCooldownsRef = useRef<Record<string, number>>({});
  
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastEnemySpawnRef = useRef<number>(0);
  const pointersRef = useRef<Map<number, {x: number, y: number}>>(new Map());
  const keysRef = useRef<{ [key: string]: boolean }>({});
  
  const entityIdRef = useRef(0);

  const canvasWidth = Math.min(window.innerWidth, 480);
  const canvasHeight = Math.min(window.innerHeight - 120, 680);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'playing') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
  };

  const damageEnemy = (e: Enemy, dmg: number) => {
    e.hp -= dmg;
    // For DOT we limit text spawns
    if(dmg > 1) dmgTextsRef.current.push({ id: ++entityIdRef.current, text: Math.round(dmg).toString(), x: e.x + (Math.random()-0.5)*10, y: e.y - 15, life: 0.5, color: '#fff' });
    
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      setScore(s => s + (e.type === 'elite' ? 50 : 10));
      expGemsRef.current.push({ id: ++entityIdRef.current, x: e.x, y: e.y, value: e.type === 'elite' ? 10 : 2 });
      // 10% chance to drop coin
      if (Math.random() < 0.1 || e.type === 'elite') {
        coinDropsRef.current.push({ id: ++entityIdRef.current, x: e.x + 10, y: e.y + 10, value: e.type === 'elite' ? 3 : 1 });
      }
    }
  };

  const generateUpgradeChoices = () => {
    const hasMax = Object.keys(weaponsRef.current).length >= MAX_EQUIPPED;
    const pool: string[] = [];
    Object.keys(WEAPONS).forEach(k => {
       const curLvl = weaponsRef.current[k] || 0;
       if (curLvl > 0 && curLvl < WEAPONS[k].maxLevel) pool.push(k);
       else if (curLvl === 0 && !hasMax) pool.push(k);
    });
    
    pool.sort(() => Math.random() - 0.5);
    const selected = pool.slice(0, 3);
    
    setUpgradeChoices(selected.map(k => ({
       id: k,
       isNew: !weaponsRef.current[k],
       level: (weaponsRef.current[k] || 0) + 1,
       def: WEAPONS[k]
    })));
  };

  // --- Core Game Loop ---
  useEffect(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      if (dt > 0.1) { frameRef.current = requestAnimationFrame(loop); return; }

      const p = pRef.current;

      // 1. Move Player
      let targetVx = 0; let targetVy = 0;
      if (keysRef.current['w']) targetVy -= 1;
      if (keysRef.current['s']) targetVy += 1;
      if (keysRef.current['a']) targetVx -= 1;
      if (keysRef.current['d']) targetVx += 1;
      
      if (pointersRef.current.size > 0) {
        const ptr = Array.from(pointersRef.current.values())[0];
        const dx = ptr.x - (canvasWidth / 2); 
        const dy = ptr.y - (canvasHeight / 2);
        const dist = Math.hypot(dx, dy);
        if (dist > 10) { targetVx = dx / dist; targetVy = dy / dist; }
      } else {
        const mag = Math.hypot(targetVx, targetVy);
        if (mag > 0) { targetVx /= mag; targetVy /= mag; }
      }

      p.x += targetVx * p.baseSpeed * dt;
      p.y += targetVy * p.baseSpeed * dt;

      // 2. Weapons Fire
      const wCtx: WeaponContext = {
        p, time, dt, enemies: enemiesRef.current, damageEnemy,
        addBullet: (b) => bulletsRef.current.push({ ...b, id: ++entityIdRef.current } as Bullet),
        addParticle: (pt) => particlesRef.current.push({ ...pt, id: ++entityIdRef.current } as Particle)
      };

      for (const [wId, wLvl] of Object.entries(weaponsRef.current)) {
        if (wLvl <= 0) continue;
        const def = WEAPONS[wId];
        const cd = def.getCd(wLvl);
        const lastFire = wCooldownsRef.current[wId] || 0;
        if (time - lastFire >= cd) {
          wCooldownsRef.current[wId] = time;
          def.fire(wCtx, wLvl);
        }
      }

      // 3. Update Enemies
      setWaveTime((prev) => {
        const nt = prev + dt;
        const spawnRate = Math.max(300, 1500 - nt * 5);
        if (time - lastEnemySpawnRef.current > spawnRate) {
          lastEnemySpawnRef.current = time;
          const angle = Math.random() * Math.PI * 2;
          const spawnDist = Math.max(canvasWidth, canvasHeight) * 0.7;
          const isElite = Math.random() < nt / 300;
          enemiesRef.current.push({
            id: ++entityIdRef.current, x: p.x + Math.cos(angle) * spawnDist, y: p.y + Math.sin(angle) * spawnDist,
            hp: isElite ? 150 + nt*1.5 : 20 + nt * 0.8, maxHp: isElite ? 150 + nt*1.5 : 20 + nt * 0.8,
            speed: isElite ? 45 : 60 + Math.random() * 30, radius: isElite ? 18 : 10, type: isElite ? 'elite' : 'basic'
          });
        }
        return nt;
      });

      for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
        const e = enemiesRef.current[i];
        if (e.dead) { enemiesRef.current.splice(i, 1); continue; }
        const dx = p.x - e.x; const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) { e.x += (dx / dist) * e.speed * dt; e.y += (dy / dist) * e.speed * dt; }
        
        if (dist < e.radius + 12) {
          p.hp -= 25 * dt;
          if (p.hp <= 0) {
            cancelAnimationFrame(frameRef.current);
            finishGameAndSave();
            setGameState('revive');
            return;
          }
        }
      }

      // 4. Update Bullets
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const b = bulletsRef.current[i];
        if (b.boomerang) {
          const dx = p.x - b.x; const dy = p.y - b.y;
          const mag = Math.hypot(dx, dy) || 1;
          b.vx += (dx/mag) * 1500 * dt;
          b.vy += (dy/mag) * 1500 * dt;
        }
        if (b.orbit) {
          b.orbit.angle += b.orbit.speed * dt;
          b.x = p.x + Math.cos(b.orbit.angle) * b.orbit.radius;
          b.y = p.y + Math.sin(b.orbit.angle) * b.orbit.radius;
        } else {
          b.x += b.vx * dt; b.y += b.vy * dt;
        }
        b.life -= dt;
        if (b.life <= 0) { bulletsRef.current.splice(i, 1); continue; }
        
        for (let j = enemiesRef.current.length - 1; j >= 0; j--) {
          const e = enemiesRef.current[j];
          if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius) {
            if (b.dot) {
              damageEnemy(e, b.damage * dt);
            } else if (b.explosive_radius) {
              particlesRef.current.push({ id: ++entityIdRef.current, type: 'explosion', x: b.x, y: b.y, radius: b.explosive_radius, life: 0.3, maxLife: 0.3 });
              for (const ex of enemiesRef.current) {
                if (Math.hypot(b.x - ex.x, b.y - ex.y) <= b.explosive_radius) damageEnemy(ex, b.damage);
              }
              b.life = 0; break;
            } else {
              damageEnemy(e, b.damage);
              b.pierce--;
              if (b.pierce <= 0) { b.life = 0; break; }
            }
          }
        }
      }

      // 5. Update Pickups
      let expGained = 0;
      for (let i = expGemsRef.current.length - 1; i >= 0; i--) {
        const g = expGemsRef.current[i];
        const dist = Math.hypot(g.x - p.x, g.y - p.y);
        if (dist < 15) { expGained += g.value; expGemsRef.current.splice(i, 1); }
        else if (dist < p.baseMagnet) {
          g.x += ((p.x - g.x) / dist) * 350 * dt;
          g.y += ((p.y - g.y) / dist) * 350 * dt;
        }
      }
      if (expGained > 0) {
        setExp(prev => {
          const nx = prev + expGained;
          if (nx >= maxExp) {
            cancelAnimationFrame(frameRef.current);
            generateUpgradeChoices();
            setGameState('levelup');
            return prev;
          }
          return nx;
        });
      }
      
      for (let i = coinDropsRef.current.length - 1; i >= 0; i--) {
        const c = coinDropsRef.current[i];
        const dist = Math.hypot(c.x - p.x, c.y - p.y);
        if (dist < 15) { 
          setMatchCoins(mc => mc + c.value);
          coinDropsRef.current.splice(i, 1); 
        }
        else if (dist < p.baseMagnet) {
          c.x += ((p.x - c.x) / dist) * 350 * dt;
          c.y += ((p.y - c.y) / dist) * 350 * dt;
        }
      }

      // 6. Update Visuals
      for (let i = dmgTextsRef.current.length - 1; i >= 0; i--) {
        const t = dmgTextsRef.current[i];
        t.y -= 30 * dt; t.life -= dt;
        if (t.life <= 0) dmgTextsRef.current.splice(i, 1);
      }
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.life -= dt;
        if (pt.life <= 0) particlesRef.current.splice(i, 1);
      }

      // --- Rendering ---
      ctx.fillStyle = '#0a0a23'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      const cx = (x: number) => x - p.x + canvasWidth / 2;
      const cy = (y: number) => y - p.y + canvasHeight / 2;

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.1)'; ctx.lineWidth = 1;
      const gridX = ((cx(0) % 40) + 40) % 40; const gridY = ((cy(0) % 40) + 40) % 40;
      for(let x = gridX - 40; x <= canvasWidth; x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvasHeight); ctx.stroke(); }
      for(let y = gridY - 40; y <= canvasHeight; y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke(); }

      // Pools
      for (const b of bulletsRef.current) {
        if (b.dot) {
           ctx.fillStyle = b.color;
           ctx.beginPath(); ctx.arc(cx(b.x), cy(b.y), b.radius, 0, Math.PI*2); ctx.fill();
        }
      }

      // Pickups
      ctx.fillStyle = '#3b82f6';
      for (const g of expGemsRef.current) { ctx.beginPath(); ctx.arc(cx(g.x), cy(g.y), 4, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle = '#fde047';
      for (const c of coinDropsRef.current) { ctx.beginPath(); ctx.arc(cx(c.x), cy(c.y), 5, 0, Math.PI*2); ctx.fill(); }

      for (const pt of particlesRef.current) {
        if (pt.type === 'lightning' && pt.tx && pt.ty) {
           ctx.strokeStyle = `rgba(168, 85, 247, ${pt.life/pt.maxLife})`; ctx.lineWidth = 3;
           ctx.beginPath(); ctx.moveTo(cx(pt.x), cy(pt.y));
           const midX = (pt.x + pt.tx)/2 + (Math.random()-0.5)*20; const midY = (pt.y + pt.ty)/2 + (Math.random()-0.5)*20;
           ctx.lineTo(cx(midX), cy(midY)); ctx.lineTo(cx(pt.tx), cy(pt.ty)); ctx.stroke();
        } else if (pt.type === 'explosion') {
           ctx.fillStyle = `rgba(239, 68, 68, ${pt.life/pt.maxLife * 0.5})`;
           ctx.beginPath(); ctx.arc(cx(pt.x), cy(pt.y), pt.radius || 10, 0, Math.PI*2); ctx.fill();
        } else if (pt.type === 'nuke') {
           ctx.fillStyle = `rgba(255, 255, 255, ${pt.life/pt.maxLife})`;
           ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
      }

      for (const e of enemiesRef.current) {
        const sx = cx(e.x); const sy = cy(e.y);
        ctx.fillStyle = e.type === 'elite' ? '#f43f5e' : '#f87171';
        ctx.beginPath(); ctx.arc(sx, sy, e.radius, 0, Math.PI*2); ctx.fill();
        if (e.type === 'elite') {
          ctx.fillStyle = 'red'; ctx.fillRect(sx-10, sy-20, 20, 3);
          ctx.fillStyle = '#10b981'; ctx.fillRect(sx-10, sy-20, 20*(Math.max(0,e.hp)/e.maxHp), 3);
        }
      }

      for (const b of bulletsRef.current) {
        if(!b.dot) {
          ctx.fillStyle = b.color; ctx.shadowBlur = 10; ctx.shadowColor = b.color;
          ctx.beginPath(); ctx.arc(cx(b.x), cy(b.y), b.radius, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
        }
      }

      // Player
      ctx.fillStyle = '#10b981'; ctx.shadowBlur = 15; ctx.shadowColor = '#10b981';
      ctx.beginPath(); ctx.arc(canvasWidth/2, canvasHeight/2, 12, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(canvasWidth/2, canvasHeight/2, 6, 0, Math.PI*2); ctx.fill();

      ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      for (const t of dmgTextsRef.current) {
        ctx.fillStyle = `rgba(255,255,255, ${Math.max(0, t.life)})`;
        ctx.fillText(t.text, cx(t.x), cy(t.y));
      }

      // UI Frame
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvasWidth, 36);
      
      const m = Math.floor(waveTime / 60); const s = Math.floor(waveTime % 60);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`${m}:${s.toString().padStart(2, '0')}`, canvasWidth - 10, 24);

      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(10, 42, 100, 6);
      ctx.fillStyle = p.hp > p.maxHp * 0.3 ? '#10b981' : '#ef4444'; ctx.fillRect(10, 42, 100 * Math.max(0, p.hp / p.maxHp), 6);

      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, canvasHeight - 6, canvasWidth, 6);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, canvasHeight - 6, canvasWidth * (exp / maxExp), 6);

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState, canvasWidth, canvasHeight, score, maxExp, exp]);

  // --- Handlers ---
  const applyUpgrade = (choice: UpgradeChoice) => {
    weaponsRef.current[choice.id] = choice.level;
    setEquippedWeapons({ ...weaponsRef.current });
    setExp(e => e - maxExp);
    setMaxExp(m => Math.floor(m * 1.5));
    setLevel(l => l + 1);
    setGameState('playing');
  };

  const startGame = () => {
    const startHp = 100 + metaStats.hp * 50;
    pRef.current = { x: 0, y: 0, hp: startHp, maxHp: startHp, baseSpeed: 180 + metaStats.speed * 20, baseMagnet: 80 + metaStats.magnet * 30 };
    enemiesRef.current = []; bulletsRef.current = []; expGemsRef.current = []; coinDropsRef.current = []; dmgTextsRef.current = []; particlesRef.current = [];
    weaponsRef.current = {}; wCooldownsRef.current = {};
    
    // Pick random starter weapon
    const wKeys = Object.keys(WEAPONS);
    const starter = wKeys[Math.floor(Math.random() * wKeys.length)];
    weaponsRef.current[starter] = 1;

    setEquippedWeapons({ ...weaponsRef.current });
    setScore(0); setMatchCoins(0); setLevel(1); setExp(0); setMaxExp(10); setWaveTime(0);
    setGameState('playing');
  };

  const finishGameAndSave = () => {
    // Only save when we actually game over (or before reviving)
    const safeTime = typeof waveTime === 'function' ? 0 : waveTime;
    const safeScore = typeof score === 'function' ? 0 : score;

    const lb = [...leaderboard, { time: safeTime, score: safeScore, date: new Date().toLocaleDateString() }];
    lb.sort((a,b) => b.score - a.score);
    const top5 = lb.slice(0, 5);
    setLeaderboardState(top5);
    saveLeaderboard(top5);
    
    const totalC = globalCoins + matchCoins + Math.floor(safeScore / 100);
    setGlobalCoinsState(totalC);
    setGlobalCoins(totalC);
    setMatchCoins(0); // committed
  };

  const fullyGameOver = () => {
    setGameState('gameover');
  };

  const handleRevive = () => {
    if (diamonds >= 100) {
      const nd = diamonds - 100; setDiamondsState(nd); setDiamonds(nd);
      pRef.current.hp = pRef.current.maxHp;
      setScore(s => s + enemiesRef.current.length * 50);
      
      particlesRef.current.push({ id: ++entityIdRef.current, type: 'nuke', x: pRef.current.x, y: pRef.current.y, life: 1.0, maxLife: 1.0 });
      enemiesRef.current.forEach(e => {
        particlesRef.current.push({ id: ++entityIdRef.current, type: 'explosion', x: e.x, y: e.y, radius: 50, life: 0.6, maxLife: 0.6 });
      });
      enemiesRef.current = [];
      weaponsRef.current['aura'] = WEAPONS['aura'].maxLevel; 
      setEquippedWeapons({ ...weaponsRef.current });
      setGameState('playing');
    } else alert('鑽石不足！快去商城儲值！');
  };

  const META_MAX_LVL = 10;
  
  const buyMetaUpgrade = (type: 'hp' | 'speed' | 'magnet', cost: number) => {
    if (metaStats[type] >= META_MAX_LVL) { alert('已達滿級！'); return; }
    if (globalCoins >= cost) {
      const nc = globalCoins - cost;
      setGlobalCoinsState(nc); setGlobalCoins(nc);
      const ns = { ...metaStats, [type]: metaStats[type] + 1 };
      setMetaStats(ns); saveBaseStats(ns);
    } else alert('金幣不足！多打幾把遊戲賺外快吧！');
  };

  const hpCost = 50 * (metaStats.hp + 1);
  const speedCost = 100 * (metaStats.speed + 1);
  const magnetCost = 150 * (metaStats.magnet + 1);

  return (
    <div className="game-app">
      <div className="bg-layer rhythm-bg-layer" style={{ background: '#0a0a23' }} />
      <div className="app-container">
        <div className="weather-header">
          <button className="back-btn" onClick={onBack} aria-label="返回首頁">‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>🔫 Neon Survivor</span>
          </div>
          <div style={{ width: 62, textAlign: 'right', fontWeight: 'bold', color: '#fde047', fontSize: '0.8rem' }}>
            {globalCoins} 🪙<br/>
            <span style={{ color: '#38bdf8' }}>{diamonds} 💎</span>
          </div>
        </div>

        <div style={{ position: 'relative', touchAction: 'none' }}>
          <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="rhythm-canvas"
            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerOut={handlePointerUp}
          />

          {(gameState === 'playing' || gameState === 'paused') && (
            <>
              <button 
                onClick={() => setGameState(gameState === 'playing' ? 'paused' : 'playing')}
                style={{ 
                  position: 'absolute', top: 12, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', 
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer'
                }}
              >
                {gameState === 'playing' ? '⏸️ 暫停' : '▶️ 繼續'}
              </button>
              <div style={{ position: 'absolute', top: 52, left: 10, display: 'flex', gap: 8, pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 8, color: '#fff', fontSize: '0.8rem', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.1)'}}>⭐ LV {level}</div>
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 8, color: '#fde047', fontSize: '0.8rem', fontWeight: 'bold', border: '1px solid rgba(250,204,21,0.2)'}}>🪙 {Math.round(score)} (+{matchCoins})</div>
                <div style={{ width: '100%', breakBefore: 'always', display: 'flex', gap: 6, marginTop: 4 }}>
                  {Object.keys(equippedWeapons).map(k => (
                    <div key={k} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px', fontSize: '1rem', width: 32, textAlign: 'center', position: 'relative' }}>
                      {WEAPONS[k].icon}
                      <div style={{ position: 'absolute', bottom: -5, right: -5, background: '#10b981', color: '#000', fontSize: '0.6rem', padding: '1px 4px', borderRadius: 10, fontWeight: 'bold' }}>Lv.{equippedWeapons[k]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {gameState === 'paused' && (
            <div className="game-overlay" style={{ background: 'rgba(0,0,0,0.7)' }}>
              <h2 style={{ fontSize: '3rem', color: '#fff', letterSpacing: 8, marginBottom: 40 }}>PAUSED</h2>
              <button className="game-btn" onClick={() => setGameState('playing')} style={{ background: 'linear-gradient(135deg, #10b981, #047857)', width: '200px' }}>繼續戰鬥</button>
              <button className="game-btn" onClick={() => { finishGameAndSave(); setGameState('menu'); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', width: '200px', marginTop: 15 }}>結算並返回主選單</button>
            </div>
          )}

          {gameState === 'menu' && (
            <div className="game-overlay" style={{ overflowY: 'auto', padding: '20px 0' }}>
              <h2 style={{ fontSize: '2rem', color: '#10b981', textShadow: '0 0 10px #10b981', marginBottom: 5 }}>NEON SURVIVOR</h2>
              
              <button className="game-btn" onClick={startGame} style={{ background: 'linear-gradient(135deg, #10b981, #047857)', width: '200px', margin: '15px 0' }}>進入戰場</button>
              
              <div style={{ width: '90%', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: 12, marginBottom: 15, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 style={{ color: '#fde047', fontSize: '1.2rem', margin: 0 }}>🧬 基因強化 (消耗 🪙)</h3>
                <button className="game-btn" onClick={() => buyMetaUpgrade('hp', hpCost)} style={{ background: metaStats.hp >= META_MAX_LVL ? '#1e293b' : '#334155', opacity: metaStats.hp >= META_MAX_LVL ? 0.6 : 1, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
                  <span>❤️ 基礎血量 [Lv.{metaStats.hp}/10] <span style={{color: '#94a3b8', fontSize: '0.8rem'}}>(+{metaStats.hp*50} HP)</span></span>
                  <span style={{color: '#fde047'}}>{metaStats.hp >= META_MAX_LVL ? 'MAX' : `${hpCost} 🪙`}</span>
                </button>
                <button className="game-btn" onClick={() => buyMetaUpgrade('speed', speedCost)} style={{ background: metaStats.speed >= META_MAX_LVL ? '#1e293b' : '#334155', opacity: metaStats.speed >= META_MAX_LVL ? 0.6 : 1, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
                  <span>👟 移動速度 [Lv.{metaStats.speed}/10] <span style={{color: '#94a3b8', fontSize: '0.8rem'}}>(+{metaStats.speed*20} 速)</span></span>
                  <span style={{color: '#fde047'}}>{metaStats.speed >= META_MAX_LVL ? 'MAX' : `${speedCost} 🪙`}</span>
                </button>
                <button className="game-btn" onClick={() => buyMetaUpgrade('magnet', magnetCost)} style={{ background: metaStats.magnet >= META_MAX_LVL ? '#1e293b' : '#334155', opacity: metaStats.magnet >= META_MAX_LVL ? 0.6 : 1, fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
                  <span>🧲 拾取範圍 [Lv.{metaStats.magnet}/10] <span style={{color: '#94a3b8', fontSize: '0.8rem'}}>(+{metaStats.magnet*30} 距)</span></span>
                  <span style={{color: '#fde047'}}>{metaStats.magnet >= META_MAX_LVL ? 'MAX' : `${magnetCost} 🪙`}</span>
                </button>
              </div>

              {leaderboard.length > 0 && (
                <div style={{ width: '90%', background: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: '15px', marginBottom: 15 }}>
                  <h3 style={{ color: '#38bdf8', fontSize: '1.1rem', margin: '0 0 10px 0' }}>🏆 存活菁英榜</h3>
                  {leaderboard.map((lb, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ color: i===0?'#fde047':i===1?'#cbd5e1':i===2?'#b45309':'#94a3b8' }}>#{i+1} {Math.floor(lb.time/60)}分{Math.floor(lb.time%60)}秒</span>
                      <span style={{ fontWeight: 'bold' }}>{lb.score.toLocaleString()} 分</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.2)', paddingTop: 15, width: '90%' }}>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>課金不手軟，戰力無限遠</p>
                <button className="game-btn" onClick={() => { const nd = diamonds + 500; setDiamondsState(nd); setDiamonds(nd); alert('💰課金成功！');}} style={{ background: 'linear-gradient(135deg, #38bdf8, #2563eb)', fontSize:'0.85rem', padding: '8px 16px' }}>
                  💰 購買 500 💎 ($4.99)
                </button>
              </div>
            </div>
          )}

          {gameState === 'levelup' && (
            <div className="game-overlay" style={{ background: 'rgba(0,0,0,0.85)' }}>
              <h2 style={{ color: '#fde047', fontSize: '2rem', textShadow: '0 0 15px #fde047', marginBottom: 30 }}>✨ LEVEL UP! ✨</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, width: '90%' }}>
                {upgradeChoices.length === 0 ? (
                  <button className="game-btn" onClick={() => { pRef.current.hp = Math.min(pRef.current.maxHp, pRef.current.hp + 50); setExp(e => e - maxExp); setMaxExp(m => Math.floor(m * 1.5)); setLevel(l=>l+1); setGameState('playing'); }} style={{ background: '#3b82f6' }}>武器已全滿，回復 50 HP！</button>
                ) : upgradeChoices.map((c, idx) => (
                  <button key={idx} className="game-btn" onClick={() => applyUpgrade(c)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: c.isNew ? 'linear-gradient(135deg, #a855f7, #6b21a8)' : 'linear-gradient(135deg, #10b981, #047857)' }}>
                    <div style={{ fontSize: '2rem' }}>{c.def.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{c.def.name} <span style={{ fontSize: '0.9rem', color: '#fde047' }}>{c.isNew ? 'New!' : `Lv.${c.level}`}</span></div>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{c.def.getDesc(c.level)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameState === 'revive' && (
            <div className="game-overlay" style={{ background: 'rgba(15, 5, 5, 0.95)' }}>
              <h2 style={{ color: '#ef4444', fontSize: '2.5rem', marginBottom: 10 }}>YOU DIED...</h2>
              <p style={{ color: '#ccc', marginBottom: 30 }}>存活時間：{Math.floor(waveTime/60)}分{Math.floor(waveTime%60)}秒</p>
              <div style={{ border: '2px solid #fde047', borderRadius: 16, padding: '20px', background: 'rgba(250,204,21,0.1)', marginBottom: 20 }}>
                <h3 style={{ color: '#fde047', marginBottom: 10 }}>不甘心嗎？</h3>
                <button className="game-btn" onClick={handleRevive} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', width: '100%', fontSize: '0.95rem' }}>
                  🔥 滿血重生 + 全熒幕清場 (100💎)
                </button>
              </div>
              <button onClick={fullyGameOver} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', textDecoration: 'underline', marginTop: 10 }}>
                放棄治療並結算
              </button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="game-overlay">
              <h2 style={{ color: '#f87171', fontSize: '2rem' }}>GAME OVER</h2>
              <div style={{ margin: '30px 0', lineHeight: 2.2 }}>
                <div>最終等級 <strong style={{ fontSize: '1.4rem', color: '#60a5fa' }}>Lv.{level}</strong></div>
                <div>擊殺積分 <strong style={{ fontSize: '2.5rem', color: '#fde047' }}>{Math.round(score).toLocaleString()}</strong></div>
                <div style={{ color: '#38bdf8' }}>本次帶回金幣: {(matchCoins + Math.floor(score/100))} 🪙</div>
              </div>
              <button className="game-btn" onClick={() => setGameState('menu')}>確認戰果</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
