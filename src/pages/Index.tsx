import { useEffect, useRef, useState, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────
const COLS = 20;
const ROWS = 14;
const CELL = 44;
const W = COLS * CELL;
const H = ROWS * CELL;

// Path: [col, row]
const PATH: [number, number][] = [
  [0,3],[1,3],[2,3],[3,3],[4,3],[4,4],[4,5],[4,6],[4,7],
  [5,7],[6,7],[7,7],[8,7],[8,6],[8,5],[8,4],[8,3],[9,3],
  [10,3],[11,3],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8],
  [12,9],[13,9],[14,9],[15,9],[16,9],[16,8],[16,7],[16,6],
  [16,5],[17,5],[18,5],[19,5],
];
const PATH_SET = new Set(PATH.map(([c, r]) => `${c},${r}`));

// ─── Types ────────────────────────────────────────────────────
type TowerType = "archer" | "mage" | "ice" | "poison";
type EnemyType = "slime" | "goblin" | "orc" | "bat";

interface Tower {
  id: number; col: number; row: number; type: TowerType;
  level: number; cooldown: number; maxCooldown: number;
  angle: number; shootAnim: number;
}
interface Enemy {
  id: number; pathIndex: number; x: number; y: number;
  hp: number; maxHp: number; speed: number; reward: number;
  type: EnemyType; wobble: number; frozen: number;
  poisoned: number; poisonDmg: number; blinking: number;
}
interface Bullet {
  id: number; x: number; y: number; tx: number; ty: number;
  speed: number; damage: number; color: string; size: number;
  special: string; enemyId: number;
}
interface FloatText {
  id: number; x: number; y: number; text: string;
  color: string; life: number; vy: number;
}
interface Particle {
  id: number; x: number; y: number; vx: number; vy: number;
  life: number; color: string; size: number;
}

// ─── Definitions ─────────────────────────────────────────────
const TOWER_DEFS: Record<TowerType, {
  name: string; emoji: string; color: string; cost: number;
  damage: number[]; range: number[]; cooldown: number[];
  upgradeCost: number[]; desc: string; bulletColor: string; special: string;
}> = {
  archer: {
    name: "Лучник", emoji: "🏹", color: "#f59e0b", cost: 50,
    damage: [15, 25, 40], range: [3.5, 4, 4.5], cooldown: [55, 42, 30],
    upgradeCost: [75, 120], desc: "Быстрая стрельба по одной цели",
    bulletColor: "#fbbf24", special: "fast",
  },
  mage: {
    name: "Маг", emoji: "🧙", color: "#8b5cf6", cost: 80,
    damage: [30, 50, 80], range: [3, 3.5, 4], cooldown: [90, 72, 55],
    upgradeCost: [100, 160], desc: "АоЕ взрыв вокруг цели",
    bulletColor: "#c4b5fd", special: "aoe",
  },
  ice: {
    name: "Морозник", emoji: "❄️", color: "#06b6d4", cost: 65,
    damage: [10, 18, 28], range: [3, 3.5, 4], cooldown: [75, 60, 45],
    upgradeCost: [90, 140], desc: "Замораживает врагов",
    bulletColor: "#67e8f9", special: "freeze",
  },
  poison: {
    name: "Ядовитый", emoji: "☠️", color: "#22c55e", cost: 70,
    damage: [8, 14, 22], range: [3, 3.5, 4], cooldown: [68, 52, 40],
    upgradeCost: [95, 150], desc: "Отравляет — урон со временем",
    bulletColor: "#86efac", special: "poison",
  },
};

const ENEMY_DEFS: Record<EnemyType, {
  emoji: string; color: string; hp: number; speed: number;
  reward: number; size: number;
}> = {
  slime:  { emoji: "🟢", color: "#4ade80", hp: 60,  speed: 1.2, reward: 10, size: 14 },
  goblin: { emoji: "👺", color: "#f97316", hp: 110, speed: 1.7, reward: 15, size: 16 },
  orc:    { emoji: "👹", color: "#dc2626", hp: 280, speed: 0.9, reward: 30, size: 20 },
  bat:    { emoji: "🦇", color: "#7c3aed", hp: 80,  speed: 2.3, reward: 20, size: 12 },
};

const WAVE_CONFIGS: { type: EnemyType; count: number; delay: number }[][] = [
  [{ type: "slime",  count: 8,  delay: 65 }],
  [{ type: "slime",  count: 10, delay: 55 }, { type: "goblin", count: 4,  delay: 85 }],
  [{ type: "goblin", count: 9,  delay: 58 }, { type: "slime",  count: 5,  delay: 45 }],
  [{ type: "orc",    count: 4,  delay: 105},{ type: "goblin", count: 7,  delay: 62 }],
  [{ type: "bat",    count: 11, delay: 45 }, { type: "goblin", count: 9,  delay: 58 }],
  [{ type: "orc",    count: 6,  delay: 85 }, { type: "bat",    count: 13, delay: 42 }, { type: "goblin", count: 5, delay: 62 }],
  [{ type: "orc",    count: 9,  delay: 72 }, { type: "bat",    count: 15, delay: 38 }],
  [{ type: "orc",    count: 13, delay: 62 }, { type: "bat",    count: 12, delay: 42 }, { type: "goblin", count: 10, delay: 52 }],
];

let _nextId = 1;
const gid = () => _nextId++;

// ─── Helpers ─────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Main Component ───────────────────────────────────────────
export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // All mutable game state lives here — never triggers re-renders
  const gs = useRef({
    towers:     [] as Tower[],
    enemies:    [] as Enemy[],
    bullets:    [] as Bullet[],
    floats:     [] as FloatText[],
    particles:  [] as Particle[],
    gold:       150,
    lives:      20,
    wave:       0,
    waveActive: false,
    spawnQueue: [] as { type: EnemyType; delay: number }[],
    spawnTimer: 0,
    gameOver:   false,
    victory:    false,
    frame:      0,
    score:      0,
  });

  // React UI state (synced periodically)
  const [ui, setUi] = useState({ gold: 150, lives: 20, wave: 0, waveActive: false, gameOver: false, victory: false, score: 0 });
  const [selectedType, setSelectedType] = useState<TowerType | null>(null);
  const [pickedTower, setPickedTower] = useState<Tower | null>(null);
  const selectedRef = useRef<TowerType | null>(null);
  const animRef = useRef(0);

  const syncUi = useCallback(() => {
    const g = gs.current;
    setUi({ gold: g.gold, lives: g.lives, wave: g.wave, waveActive: g.waveActive, gameOver: g.gameOver, victory: g.victory, score: g.score });
  }, []);

  // ── Spawn enemy ──
  const spawnEnemy = useCallback((type: EnemyType) => {
    const g = gs.current;
    const def = ENEMY_DEFS[type];
    const mul = 1 + g.wave * 0.2;
    const [sc, sr] = PATH[0];
    g.enemies.push({
      id: gid(), pathIndex: 0,
      x: sc * CELL + CELL / 2, y: sr * CELL + CELL / 2,
      hp: Math.round(def.hp * mul), maxHp: Math.round(def.hp * mul),
      speed: def.speed * (1 + g.wave * 0.05),
      reward: def.reward, type,
      wobble: 0, frozen: 0, poisoned: 0, poisonDmg: 0, blinking: 0,
    });
  }, []);

  // ── Start wave ──
  const startWave = useCallback(() => {
    const g = gs.current;
    if (g.waveActive || g.gameOver || g.victory || g.wave >= WAVE_CONFIGS.length) return;
    g.waveActive = true;
    const queue: { type: EnemyType; delay: number }[] = [];
    WAVE_CONFIGS[g.wave].forEach(grp => {
      for (let i = 0; i < grp.count; i++) queue.push({ type: grp.type, delay: grp.delay + Math.random() * 15 });
    });
    queue.sort(() => Math.random() - 0.5);
    g.spawnQueue = queue;
    g.spawnTimer = 0;
    syncUi();
  }, [syncUi]);

  // ── Place tower ──
  const placeTower = useCallback((col: number, row: number) => {
    const g = gs.current;
    const type = selectedRef.current;
    if (!type || g.gameOver || g.victory) return;
    const def = TOWER_DEFS[type];
    if (g.gold < def.cost) return;
    if (PATH_SET.has(`${col},${row}`)) return;
    if (g.towers.find(t => t.col === col && t.row === row)) return;
    g.towers.push({ id: gid(), col, row, type, level: 0, cooldown: 0, maxCooldown: def.cooldown[0], angle: 0, shootAnim: 0 });
    g.gold -= def.cost;
    const def2 = TOWER_DEFS[type];
    for (let i = 0; i < 8; i++) g.particles.push({ id: gid(), x: col*CELL+CELL/2, y: row*CELL+CELL/2, vx: (Math.random()-.5)*6, vy: (Math.random()-.5)*6, life: 30, color: def2.color, size: 5 });
    syncUi();
  }, [syncUi]);

  // ── Upgrade tower ──
  const upgradeTower = useCallback((id: number) => {
    const g = gs.current;
    const t = g.towers.find(t => t.id === id);
    if (!t || t.level >= 2) return;
    const cost = TOWER_DEFS[t.type].upgradeCost[t.level];
    if (g.gold < cost) return;
    g.gold -= cost;
    t.level++;
    t.maxCooldown = TOWER_DEFS[t.type].cooldown[t.level];
    for (let i = 0; i < 14; i++) g.particles.push({ id: gid(), x: t.col*CELL+CELL/2, y: t.row*CELL+CELL/2, vx: (Math.random()-.5)*7, vy: (Math.random()-.5)*7, life: 45, color: "#ffd700", size: 6 });
    setPickedTower(prev => prev?.id === id ? { ...prev, level: t.level } : prev);
    syncUi();
  }, [syncUi]);

  // ── Sell tower ──
  const sellTower = useCallback((id: number) => {
    const g = gs.current;
    const idx = g.towers.findIndex(t => t.id === id);
    if (idx === -1) return;
    const t = g.towers[idx];
    const def = TOWER_DEFS[t.type];
    let ref = Math.floor(def.cost * 0.5);
    for (let i = 0; i < t.level; i++) ref += Math.floor(def.upgradeCost[i] * 0.5);
    g.gold += ref;
    g.floats.push({ id: gid(), x: t.col*CELL+CELL/2, y: t.row*CELL, text: `+${ref}💰`, color: "#fbbf24", life: 60, vy: -1.5 });
    g.towers.splice(idx, 1);
    setPickedTower(null);
    syncUi();
  }, [syncUi]);

  // ── Reset ──
  const reset = useCallback(() => {
    const g = gs.current;
    g.towers = []; g.enemies = []; g.bullets = []; g.floats = []; g.particles = [];
    g.gold = 150; g.lives = 20; g.wave = 0; g.waveActive = false;
    g.spawnQueue = []; g.spawnTimer = 0; g.gameOver = false; g.victory = false;
    g.frame = 0; g.score = 0; _nextId = 1;
    setPickedTower(null);
    setSelectedType(null);
    syncUi();
  }, [syncUi]);

  // ── Canvas click ──
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = W / rect.width, sy = H / rect.height;
    const col = Math.floor((e.clientX - rect.left) * sx / CELL);
    const row = Math.floor((e.clientY - rect.top) * sy / CELL);
    const g = gs.current;
    const existing = g.towers.find(t => t.col === col && t.row === row);
    if (existing) { setPickedTower(prev => prev?.id === existing.id ? null : existing); return; }
    setPickedTower(null);
    if (selectedRef.current) placeTower(col, row);
  }, [placeTower]);

  useEffect(() => { selectedRef.current = selectedType; }, [selectedType]);

  // ── Game loop ──
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const drawBg = () => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const isPath = PATH_SET.has(`${c},${r}`);
          if (isPath) {
            const g = ctx.createLinearGradient(c*CELL, r*CELL, c*CELL, (r+1)*CELL);
            g.addColorStop(0, "#d4a96a"); g.addColorStop(1, "#c49456");
            ctx.fillStyle = g;
          } else {
            ctx.fillStyle = (c + r) % 2 === 0 ? "#4ade80" : "#3fcf72";
          }
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          if (!isPath) {
            ctx.fillStyle = "rgba(0,120,0,0.08)";
            ctx.fillRect(c*CELL, r*CELL+CELL-3, CELL, 3);
          }
        }
      }
      // path arrows
      for (let i = 1; i < PATH.length; i++) {
        const [c, r] = PATH[i];
        ctx.strokeStyle = "rgba(0,0,0,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(c*CELL+0.5, r*CELL+0.5, CELL-1, CELL-1);
      }
      // start arrow
      const [sc, sr] = PATH[0];
      const pulse = Math.sin(gs.current.frame * 0.08) * 4;
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", sc*CELL - 8 + pulse, sr*CELL + CELL/2);
    };

    const drawTowers = (pickedId: number | null) => {
      gs.current.towers.forEach(tw => {
        const def = TOWER_DEFS[tw.type];
        const cx = tw.col*CELL + CELL/2, cy = tw.row*CELL + CELL/2;
        const isPicked = pickedId === tw.id;

        if (isPicked) {
          const range = def.range[tw.level] * CELL;
          ctx.save();
          ctx.globalAlpha = 0.18; ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.arc(cx, cy, range, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 0.55; ctx.strokeStyle = def.color; ctx.lineWidth = 2;
          ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(cx, cy, range, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]); ctx.restore();
        }

        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.ellipse(cx, cy+17, 15, 5, 0, 0, Math.PI*2); ctx.fill();

        // base
        ctx.save(); ctx.translate(cx, cy);
        const bg = ctx.createRadialGradient(-4, -4, 2, 0, 0, 22);
        bg.addColorStop(0, "#ffffffcc"); bg.addColorStop(0.4, def.color); bg.addColorStop(1, def.color+"88");
        ctx.fillStyle = bg;
        rrect(ctx, -18, -18, 36, 36, 10); ctx.fill();

        // shoot ring
        if (tw.shootAnim > 0) {
          ctx.globalAlpha = tw.shootAnim / 15;
          ctx.strokeStyle = def.bulletColor; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 20 + (15 - tw.shootAnim)*2, 0, Math.PI*2); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // emoji
        ctx.font = `${20 + tw.level*3}px serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(def.emoji, 0, -2);

        // stars
        const starColors = ["#fff", "#ffd700", "#ff6b35"];
        ctx.fillStyle = starColors[tw.level];
        ctx.font = "bold 8px Nunito, sans-serif";
        ctx.textBaseline = "bottom";
        for (let i = 0; i <= tw.level; i++) ctx.fillText("★", -8 + i*8, 24);
        ctx.restore();
      });
    };

    const drawEnemies = () => {
      gs.current.enemies.forEach(e => {
        const def = ENEMY_DEFS[e.type];
        ctx.save(); ctx.translate(e.x, e.y);

        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath(); ctx.ellipse(0, def.size+3, def.size*0.8, 4, 0, 0, Math.PI*2); ctx.fill();

        // freeze overlay
        if (e.frozen > 0) {
          ctx.globalAlpha = 0.45; ctx.fillStyle = "#bae6fd";
          ctx.beginPath(); ctx.arc(0, 0, def.size+4, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
        }

        const alpha = e.blinking > 0 ? 0.3 + Math.abs(Math.sin(e.blinking*0.7))*0.7 : 1;
        ctx.globalAlpha = alpha;
        ctx.rotate(Math.sin(e.wobble * 0.18) * 0.14);
        ctx.font = `${def.size * 1.9}px serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(def.emoji, 0, 0);
        ctx.globalAlpha = 1;

        // HP bar
        const bw = def.size * 2.6, bh = 5, by = -def.size - 11;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        rrect(ctx, -bw/2-1, by-1, bw+2, bh+2, 3); ctx.fill();
        const hpRatio = e.hp / e.maxHp;
        ctx.fillStyle = hpRatio > 0.5 ? "#4ade80" : hpRatio > 0.25 ? "#fbbf24" : "#ef4444";
        rrect(ctx, -bw/2, by, bw*hpRatio, bh, 3); ctx.fill();

        if (e.poisoned > 0) {
          ctx.font = "9px serif"; ctx.textAlign = "center";
          ctx.fillText("💚", bw/2+6, by);
        }
        ctx.restore();
      });
    };

    const drawBullets = () => {
      gs.current.bullets.forEach(b => {
        ctx.save();
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      });
    };

    const drawParticles = () => {
      gs.current.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life / 45;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size*(p.life/45), 0, Math.PI*2); ctx.fill();
        ctx.restore();
      });
    };

    const drawFloats = () => {
      gs.current.floats.forEach(f => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, f.life / 45);
        ctx.font = "bold 14px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        ctx.restore();
      });
    };

    const update = () => {
      const g = gs.current;
      if (g.gameOver || g.victory) return;
      g.frame++;

      // Spawning
      if (g.waveActive && g.spawnQueue.length > 0) {
        g.spawnTimer++;
        if (g.spawnTimer >= g.spawnQueue[0].delay) {
          spawnEnemy(g.spawnQueue[0].type);
          g.spawnQueue.shift();
          g.spawnTimer = 0;
        }
      }

      // Wave done?
      if (g.waveActive && g.spawnQueue.length === 0 && g.enemies.length === 0) {
        g.waveActive = false;
        g.wave++;
        const bonus = 30 + g.wave * 10;
        g.gold += bonus;
        g.floats.push({ id: gid(), x: W/2, y: H/2, text: `🎉 Волна ${g.wave} пройдена! +${bonus}💰`, color: "#fbbf24", life: 90, vy: -0.5 });
        if (g.wave >= WAVE_CONFIGS.length) g.victory = true;
        syncUi();
      }

      // Move enemies
      g.enemies.forEach(e => {
        if (e.frozen > 0) { e.frozen--; return; }
        e.wobble++;
        if (e.blinking > 0) e.blinking--;

        // Poison tick
        if (e.poisoned > 0) {
          e.poisoned--;
          if (e.poisoned % 28 === 0) {
            e.hp -= e.poisonDmg;
            e.blinking = 8;
            g.floats.push({ id: gid(), x: e.x, y: e.y-20, text: `-${e.poisonDmg}`, color: "#86efac", life: 38, vy: -1 });
          }
        }

        const next = PATH[e.pathIndex + 1];
        if (!next) {
          g.lives = Math.max(0, g.lives - 1);
          e.hp = -1;
          if (g.lives <= 0) { g.gameOver = true; syncUi(); }
          return;
        }
        const tx = next[0]*CELL+CELL/2, ty = next[1]*CELL+CELL/2;
        const dx = tx - e.x, dy = ty - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < e.speed) { e.pathIndex++; e.x = tx; e.y = ty; }
        else { e.x += dx/dist*e.speed; e.y += dy/dist*e.speed; }
      });

      // Remove dead enemies
      g.enemies = g.enemies.filter(e => {
        if (e.hp <= 0) {
          g.gold += e.reward; g.score += e.reward * 10;
          for (let i = 0; i < 10; i++) g.particles.push({ id: gid(), x: e.x, y: e.y, vx: (Math.random()-.5)*9, vy: (Math.random()-.5)*9, life: 35, color: ENEMY_DEFS[e.type].color, size: 6 });
          g.floats.push({ id: gid(), x: e.x, y: e.y-10, text: `+${e.reward}💰`, color: "#fbbf24", life: 48, vy: -1.2 });
          return false;
        }
        return true;
      });

      // Towers shoot
      g.towers.forEach(tw => {
        if (tw.shootAnim > 0) tw.shootAnim--;
        if (tw.cooldown > 0) { tw.cooldown--; return; }
        const def = TOWER_DEFS[tw.type];
        const range = def.range[tw.level] * CELL;
        const cx = tw.col*CELL+CELL/2, cy = tw.row*CELL+CELL/2;

        // Find furthest target in range
        let target: Enemy | null = null;
        g.enemies.forEach(e => {
          const d = Math.sqrt((e.x-cx)**2 + (e.y-cy)**2);
          if (d <= range && (!target || e.pathIndex > target.pathIndex)) target = e;
        });

        if (target) {
          tw.cooldown = tw.maxCooldown;
          tw.shootAnim = 15;
          tw.angle = Math.atan2((target as Enemy).y - cy, (target as Enemy).x - cx);
          g.bullets.push({
            id: gid(), x: cx, y: cy,
            tx: (target as Enemy).x, ty: (target as Enemy).y,
            speed: 6 + tw.level*1.5,
            damage: def.damage[tw.level],
            color: def.bulletColor, size: 4 + tw.level,
            special: def.special, enemyId: (target as Enemy).id,
          });
        }
      });

      // Move bullets
      g.bullets = g.bullets.filter(b => {
        const enemy = g.enemies.find(e => e.id === b.enemyId);
        if (enemy) { b.tx = enemy.x; b.ty = enemy.y; }
        const dx = b.tx - b.x, dy = b.ty - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < b.speed + 5) {
          if (enemy) {
            enemy.hp -= b.damage;
            enemy.blinking = 6;
            if (b.special === "freeze") enemy.frozen = 65 + Math.random()*25;
            if (b.special === "poison") { enemy.poisoned = 90; enemy.poisonDmg = Math.round(b.damage*0.35); }
            if (b.special === "aoe") {
              g.enemies.forEach(e => {
                if (e.id === enemy!.id) return;
                const d = Math.sqrt((e.x-enemy!.x)**2 + (e.y-enemy!.y)**2);
                if (d < CELL*1.6) { e.hp -= Math.round(b.damage*0.5); e.blinking = 6; }
              });
              for (let i = 0; i < 7; i++) g.particles.push({ id: gid(), x: enemy.x, y: enemy.y, vx: (Math.random()-.5)*7, vy: (Math.random()-.5)*7, life: 28, color: "#c4b5fd", size: 5 });
            }
          }
          return false;
        }
        b.x += dx/dist*b.speed;
        b.y += dy/dist*b.speed;
        return true;
      });

      // Particles
      g.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life--; });
      g.particles = g.particles.filter(p => p.life > 0);

      // Floats
      g.floats.forEach(f => { f.y += f.vy; f.life--; });
      g.floats = g.floats.filter(f => f.life > 0);
    };

    let pickedIdCache: number | null = null;
    setPickedTower(pt => { pickedIdCache = pt?.id ?? null; return pt; });

    const loop = () => {
      update();
      // read pickedTower id via a tiny closure trick
      setPickedTower(pt => { pickedIdCache = pt?.id ?? null; return pt; });
      ctx.clearRect(0, 0, W, H);
      drawBg();
      drawTowers(pickedIdCache);
      drawEnemies();
      drawBullets();
      drawParticles();
      drawFloats();
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [spawnEnemy, syncUi]);

  // ── UI values ──
  const goldOk = (type: TowerType) => ui.gold >= TOWER_DEFS[type].cost;
  const livesColor = ui.lives > 10 ? "#4ade80" : ui.lives > 5 ? "#fbbf24" : "#ef4444";
  const goldColor = ui.gold >= 80 ? "#fbbf24" : "#ef4444";

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      fontFamily: "'Nunito', 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 24px",
        background: "rgba(255,255,255,0.06)",
        borderBottom: "2px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(12px)",
      }}>
        <span style={{ fontFamily: "Fredoka One, cursive", fontSize: 28, color: "#fbbf24", textShadow: "0 0 24px #f59e0b88" }}>
          🏰 Башня защиты
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <Chip icon="💰" val={ui.gold}  color={goldColor}   label="Золото" />
          <Chip icon="❤️" val={ui.lives} color={livesColor}  label="Жизни" />
          <Chip icon="🌊" val={`${ui.wave}/${WAVE_CONFIGS.length}`} color="#60a5fa" label="Волна" />
          <Chip icon="⭐" val={ui.score} color="#e879f9"     label="Очки" />
        </div>
      </div>

      {/* Game area */}
      <div style={{ display: "flex", gap: 16, padding: 16, width: "100%", maxWidth: 1200 }}>
        {/* Canvas */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{
              display: "block", borderRadius: 16, cursor: selectedType ? "crosshair" : "default",
              boxShadow: "0 0 50px rgba(99,102,241,0.35), 0 20px 60px rgba(0,0,0,0.7)",
              maxWidth: "100%",
            }}
          />
          {/* Overlay */}
          {(ui.gameOver || ui.victory) && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 16, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: ui.victory ? "rgba(0,60,0,0.9)" : "rgba(80,0,0,0.9)",
              backdropFilter: "blur(6px)",
            }}>
              <div style={{ fontSize: 80, marginBottom: 8 }}>{ui.victory ? "🏆" : "💀"}</div>
              <div style={{ fontFamily: "Fredoka One, cursive", fontSize: 44, color: ui.victory ? "#fbbf24" : "#ef4444", textShadow: "0 0 30px currentColor" }}>
                {ui.victory ? "Победа!" : "Поражение!"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 18, marginTop: 6 }}>
                Счёт: <span style={{ color: "#e879f9", fontWeight: 800 }}>{ui.score}</span>
              </div>
              <button onClick={reset} style={{
                marginTop: 28, padding: "13px 40px",
                fontFamily: "Fredoka One, cursive", fontSize: 22, color: "#1a0a2e",
                background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                border: "none", borderRadius: 50, cursor: "pointer",
                boxShadow: "0 4px 24px rgba(251,191,36,0.55)",
                transition: "transform 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.07)")}
                onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
              >
                Ещё раз! 🔄
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 230, flex: 1 }}>
          {/* Wave button */}
          <button
            onClick={startWave}
            disabled={ui.waveActive || ui.gameOver || ui.victory || ui.wave >= WAVE_CONFIGS.length}
            style={{
              padding: "14px 20px", width: "100%",
              fontFamily: "Fredoka One, cursive", fontSize: 20,
              color: ui.waveActive ? "rgba(255,255,255,0.35)" : "#1a0a2e",
              background: ui.waveActive
                ? "rgba(255,255,255,0.08)"
                : "linear-gradient(135deg, #fbbf24, #f97316)",
              border: ui.waveActive ? "2px solid rgba(255,255,255,0.15)" : "none",
              borderRadius: 14, cursor: ui.waveActive ? "not-allowed" : "pointer",
              boxShadow: ui.waveActive ? "none" : "0 4px 22px rgba(249,115,22,0.55)",
              transition: "all 0.2s",
            }}
          >
            {ui.waveActive ? `🌊 Волна ${ui.wave + 1} идёт...` : `🚀 Начать волну ${ui.wave + 1}`}
          </button>

          {/* Tower shop */}
          <div style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 12,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Башни
            </div>
            {(Object.keys(TOWER_DEFS) as TowerType[]).map(type => {
              const def = TOWER_DEFS[type];
              const isSel = selectedType === type;
              const canAfford = goldOk(type);
              return (
                <button key={type} onClick={() => setSelectedType(isSel ? null : type)} style={{
                  width: "100%", marginBottom: 8, padding: "10px 12px", textAlign: "left",
                  background: isSel ? `${def.color}33` : "rgba(255,255,255,0.04)",
                  border: `2px solid ${isSel ? def.color : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 12, cursor: "pointer", opacity: canAfford ? 1 : 0.5,
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{def.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{def.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{def.desc}</div>
                    </div>
                    <span style={{
                      background: canAfford ? "#fbbf24" : "#ef4444",
                      color: "#1a0a2e", fontWeight: 800, fontSize: 12,
                      padding: "2px 8px", borderRadius: 20,
                    }}>{def.cost}💰</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Picked tower panel */}
          {pickedTower && (
            <TowerPanel
              tower={pickedTower}
              gold={ui.gold}
              onUpgrade={() => upgradeTower(pickedTower.id)}
              onSell={() => sellTower(pickedTower.id)}
            />
          )}

          {/* Tips */}
          {!pickedTower && (
            <div style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 12,
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.7,
            }}>
              <div style={{ fontWeight: 800, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>💡 Как играть</div>
              <div>• Выбери башню → кликни на зелёную клетку</div>
              <div>• Кликни на башню → улучши или продай</div>
              <div>• ❄️ замораживает, ☠️ отравляет, 🧙 бьёт по площади</div>
              <div>• За убитых врагов получаешь 💰</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, paddingBottom: 12 }}>
        Башня защиты — {WAVE_CONFIGS.length} волн врагов
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────
function Chip({ icon, val, color, label }: { icon: string; val: number|string; color: string; label: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "6px 14px",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color, fontWeight: 800, fontSize: 18, fontFamily: "Fredoka One, cursive" }}>{icon} {val}</div>
    </div>
  );
}

function TowerPanel({ tower, gold, onUpgrade, onSell }: {
  tower: Tower; gold: number; onUpgrade: () => void; onSell: () => void;
}) {
  const def = TOWER_DEFS[tower.type];
  const canUpgrade = tower.level < 2 && gold >= def.upgradeCost[tower.level];
  const lvlLabel = ["Базовый", "Улучшен", "Максимум"][tower.level];
  return (
    <div style={{
      background: `linear-gradient(135deg, ${def.color}1a, rgba(255,255,255,0.06))`,
      borderRadius: 14, padding: 14,
      border: `2px solid ${def.color}55`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 30 }}>{def.emoji}</span>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{def.name}</div>
          <div style={{ color: def.color, fontSize: 12, fontWeight: 700 }}>{"★".repeat(tower.level+1)} {lvlLabel}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        <InfoBox label="Урон"      value={def.damage[tower.level]} />
        <InfoBox label="Дальность" value={def.range[tower.level].toFixed(1)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {tower.level < 2 && (
          <button onClick={onUpgrade} disabled={!canUpgrade} style={{
            flex: 1, padding: "9px 0", fontWeight: 800, fontSize: 13, border: "none", borderRadius: 10,
            cursor: canUpgrade ? "pointer" : "not-allowed",
            background: canUpgrade ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : "rgba(255,255,255,0.08)",
            color: canUpgrade ? "#1a0a2e" : "rgba(255,255,255,0.25)",
          }}>⬆️ {def.upgradeCost[tower.level]}💰</button>
        )}
        <button onClick={onSell} style={{
          flex: 1, padding: "9px 0", fontWeight: 800, fontSize: 13,
          background: "rgba(239,68,68,0.18)", color: "#ef4444",
          border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, cursor: "pointer",
        }}>🗑 Продать</button>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string|number }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.22)", borderRadius: 8, padding: "5px 8px" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>{label}</div>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}
