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
type TowerType = "archer" | "mage" | "ice" | "poison" | "cannon" | "lightning" | "sniper";
type EnemyType = "slime" | "goblin" | "orc" | "bat" | "spider" | "troll" | "witch" | "knight" | "dragon" | "ghost" | "zombie"
  | "wraith" | "golem" | "hydra" | "lich" | "titan"
  | "crab" | "jellyfish" | "shark" | "siren" | "kraken" | "leviathan";

// Bonus types
type BonusType = "spikes" | "haste" | "airstrike";

interface Tower {
  id: number; col: number; row: number; type: TowerType;
  level: number; cooldown: number; maxCooldown: number;
  angle: number; shootAnim: number;
}
// max level is now 3 (indices 0..3) = 4 tiers
interface Enemy {
  id: number; pathIndex: number; x: number; y: number;
  hp: number; maxHp: number; speed: number; reward: number;
  type: EnemyType; wobble: number; frozen: number;
  poisoned: number; poisonDmg: number; blinking: number;
  summonCooldown?: number; isSummoner?: boolean;
}
interface Bullet {
  id: number; x: number; y: number; tx: number; ty: number;
  speed: number; damage: number; color: string; size: number;
  special: string; enemyId: number;
}
interface SpikesTrap {
  id: number; col: number; row: number; hp: number;
}
interface BonusDef {
  label: string; emoji: string; desc: string; cost: number; color: string;
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
    damage: [15, 25, 40, 62], range: [3.5, 4, 4.5, 5], cooldown: [55, 42, 30, 20],
    upgradeCost: [75, 120, 200], desc: "Быстрая стрельба по одной цели",
    bulletColor: "#fbbf24", special: "fast",
  },
  mage: {
    name: "Маг", emoji: "🧙", color: "#8b5cf6", cost: 80,
    damage: [30, 50, 80, 125], range: [3, 3.5, 4, 4.5], cooldown: [90, 72, 55, 38],
    upgradeCost: [100, 160, 260], desc: "АоЕ взрыв вокруг цели",
    bulletColor: "#c4b5fd", special: "aoe",
  },
  ice: {
    name: "Морозник", emoji: "❄️", color: "#06b6d4", cost: 65,
    damage: [10, 18, 28, 45], range: [3, 3.5, 4, 4.5], cooldown: [75, 60, 45, 32],
    upgradeCost: [90, 140, 230], desc: "Замораживает врагов",
    bulletColor: "#67e8f9", special: "freeze",
  },
  poison: {
    name: "Ядовитый", emoji: "☠️", color: "#22c55e", cost: 70,
    damage: [8, 14, 22, 36], range: [3, 3.5, 4, 4.5], cooldown: [68, 52, 40, 28],
    upgradeCost: [95, 150, 240], desc: "Отравляет — урон со временем",
    bulletColor: "#86efac", special: "poison",
  },
  cannon: {
    name: "Пушка", emoji: "💣", color: "#f97316", cost: 110,
    damage: [55, 90, 145, 220], range: [2.5, 3, 3.5, 4], cooldown: [120, 95, 72, 52],
    upgradeCost: [140, 220, 360], desc: "Мощный взрыв по площади 2×",
    bulletColor: "#fb923c", special: "bigaoe",
  },
  lightning: {
    name: "Молния", emoji: "⚡", color: "#eab308", cost: 95,
    damage: [20, 35, 58, 90], range: [3.5, 4, 4.5, 5], cooldown: [35, 26, 18, 12],
    upgradeCost: [120, 190, 310], desc: "Цепная молния — бьёт 3 цели",
    bulletColor: "#fef08a", special: "chain",
  },
  sniper: {
    name: "Снайпер", emoji: "🎯", color: "#e11d48", cost: 120,
    damage: [80, 135, 210, 320], range: [5, 5.5, 6, 7], cooldown: [150, 120, 90, 65],
    upgradeCost: [160, 250, 400], desc: "Огромный урон одной цели",
    bulletColor: "#fda4af", special: "pierce",
  },
};

const ENEMY_DEFS: Record<EnemyType, {
  emoji: string; color: string; hp: number; speed: number;
  reward: number; size: number;
}> = {
  // ── Уровень 1 ──
  slime:  { emoji: "🟢", color: "#4ade80", hp: 60,    speed: 1.2,  reward: 10, size: 14 },
  goblin: { emoji: "👺", color: "#f97316", hp: 110,   speed: 1.7,  reward: 15, size: 16 },
  orc:    { emoji: "👹", color: "#dc2626", hp: 280,   speed: 0.9,  reward: 30, size: 20 },
  bat:    { emoji: "🦇", color: "#7c3aed", hp: 80,    speed: 2.3,  reward: 20, size: 12 },
  spider: { emoji: "🕷️", color: "#a855f7", hp: 140,   speed: 1.9,  reward: 22, size: 15 },
  zombie: { emoji: "🧟", color: "#65a30d", hp: 200,   speed: 0.7,  reward: 18, size: 18 },
  witch:  { emoji: "🧙‍♀️", color: "#e879f9", hp: 160,   speed: 1.5,  reward: 28, size: 16 },
  troll:  { emoji: "👾", color: "#0ea5e9", hp: 500,   speed: 0.65, reward: 50, size: 22 },
  knight: { emoji: "🛡️", color: "#f1f5f9", hp: 380,   speed: 1.1,  reward: 40, size: 20 },
  ghost:  { emoji: "👻", color: "#e2e8f0", hp: 120,   speed: 2.0,  reward: 25, size: 16 },
  dragon: { emoji: "🐉", color: "#ef4444", hp: 900,   speed: 0.8,  reward: 80, size: 24 },
  // ── Уровень 2 (новые) ──
  wraith: { emoji: "💀", color: "#818cf8", hp: 220,   speed: 2.5,  reward: 35, size: 17 },
  golem:  { emoji: "🪨", color: "#78716c", hp: 1200,  speed: 0.5,  reward: 70, size: 24 },
  hydra:  { emoji: "🐍", color: "#16a34a", hp: 600,   speed: 1.0,  reward: 55, size: 22 },
  lich:   { emoji: "🧛", color: "#9333ea", hp: 450,   speed: 1.3,  reward: 60, size: 20 },
  titan:  { emoji: "👑", color: "#f59e0b", hp: 2500,  speed: 0.4,  reward: 150,size: 28 },
  // ── Уровень 3 (водные) ──
  crab:      { emoji: "🦀", color: "#f97316", hp: 350,   speed: 0.85, reward: 40, size: 18 },
  jellyfish: { emoji: "🪼", color: "#a78bfa", hp: 200,   speed: 1.8,  reward: 30, size: 16 },
  shark:     { emoji: "🦈", color: "#0ea5e9", hp: 700,   speed: 1.4,  reward: 65, size: 22 },
  siren:     { emoji: "🧜", color: "#06b6d4", hp: 480,   speed: 1.6,  reward: 70, size: 20 },
  kraken:    { emoji: "🐙", color: "#1d4ed8", hp: 1800,  speed: 0.6,  reward: 120,size: 26 },
  leviathan: { emoji: "🐳", color: "#0c4a6e", hp: 6000,  speed: 0.35, reward: 400,size: 32 },
};

const BONUS_DEFS: Record<BonusType, BonusDef> = {
  spikes:    { label: "Шипы",          emoji: "🔩", desc: "Разместить на дороге — наносят 120 урона",  cost: 30,  color: "#94a3b8" },
  haste:     { label: "Ускорение",     emoji: "⚡", desc: "Башни атакуют в 2× быстрее 10 секунд",     cost: 150, color: "#fbbf24" },
  airstrike: { label: "Бомбардировка", emoji: "💥", desc: "Все враги на поле получают 50 урона",       cost: 100, color: "#ef4444" },
};

const WAVE_CONFIGS: { type: EnemyType; count: number; delay: number }[][] = [
  // 1 — туториал
  [{ type: "slime",  count: 8,  delay: 65 }],
  // 2
  [{ type: "slime",  count: 12, delay: 52 }, { type: "goblin", count: 3, delay: 88 }],
  // 3 — пауки
  [{ type: "goblin", count: 8,  delay: 60 }, { type: "spider", count: 5, delay: 55 }],
  // 4 — зомби
  [{ type: "zombie", count: 7,  delay: 70 }, { type: "slime",  count: 8, delay: 48 }],
  // 5 — орки
  [{ type: "orc",    count: 4,  delay: 110},{ type: "goblin",  count: 8, delay: 58 }],
  // 6 — летучие мыши + пауки
  [{ type: "bat",    count: 12, delay: 44 }, { type: "spider", count: 8, delay: 52 }],
  // 7 — ведьмы
  [{ type: "witch",  count: 6,  delay: 75 }, { type: "goblin", count: 10, delay: 55 }, { type: "zombie", count: 5, delay: 65 }],
  // 8 — первый тролль
  [{ type: "troll",  count: 2,  delay: 150}, { type: "bat",    count: 14, delay: 40 }, { type: "goblin", count: 8, delay: 58 }],
  // 9 — рыцари
  [{ type: "knight", count: 5,  delay: 90 }, { type: "spider", count: 10, delay: 48 }],
  // 10 — привидения (быстро!)
  [{ type: "ghost",  count: 15, delay: 38 }, { type: "orc",    count: 5,  delay: 95 }, { type: "witch", count: 4, delay: 78 }],
  // 11 — микс
  [{ type: "orc",    count: 7,  delay: 80 }, { type: "knight", count: 5,  delay: 88 }, { type: "bat",   count: 12, delay: 42 }],
  // 12 — тролли и рыцари
  [{ type: "troll",  count: 3,  delay: 130}, { type: "knight", count: 7,  delay: 85 }, { type: "zombie", count: 10, delay: 60 }],
  // 13 — орды привидений
  [{ type: "ghost",  count: 18, delay: 35 }, { type: "witch",  count: 8,  delay: 68 }, { type: "spider", count: 12, delay: 48 }],
  // 14 — армия
  [{ type: "orc",    count: 10, delay: 72 }, { type: "knight", count: 8,  delay: 82 }, { type: "troll",  count: 3, delay: 140 }],
  // 15 — первый дракон!
  [{ type: "dragon", count: 1,  delay: 200}, { type: "ghost",  count: 15, delay: 38 }, { type: "bat",    count: 18, delay: 36 }],
  // 16 — хаос
  [{ type: "witch",  count: 10, delay: 65 }, { type: "knight", count: 9,  delay: 80 }, { type: "zombie", count: 12, delay: 55 }],
  // 17 — два дракона
  [{ type: "dragon", count: 2,  delay: 180}, { type: "troll",  count: 4,  delay: 120}, { type: "ghost",  count: 12, delay: 40 }],
  // 18 — финальный штурм ч.1
  [{ type: "orc",    count: 14, delay: 62 }, { type: "knight", count: 11, delay: 75 }, { type: "bat",    count: 20, delay: 33 }, { type: "witch", count: 7, delay: 68 }],
  // 19 — финальный штурм ч.2
  [{ type: "troll",  count: 5,  delay: 110}, { type: "dragon", count: 2,  delay: 160}, { type: "ghost",  count: 18, delay: 36 }, { type: "spider", count: 15, delay: 44 }],
  // 20 — АПОКАЛИПСИС
  [{ type: "dragon", count: 3,  delay: 150}, { type: "troll",  count: 6,  delay: 100}, { type: "knight", count: 14, delay: 65 }, { type: "ghost",  count: 20, delay: 32 }, { type: "witch", count: 10, delay: 60 }],
];

const WAVE_CONFIGS_2: { type: EnemyType; count: number; delay: number }[][] = [
  // 1 — встреча с призраками
  [{ type: "wraith", count: 8,  delay: 55 }, { type: "ghost",  count: 12, delay: 38 }],
  // 2 — орки и призраки
  [{ type: "orc",    count: 10, delay: 72 }, { type: "wraith", count: 10, delay: 52 }],
  // 3 — голем появился!
  [{ type: "golem",  count: 1,  delay: 250}, { type: "spider", count: 15, delay: 44 }, { type: "bat",    count: 18, delay: 36 }],
  // 4 — рыцари и личи
  [{ type: "lich",   count: 5,  delay: 85 }, { type: "knight", count: 10, delay: 78 }],
  // 5 — хидры и зомби
  [{ type: "hydra",  count: 4,  delay: 105}, { type: "zombie", count: 15, delay: 55 }, { type: "wraith", count: 8, delay: 50 }],
  // 6 — масса призраков
  [{ type: "wraith", count: 20, delay: 40 }, { type: "witch",  count: 10, delay: 65 }],
  // 7 — драконы и личи
  [{ type: "dragon", count: 2,  delay: 160}, { type: "lich",   count: 8,  delay: 80 }, { type: "troll",  count: 4, delay: 115 }],
  // 8 — гигантский голем
  [{ type: "golem",  count: 2,  delay: 220}, { type: "ghost",  count: 20, delay: 35 }, { type: "goblin", count: 20, delay: 40 }],
  // 9 — хидра-орда
  [{ type: "hydra",  count: 7,  delay: 90 }, { type: "knight", count: 12, delay: 72 }, { type: "bat",    count: 25, delay: 30 }],
  // 10 — апокалипсис личей
  [{ type: "lich",   count: 12, delay: 70 }, { type: "wraith", count: 15, delay: 42 }, { type: "troll",  count: 5, delay: 110 }],
  // 11 — троица боссов
  [{ type: "dragon", count: 3,  delay: 145}, { type: "golem",  count: 2,  delay: 210}, { type: "hydra",  count: 5, delay: 95 }],
  // 12 — волна смерти
  [{ type: "wraith", count: 25, delay: 35 }, { type: "ghost",  count: 22, delay: 34 }, { type: "witch",  count: 14, delay: 60 }],
  // 13 — армия рыцарей
  [{ type: "knight", count: 18, delay: 65 }, { type: "lich",   count: 10, delay: 75 }, { type: "zombie", count: 20, delay: 50 }],
  // 14 — три голема
  [{ type: "golem",  count: 3,  delay: 200}, { type: "dragon", count: 3,  delay: 140}, { type: "bat",    count: 30, delay: 28 }],
  // 15 — первый титан!
  [{ type: "titan",  count: 1,  delay: 400}, { type: "wraith", count: 20, delay: 38 }, { type: "hydra",  count: 6, delay: 88 }],
  // 16 — хаос уровня 2
  [{ type: "lich",   count: 14, delay: 68 }, { type: "hydra",  count: 8,  delay: 85 }, { type: "troll",  count: 8, delay: 100 }, { type: "ghost", count: 25, delay: 32 }],
  // 17 — двойной титан
  [{ type: "titan",  count: 2,  delay: 350}, { type: "golem",  count: 4,  delay: 195}, { type: "wraith", count: 22, delay: 36 }],
  // 18 — пятеро драконов
  [{ type: "dragon", count: 5,  delay: 120}, { type: "knight", count: 20, delay: 62 }, { type: "lich",   count: 16, delay: 65 }],
  // 19 — последний штурм
  [{ type: "titan",  count: 2,  delay: 320}, { type: "hydra",  count: 10, delay: 80 }, { type: "golem",  count: 4, delay: 185 }, { type: "wraith", count: 25, delay: 33 }],
  // 20 — мегафинал ч.1
  [{ type: "dragon", count: 6,  delay: 105}, { type: "lich",   count: 18, delay: 62 }, { type: "troll",  count: 10, delay: 92 }, { type: "ghost",  count: 30, delay: 28 }],
  // 21
  [{ type: "titan",  count: 3,  delay: 300}, { type: "golem",  count: 5,  delay: 180}, { type: "wraith", count: 28, delay: 32 }],
  // 22
  [{ type: "hydra",  count: 12, delay: 75 }, { type: "knight", count: 22, delay: 60 }, { type: "lich",   count: 20, delay: 60 }, { type: "bat", count: 35, delay: 26 }],
  // 23
  [{ type: "dragon", count: 7,  delay: 95 }, { type: "titan",  count: 2,  delay: 280}, { type: "ghost",  count: 32, delay: 28 }, { type: "zombie", count: 25, delay: 45 }],
  // 24
  [{ type: "golem",  count: 6,  delay: 175}, { type: "hydra",  count: 14, delay: 70 }, { type: "wraith", count: 30, delay: 30 }, { type: "witch",  count: 18, delay: 58 }],
  // 25
  [{ type: "titan",  count: 4,  delay: 270}, { type: "dragon", count: 8,  delay: 90 }, { type: "lich",   count: 22, delay: 58 }],
  // 26
  [{ type: "golem",  count: 7,  delay: 165}, { type: "titan",  count: 3,  delay: 260}, { type: "hydra",  count: 15, delay: 68 }, { type: "ghost",  count: 35, delay: 26 }],
  // 27
  [{ type: "dragon", count: 10, delay: 82 }, { type: "knight", count: 25, delay: 55 }, { type: "wraith", count: 35, delay: 28 }, { type: "troll",  count: 12, delay: 88 }],
  // 28
  [{ type: "titan",  count: 5,  delay: 250}, { type: "golem",  count: 8,  delay: 155}, { type: "lich",   count: 25, delay: 55 }, { type: "hydra",  count: 18, delay: 65 }],
  // 29
  [{ type: "dragon", count: 12, delay: 75 }, { type: "titan",  count: 4,  delay: 240}, { type: "ghost",  count: 40, delay: 24 }, { type: "wraith", count: 38, delay: 26 }, { type: "witch",  count: 20, delay: 52 }],
  // 30 — ФИНАЛ ВСЕГО
  [{ type: "titan",  count: 6,  delay: 220}, { type: "golem",  count: 10, delay: 145}, { type: "dragon", count: 15, delay: 70 }, { type: "hydra",  count: 20, delay: 62 }, { type: "lich",   count: 30, delay: 50 }, { type: "wraith", count: 40, delay: 24 }],
];

const WAVE_CONFIGS_3: { type: EnemyType; count: number; delay: number }[][] = [
  // 1 — первые крабы
  [{ type: "crab",      count: 8,  delay: 75 }, { type: "jellyfish", count: 10, delay: 50 }],
  // 2 — медузы-рой
  [{ type: "jellyfish", count: 18, delay: 42 }, { type: "crab",      count: 6,  delay: 80 }],
  // 3 — первые акулы
  [{ type: "shark",     count: 4,  delay: 100}, { type: "jellyfish", count: 12, delay: 46 }],
  // 4 — крабы + сирены
  [{ type: "siren",     count: 5,  delay: 88 }, { type: "crab",      count: 10, delay: 72 }],
  // 5 — акулы-орда
  [{ type: "shark",     count: 8,  delay: 90 }, { type: "jellyfish", count: 20, delay: 38 }],
  // 6 — сирены и крабы
  [{ type: "siren",     count: 8,  delay: 80 }, { type: "shark",     count: 5,  delay: 95 }, { type: "crab", count: 12, delay: 68 }],
  // 7 — первый кракен!
  [{ type: "kraken",    count: 1,  delay: 280}, { type: "jellyfish", count: 22, delay: 36 }, { type: "crab", count: 10, delay: 70 }],
  // 8 — акулы + сирены
  [{ type: "shark",     count: 10, delay: 85 }, { type: "siren",     count: 10, delay: 75 }],
  // 9 — два кракена
  [{ type: "kraken",    count: 2,  delay: 250}, { type: "shark",     count: 8,  delay: 88 }, { type: "jellyfish", count: 25, delay: 34 }],
  // 10 — морской хаос
  [{ type: "siren",     count: 14, delay: 70 }, { type: "crab",      count: 18, delay: 62 }, { type: "shark", count: 8, delay: 88 }],
  // 11 — кракен + армия медуз
  [{ type: "kraken",    count: 2,  delay: 240}, { type: "jellyfish", count: 30, delay: 32 }, { type: "siren", count: 12, delay: 68 }],
  // 12 — три кракена
  [{ type: "kraken",    count: 3,  delay: 220}, { type: "shark",     count: 12, delay: 80 }, { type: "crab", count: 16, delay: 65 }],
  // 13 — шторм сирен
  [{ type: "siren",     count: 18, delay: 65 }, { type: "shark",     count: 14, delay: 78 }, { type: "jellyfish", count: 28, delay: 30 }],
  // 14 — морская армада
  [{ type: "kraken",    count: 3,  delay: 210}, { type: "siren",     count: 20, delay: 60 }, { type: "crab", count: 22, delay: 58 }],
  // 15 — кракены + легионы
  [{ type: "kraken",    count: 4,  delay: 200}, { type: "shark",     count: 16, delay: 75 }, { type: "jellyfish", count: 35, delay: 28 }],
  // 16 — бешеный океан
  [{ type: "siren",     count: 22, delay: 58 }, { type: "crab",      count: 25, delay: 55 }, { type: "shark", count: 18, delay: 72 }, { type: "kraken", count: 2, delay: 200 }],
  // 17 — пять кракенов
  [{ type: "kraken",    count: 5,  delay: 185}, { type: "jellyfish", count: 40, delay: 26 }, { type: "siren", count: 18, delay: 58 }],
  // 18 — предфинальный штурм
  [{ type: "shark",     count: 20, delay: 68 }, { type: "siren",     count: 24, delay: 55 }, { type: "kraken", count: 4, delay: 190 }, { type: "crab", count: 28, delay: 52 }],
  // 19 — армада тьмы
  [{ type: "kraken",    count: 6,  delay: 175}, { type: "shark",     count: 22, delay: 65 }, { type: "jellyfish", count: 45, delay: 24 }, { type: "siren", count: 22, delay: 56 }],
  // 20 — ЛЕВИАФАН (призыватель) + армия
  [{ type: "leviathan", count: 1,  delay: 500}, { type: "kraken",    count: 4,  delay: 180}, { type: "siren", count: 20, delay: 55 }, { type: "shark", count: 20, delay: 65 }, { type: "jellyfish", count: 50, delay: 22 }],
];

const ALL_WAVES = [WAVE_CONFIGS, WAVE_CONFIGS_2, WAVE_CONFIGS_3];
const LEVEL_LABELS = ["Лесное королевство", "Тёмная бездна", "Глубины океана"];

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
    spikes:     [] as SpikesTrap[],
    gold:       150,
    lives:      20,
    wave:       0,
    mapLevel:   0,
    waveActive: false,
    spawnQueue: [] as { type: EnemyType; delay: number }[],
    spawnTimer: 0,
    gameOver:   false,
    victory:    false,
    levelUp:    false,
    frame:      0,
    score:      0,
    hasteTicks: 0,
    placingSpikes: false,
  });

  // React UI state (synced periodically)
  const [ui, setUi] = useState({ gold: 150, lives: 20, wave: 0, mapLevel: 0, waveActive: false, gameOver: false, victory: false, levelUp: false, score: 0, hasteTicks: 0, placingSpikes: false });
  const [selectedType, setSelectedType] = useState<TowerType | null>(null);
  const [pickedTower, setPickedTower] = useState<Tower | null>(null);
  const selectedRef = useRef<TowerType | null>(null);
  const animRef = useRef(0);

  const syncUi = useCallback(() => {
    const g = gs.current;
    setUi({ gold: g.gold, lives: g.lives, wave: g.wave, mapLevel: g.mapLevel, waveActive: g.waveActive, gameOver: g.gameOver, victory: g.victory, levelUp: g.levelUp, score: g.score, hasteTicks: g.hasteTicks, placingSpikes: g.placingSpikes });
  }, []);

  // ── Spawn enemy ──
  const spawnEnemy = useCallback((type: EnemyType, pathIdxOverride?: number) => {
    const g = gs.current;
    const def = ENEMY_DEFS[type];
    const globalWave = g.mapLevel * 20 + g.wave;
    const mul = 1 + globalWave * 0.15 + g.mapLevel * 0.5;
    const startIdx = pathIdxOverride ?? 0;
    const [sc, sr] = PATH[startIdx];
    const isSummoner = type === "leviathan";
    g.enemies.push({
      id: gid(), pathIndex: startIdx,
      x: sc * CELL + CELL / 2, y: sr * CELL + CELL / 2,
      hp: Math.round(def.hp * mul), maxHp: Math.round(def.hp * mul),
      speed: def.speed * (1 + globalWave * 0.04),
      reward: Math.round(def.reward * (1 + g.mapLevel * 0.5)), type,
      wobble: 0, frozen: 0, poisoned: 0, poisonDmg: 0, blinking: 0,
      isSummoner, summonCooldown: isSummoner ? 180 : undefined,
    });
  }, []);

  // ── Start wave ──
  const startWave = useCallback(() => {
    const g = gs.current;
    const wavesForLevel = ALL_WAVES[g.mapLevel];
    if (g.waveActive || g.gameOver || g.victory || g.levelUp || g.wave >= wavesForLevel.length) return;
    g.waveActive = true;
    const queue: { type: EnemyType; delay: number }[] = [];
    wavesForLevel[g.wave].forEach(grp => {
      for (let i = 0; i < grp.count; i++) queue.push({ type: grp.type, delay: grp.delay + Math.random() * 15 });
    });
    queue.sort(() => Math.random() - 0.5);
    g.spawnQueue = queue;
    g.spawnTimer = 0;
    syncUi();
  }, [syncUi]);

  // ── Enter next level ──
  const enterNextLevel = useCallback(() => {
    const g = gs.current;
    const nextLevel = g.mapLevel + 1;
    g.mapLevel = nextLevel;
    g.wave = 0;
    g.levelUp = false;
    g.gold += 500;
    g.lives = Math.min(g.lives + 10, 30);
    g.spikes = [];
    if (nextLevel === 1) {
      g.floats.push({ id: gid(), x: W/2, y: H/2, text: "🌑 Добро пожаловать в Тёмную бездну!", color: "#818cf8", life: 120, vy: -0.4 });
    } else if (nextLevel === 2) {
      g.floats.push({ id: gid(), x: W/2, y: H/2, text: "🌊 Добро пожаловать в Глубины океана!", color: "#06b6d4", life: 120, vy: -0.4 });
    }
    syncUi();
  }, [syncUi]);

  // ── Bonus actions ──
  const buyHaste = useCallback(() => {
    const g = gs.current;
    if (g.gold < BONUS_DEFS.haste.cost) return;
    g.gold -= BONUS_DEFS.haste.cost;
    g.hasteTicks = 60 * 10; // 10 seconds at 60fps
    g.floats.push({ id: gid(), x: W/2, y: H/3, text: "⚡ Ускорение башен!", color: "#fbbf24", life: 90, vy: -0.6 });
    syncUi();
  }, [syncUi]);

  const buyAirstrike = useCallback(() => {
    const g = gs.current;
    if (g.gold < BONUS_DEFS.airstrike.cost) return;
    g.gold -= BONUS_DEFS.airstrike.cost;
    g.enemies.forEach(e => {
      e.hp -= 50;
      e.blinking = 14;
    });
    for (let i = 0; i < 20; i++) {
      const randEnemy = g.enemies[Math.floor(Math.random() * g.enemies.length)];
      if (randEnemy) g.particles.push({ id: gid(), x: randEnemy.x + (Math.random()-0.5)*40, y: randEnemy.y + (Math.random()-0.5)*40, vx: (Math.random()-.5)*10, vy: (Math.random()-.5)*10, life: 40, color: "#f97316", size: 8 });
    }
    g.floats.push({ id: gid(), x: W/2, y: H/3, text: "💥 Бомбардировка! −50 всем!", color: "#ef4444", life: 90, vy: -0.6 });
    syncUi();
  }, [syncUi]);

  const startPlacingSpikes = useCallback(() => {
    const g = gs.current;
    if (g.gold < BONUS_DEFS.spikes.cost) return;
    g.placingSpikes = true;
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
    if (!t || t.level >= 3) return;
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
    for (let i = 0; i < Math.min(t.level, def.upgradeCost.length); i++) ref += Math.floor(def.upgradeCost[i] * 0.5);
    g.gold += ref;
    g.floats.push({ id: gid(), x: t.col*CELL+CELL/2, y: t.row*CELL, text: `+${ref}💰`, color: "#fbbf24", life: 60, vy: -1.5 });
    g.towers.splice(idx, 1);
    setPickedTower(null);
    syncUi();
  }, [syncUi]);

  // ── Reset ──
  const reset = useCallback(() => {
    const g = gs.current;
    g.towers = []; g.enemies = []; g.bullets = []; g.floats = []; g.particles = []; g.spikes = [];
    g.gold = 150; g.lives = 20; g.wave = 0; g.mapLevel = 0; g.waveActive = false;
    g.spawnQueue = []; g.spawnTimer = 0; g.gameOver = false; g.victory = false; g.levelUp = false;
    g.frame = 0; g.score = 0; g.hasteTicks = 0; g.placingSpikes = false; _nextId = 1;
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

    // Placing spikes on path
    if (g.placingSpikes) {
      if (PATH_SET.has(`${col},${row}`)) {
        const alreadyHas = g.spikes.find(s => s.col === col && s.row === row);
        if (!alreadyHas && g.gold >= BONUS_DEFS.spikes.cost) {
          g.gold -= BONUS_DEFS.spikes.cost;
          g.spikes.push({ id: gid(), col, row, hp: 3 });
          g.floats.push({ id: gid(), x: col*CELL+CELL/2, y: row*CELL, text: "🔩 Шипы!", color: "#94a3b8", life: 50, vy: -1 });
        }
      }
      g.placingSpikes = false;
      syncUi();
      return;
    }

    const existing = g.towers.find(t => t.col === col && t.row === row);
    if (existing) { setPickedTower(prev => prev?.id === existing.id ? null : existing); return; }
    setPickedTower(null);
    if (selectedRef.current) placeTower(col, row);
  }, [placeTower, syncUi]);

  useEffect(() => { selectedRef.current = selectedType; }, [selectedType]);

  // ── Game loop ──
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    const drawBg = () => {
      const lvl = gs.current.mapLevel;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const isPath = PATH_SET.has(`${c},${r}`);
          if (isPath) {
            const g = ctx.createLinearGradient(c*CELL, r*CELL, c*CELL, (r+1)*CELL);
            if (lvl === 1) { g.addColorStop(0, "#4a2060"); g.addColorStop(1, "#3a1550"); }
            else if (lvl === 2) { g.addColorStop(0, "#0e4f6e"); g.addColorStop(1, "#083a52"); }
            else { g.addColorStop(0, "#d4a96a"); g.addColorStop(1, "#c49456"); }
            ctx.fillStyle = g;
          } else {
            if (lvl === 1) {
              ctx.fillStyle = (c + r) % 2 === 0 ? "#1e1035" : "#180c2a";
            } else if (lvl === 2) {
              ctx.fillStyle = (c + r) % 2 === 0 ? "#0c2d3e" : "#082030";
            } else {
              ctx.fillStyle = (c + r) % 2 === 0 ? "#4ade80" : "#3fcf72";
            }
          }
          ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
          if (!isPath) {
            if (lvl === 2) {
              // Water shimmer effect
              ctx.fillStyle = `rgba(6,182,212,${0.04 + Math.sin(gs.current.frame*0.05 + c + r)*0.03})`;
              ctx.fillRect(c*CELL, r*CELL, CELL, CELL);
            }
            ctx.fillStyle = lvl === 1 ? "rgba(100,0,150,0.12)" : lvl === 2 ? "rgba(0,100,180,0.1)" : "rgba(0,120,0,0.08)";
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

        // stars (4 levels)
        const starColors = ["#fff", "#ffd700", "#ff6b35", "#a855f7"];
        ctx.fillStyle = starColors[tw.level];
        ctx.font = "bold 7px Nunito, sans-serif";
        ctx.textBaseline = "bottom";
        const starOff = -(tw.level * 7) / 2;
        for (let i = 0; i <= tw.level; i++) ctx.fillText("★", starOff + i*7, 24);
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

    const drawSpikes = () => {
      gs.current.spikes.forEach(s => {
        const cx = s.col*CELL + CELL/2, cy = s.row*CELL + CELL/2;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.font = "18px serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🔩", cx, cy);
        // durability dots
        for (let i = 0; i < s.hp; i++) {
          ctx.fillStyle = "#94a3b8";
          ctx.beginPath(); ctx.arc(cx - 8 + i*8, cy + 12, 3, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      });
    };

    const drawHasteOverlay = () => {
      const g = gs.current;
      if (g.hasteTicks <= 0) return;
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.35 + Math.sin(g.frame * 0.15) * 0.15;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(4, 4, W-8, H-8);
      ctx.setLineDash([]);
      ctx.restore();
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
        const bonus = 30 + g.wave * 12 + g.mapLevel * 50;
        g.gold += bonus;
        g.floats.push({ id: gid(), x: W/2, y: H/2, text: `🎉 Волна ${g.wave} пройдена! +${bonus}💰`, color: "#fbbf24", life: 90, vy: -0.5 });
        const wavesForLevel = ALL_WAVES[g.mapLevel];
        if (g.wave >= wavesForLevel.length) {
          if (g.mapLevel < ALL_WAVES.length - 1) {
            g.levelUp = true;
          } else {
            g.victory = true;
          }
        }
        syncUi();
      }

      // Haste timer
      if (g.hasteTicks > 0) g.hasteTicks--;

      // Move enemies + summon logic + spikes check
      g.enemies.forEach(e => {
        // Summoner: leviathan summons minions nearby
        if (e.isSummoner && e.summonCooldown !== undefined) {
          e.summonCooldown--;
          if (e.summonCooldown <= 0) {
            e.summonCooldown = 180;
            // Spawn 2 kraken near leviathan on the path
            const spawnIdx = Math.max(0, e.pathIndex - 3);
            for (let i = 0; i < 2; i++) {
              spawnEnemy("kraken", Math.max(0, spawnIdx - i));
            }
            g.floats.push({ id: gid(), x: e.x, y: e.y - 40, text: "🐳 Призыв!", color: "#06b6d4", life: 70, vy: -0.8 });
          }
        }

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

        // Spikes check
        const ec = Math.round((e.x - CELL/2) / CELL);
        const er = Math.round((e.y - CELL/2) / CELL);
        const spikeIdx = g.spikes.findIndex(s => s.col === ec && s.row === er);
        if (spikeIdx !== -1) {
          e.hp -= 120; e.blinking = 12;
          g.floats.push({ id: gid(), x: e.x, y: e.y-20, text: "-120🔩", color: "#94a3b8", life: 42, vy: -1 });
          g.spikes[spikeIdx].hp--;
          if (g.spikes[spikeIdx].hp <= 0) g.spikes.splice(spikeIdx, 1);
        }
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
        const hasteActive = g.hasteTicks > 0;
        if (tw.cooldown > 0) { tw.cooldown -= hasteActive ? 2 : 1; return; }
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
            if (b.special === "poison") { enemy.poisoned = 110; enemy.poisonDmg = Math.round(b.damage*0.4); }
            if (b.special === "aoe") {
              g.enemies.forEach(e => {
                if (e.id === enemy!.id) return;
                const d = Math.sqrt((e.x-enemy!.x)**2 + (e.y-enemy!.y)**2);
                if (d < CELL*1.6) { e.hp -= Math.round(b.damage*0.5); e.blinking = 6; }
              });
              for (let i = 0; i < 7; i++) g.particles.push({ id: gid(), x: enemy.x, y: enemy.y, vx: (Math.random()-.5)*7, vy: (Math.random()-.5)*7, life: 28, color: "#c4b5fd", size: 5 });
            }
            if (b.special === "bigaoe") {
              g.enemies.forEach(e => {
                if (e.id === enemy!.id) return;
                const d = Math.sqrt((e.x-enemy!.x)**2 + (e.y-enemy!.y)**2);
                if (d < CELL*2.5) { e.hp -= Math.round(b.damage*0.7); e.blinking = 8; }
              });
              for (let i = 0; i < 12; i++) g.particles.push({ id: gid(), x: enemy.x, y: enemy.y, vx: (Math.random()-.5)*10, vy: (Math.random()-.5)*10, life: 35, color: "#fb923c", size: 7 });
            }
            if (b.special === "chain") {
              const chainTargets = g.enemies.filter(e => e.id !== enemy!.id).sort((a,b2) => {
                const da = (a.x-enemy!.x)**2+(a.y-enemy!.y)**2;
                const db2 = (b2.x-enemy!.x)**2+(b2.y-enemy!.y)**2;
                return da - db2;
              }).slice(0, 2);
              chainTargets.forEach(ct => { ct.hp -= Math.round(b.damage*0.6); ct.blinking = 6; for (let i=0;i<5;i++) g.particles.push({id:gid(),x:ct.x,y:ct.y,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,life:22,color:"#fef08a",size:4}); });
            }
            if (b.special === "pierce") {
              for (let i = 0; i < 16; i++) g.particles.push({ id: gid(), x: enemy.x, y: enemy.y, vx: (Math.random()-.5)*12, vy: (Math.random()-.5)*12, life: 40, color: "#fda4af", size: 6 });
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
      drawSpikes();
      drawTowers(pickedIdCache);
      drawEnemies();
      drawBullets();
      drawParticles();
      drawHasteOverlay();
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
  const currentWaves = ALL_WAVES[ui.mapLevel];
  const levelLabel = LEVEL_LABELS[ui.mapLevel];
  const hasteSecsLeft = Math.ceil(ui.hasteTicks / 60);

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
        <div>
          <span style={{ fontFamily: "Fredoka One, cursive", fontSize: 28, color: "#fbbf24", textShadow: "0 0 24px #f59e0b88" }}>
            🏰 Башня защиты
          </span>
          <div style={{ fontSize: 11, color: ui.mapLevel === 2 ? "#06b6d4" : ui.mapLevel === 1 ? "#818cf8" : "#4ade80", fontWeight: 700, marginTop: -2 }}>
            {ui.mapLevel === 2 ? "🌊" : ui.mapLevel === 1 ? "🌑" : "🌲"} Уровень {ui.mapLevel + 1}: {levelLabel}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Chip icon="💰" val={ui.gold}  color={goldColor}   label="Золото" />
          <Chip icon="❤️" val={ui.lives} color={livesColor}  label="Жизни" />
          <Chip icon="🌊" val={`${ui.wave}/${currentWaves.length}`} color="#60a5fa" label="Волна" />
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
          {/* Level-up overlay */}
          {ui.levelUp && !ui.gameOver && !ui.victory && (() => {
            const isToLevel2 = ui.mapLevel === 0;
            const isToLevel3 = ui.mapLevel === 1;
            const nextEmoji = isToLevel2 ? "🌑" : "🌊";
            const nextName = isToLevel2 ? "Тёмную бездну" : "Глубины океана";
            const overlayColor = isToLevel2 ? "#818cf8" : "#06b6d4";
            const btnGradient = isToLevel2 ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "linear-gradient(135deg, #0891b2, #0e7490)";
            const btnShadow = isToLevel2 ? "0 4px 28px rgba(124,58,237,0.65)" : "0 4px 28px rgba(6,182,212,0.65)";
            const wavesCount = isToLevel3 ? "20" : "30";
            const nextDesc = isToLevel2 ? "Тебя ждут 30 волн тьмы с новыми монстрами." : "Тебя ждут 20 волн морских ужасов.\nФинальный босс — Левиафан-призыватель!";
            return (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 16, display: "flex",
                flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: "rgba(10,5,40,0.93)",
                backdropFilter: "blur(8px)",
              }}>
                <div style={{ fontSize: 90, marginBottom: 8 }}>{nextEmoji}</div>
                <div style={{ fontFamily: "Fredoka One, cursive", fontSize: 38, color: overlayColor, textShadow: `0 0 30px ${overlayColor}` }}>
                  Уровень {ui.mapLevel + 1} пройден!
                </div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, marginTop: 8, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
                  Твои башни сохранены.<br/>{nextDesc}<br/>
                  <span style={{ color: "#fbbf24" }}>+500💰 и +10❤️ в подарок! ({wavesCount} волн)</span>
                </div>
                <button onClick={enterNextLevel} style={{
                  marginTop: 28, padding: "13px 44px",
                  fontFamily: "Fredoka One, cursive", fontSize: 22, color: "#fff",
                  background: btnGradient,
                  border: "none", borderRadius: 50, cursor: "pointer",
                  boxShadow: btnShadow,
                  transition: "transform 0.15s",
                }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.07)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                >
                  В {nextName}! {nextEmoji}
                </button>
              </div>
            );
          })()}
          {/* Game over / Victory overlay */}
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
              {ui.victory && (
                <div style={{ color: "#06b6d4", fontSize: 16, marginTop: 4 }}>
                  Все 3 уровня пройдены — ты легенда океана! 👑🌊
                </div>
              )}
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
            disabled={ui.waveActive || ui.gameOver || ui.victory || ui.levelUp || ui.wave >= currentWaves.length}
            style={{
              padding: "14px 20px", width: "100%",
              fontFamily: "Fredoka One, cursive", fontSize: 20,
              color: ui.waveActive ? "rgba(255,255,255,0.35)" : "#1a0a2e",
              background: ui.waveActive
                ? "rgba(255,255,255,0.08)"
                : ui.mapLevel === 2
                  ? "linear-gradient(135deg, #0891b2, #0e7490)"
                  : ui.mapLevel === 1
                    ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                    : "linear-gradient(135deg, #fbbf24, #f97316)",
              border: ui.waveActive ? "2px solid rgba(255,255,255,0.15)" : "none",
              borderRadius: 14, cursor: ui.waveActive ? "not-allowed" : "pointer",
              boxShadow: ui.waveActive ? "none" : ui.mapLevel === 2 ? "0 4px 22px rgba(8,145,178,0.55)" : ui.mapLevel === 1 ? "0 4px 22px rgba(124,58,237,0.55)" : "0 4px 22px rgba(249,115,22,0.55)",
              transition: "all 0.2s",
            }}
          >
            {ui.waveActive
              ? `🌊 Волна ${ui.wave + 1}/${currentWaves.length} идёт...`
              : `🚀 Начать волну ${ui.wave + 1}/${currentWaves.length}`}
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
              <div>• Выбери башню → кликни на свободную клетку</div>
              <div>• Кликни на башню → улучши до 4★ или продай</div>
              <div>• ❄️ замораживает, ☠️ отравляет, 🧙 бьёт по площади</div>
              <div>• Уровень 3: 🐳 Левиафан призывает союзников!</div>
              <div>• Используй бонусы внизу в нужный момент 👇</div>
            </div>
          )}
        </div>
      </div>

      {/* Bonus panel */}
      <div style={{
        width: "100%", maxWidth: 1200,
        padding: "10px 16px 4px",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
          ⚡ Бонусы
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Spikes */}
          <BonusButton
            bonus={BONUS_DEFS.spikes}
            canAfford={ui.gold >= BONUS_DEFS.spikes.cost}
            active={ui.placingSpikes}
            onClick={startPlacingSpikes}
            extra={ui.placingSpikes ? "Кликни на дорогу!" : undefined}
          />
          {/* Haste */}
          <BonusButton
            bonus={BONUS_DEFS.haste}
            canAfford={ui.gold >= BONUS_DEFS.haste.cost}
            active={ui.hasteTicks > 0}
            onClick={buyHaste}
            extra={ui.hasteTicks > 0 ? `${hasteSecsLeft}с` : undefined}
          />
          {/* Airstrike */}
          <BonusButton
            bonus={BONUS_DEFS.airstrike}
            canAfford={ui.gold >= BONUS_DEFS.airstrike.cost && ui.waveActive}
            active={false}
            onClick={buyAirstrike}
            extra={!ui.waveActive ? "Во время волны" : undefined}
          />
        </div>
      </div>

      <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, paddingBottom: 12 }}>
        Башня защиты — 3 уровня · 70 волн · 22 типа врагов · 7 башен до 4 звёзд
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
  const canUpgrade = tower.level < 3 && gold >= def.upgradeCost[tower.level];
  const lvlLabel = ["Базовый", "Улучшен", "Элитный", "Легендарный"][tower.level];
  const starBg = ["#fff", "#ffd700", "#ff6b35", "#a855f7"][tower.level];
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
          <div style={{ color: starBg, fontSize: 12, fontWeight: 700 }}>{"★".repeat(tower.level+1)} {lvlLabel}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        <InfoBox label="Урон"      value={def.damage[tower.level]} />
        <InfoBox label="Дальность" value={def.range[tower.level].toFixed(1)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {tower.level < 3 && (
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

function BonusButton({ bonus, canAfford, active, onClick, extra }: {
  bonus: BonusDef; canAfford: boolean; active: boolean; onClick: () => void; extra?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!canAfford && !active}
      title={bonus.desc}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px",
        background: active
          ? `${bonus.color}33`
          : canAfford ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
        border: `2px solid ${active ? bonus.color : canAfford ? bonus.color + "55" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 12, cursor: canAfford || active ? "pointer" : "not-allowed",
        transition: "all 0.15s",
        opacity: canAfford || active ? 1 : 0.45,
        minWidth: 140,
      }}
      onMouseEnter={e => { if (canAfford || active) e.currentTarget.style.transform = "scale(1.04)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <span style={{ fontSize: 22 }}>{bonus.emoji}</span>
      <div style={{ textAlign: "left" }}>
        <div style={{ color: active ? bonus.color : "#fff", fontWeight: 800, fontSize: 13 }}>
          {bonus.label} {extra && <span style={{ color: bonus.color, fontWeight: 900 }}>({extra})</span>}
        </div>
        <div style={{ color: active ? bonus.color : "#fbbf24", fontSize: 11, fontWeight: 700 }}>
          {active && !extra ? "Активно!" : `${bonus.cost}💰`}
        </div>
      </div>
    </button>
  );
}