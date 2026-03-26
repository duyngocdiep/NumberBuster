import React, { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Camera, Play, Trophy, AlertCircle, ChevronRight, Zap, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants & Types ---

const getNeonColor = (value: number, special: SpecialType = 'NONE') => {
  if (special === 'NEGATIVE') return '#000000';
  if (special === 'BLACK_BOMB') return '#111111';
  if (special === 'CLEAR_SCREEN') return '#FFFFFF';
  const colors = [
    '#FF00FF', '#00FFFF', '#FFFF00', '#00FF00', '#FF0000', 
    '#FF8000', '#8000FF', '#0080FF', '#FF0080', '#00FF80',
    '#FF55FF', '#55FFFF', '#FFFF55', '#55FF55', '#FF5555'
  ];
  return colors[(value - 1) % colors.length];
};

const getBlockSize = (value: number, levelId: number, gameMode: GameMode = 'LEVELS', survivalTime: number = 0) => {
  const baseSize = 22; 
  const growth = 2.2; 
  let levelScale = Math.pow(0.96, levelId - 1); 
  
  if (gameMode === 'SURVIVAL') {
    // Survival mode: scale gap increases over time
    const survivalScale = Math.max(0.4, 1 - (survivalTime / 600)); // Shrinks over 10 mins
    levelScale = survivalScale;
  }

  const size = (baseSize + value * growth) * levelScale;
  return Math.min(size, 140 * levelScale); 
};

type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'LEVEL_COMPLETE';
type GameMode = 'LEVELS' | 'SURVIVAL';

type SpecialType = 'TIME_2' | 'TIME_5' | 'BOMB' | 'BOMB_X2' | 'NEGATIVE' | 'BLACK_BOMB' | 'CLEAR_SCREEN' | 'NONE';

interface LevelConfig {
  id: number;
  maxSpawn: number;
  targetScore: number;
  description: string;
  timeLimit: number;
  pacmanFrequency: number; 
  pacmanHealthRange: [number, number];
  pacmanTotalLimit?: number;
  bossImpAfter?: number; // Spawn boss after this many regular imps
  specialBlockChance: number; 
  initialPacman?: boolean;
  minWidth?: number;
}

const LEVELS: LevelConfig[] = [
  { id: 1, maxSpawn: 4, targetScore: 2000, description: "Merge numbers to reach 2,000!", timeLimit: 120, pacmanFrequency: 0, pacmanHealthRange: [0, 0], specialBlockChance: 0.1 },
  { id: 2, maxSpawn: 5, targetScore: 15000, description: "Blocks are shrinking. Reach 15,000!", timeLimit: 120, pacmanFrequency: 0, pacmanHealthRange: [0, 0], specialBlockChance: 0.15 },
  { id: 3, maxSpawn: 6, targetScore: 50000, description: "IMP PACMAN appears! It eats blocks to reduce its health (down to a random min value). Hit it with the EXACT value to destroy it! TIP: Bombs deal damage or destroy Imps with low health.", timeLimit: 120, pacmanFrequency: 0.003, pacmanHealthRange: [20, 50], pacmanTotalLimit: 1, specialBlockChance: 0.2, initialPacman: true },
  { id: 4, maxSpawn: 7, targetScore: 150000, description: "More Imps are coming. TIP: Imps only explode if hit by their EXACT current health!", timeLimit: 120, pacmanFrequency: 0.006, pacmanHealthRange: [50, 100], pacmanTotalLimit: 2, specialBlockChance: 0.25, initialPacman: true, minWidth: 280 },
  { id: 5, maxSpawn: 8, targetScore: 500000, description: "The challenge intensifies. TIP: Bombs are lethal to Imps with low health!", timeLimit: 120, pacmanFrequency: 0.01, pacmanHealthRange: [100, 200], pacmanTotalLimit: 4, bossImpAfter: 3, specialBlockChance: 0.3, initialPacman: true, minWidth: 260 },
  { id: 6, maxSpawn: 9, targetScore: 1000000, description: "Imps are everywhere! Watch out for the BOSS IMP after 3 regular ones!", timeLimit: 120, pacmanFrequency: 0.015, pacmanHealthRange: [200, 400], pacmanTotalLimit: 6, bossImpAfter: 3, specialBlockChance: 0.35, initialPacman: true, minWidth: 240 },
  { id: 7, maxSpawn: 10, targetScore: 2500000, description: "Almost there! Boss Imps appear after every 5 regular ones.", timeLimit: 120, pacmanFrequency: 0.02, pacmanHealthRange: [400, 800], pacmanTotalLimit: 10, bossImpAfter: 5, specialBlockChance: 0.4, initialPacman: true, minWidth: 220 },
  { id: 8, maxSpawn: 11, targetScore: 5000000, description: "Level 8! Boss Imps are extremely tough!", timeLimit: 120, pacmanFrequency: 0.03, pacmanHealthRange: [800, 1500], pacmanTotalLimit: 15, bossImpAfter: 5, specialBlockChance: 0.5, initialPacman: true, minWidth: 200 },
  { id: 9, maxSpawn: 12, targetScore: 10000000, description: "Level 9: Bomb damage increased to 100! Imps are getting stronger.", timeLimit: 120, pacmanFrequency: 0.035, pacmanHealthRange: [60, 120], pacmanTotalLimit: 18, bossImpAfter: 4, specialBlockChance: 0.55, initialPacman: true, minWidth: 180 },
  { id: 10, maxSpawn: 13, targetScore: 25000000, description: "Level 10: The swarm is real. Keep merging!", timeLimit: 120, pacmanFrequency: 0.04, pacmanHealthRange: [80, 150], pacmanTotalLimit: 20, bossImpAfter: 4, specialBlockChance: 0.6, initialPacman: true, minWidth: 160 },
  { id: 11, maxSpawn: 14, targetScore: 50000000, description: "Level 11: Can you handle the pressure?", timeLimit: 120, pacmanFrequency: 0.045, pacmanHealthRange: [100, 180], pacmanTotalLimit: 22, bossImpAfter: 3, specialBlockChance: 0.65, initialPacman: true, minWidth: 140 },
  { id: 12, maxSpawn: 15, targetScore: 100000000, description: "Level 12: Halfway through the new levels!", timeLimit: 120, pacmanFrequency: 0.05, pacmanHealthRange: [120, 200], pacmanTotalLimit: 25, bossImpAfter: 3, specialBlockChance: 0.7, initialPacman: true, minWidth: 120 },
  { id: 13, maxSpawn: 16, targetScore: 250000000, description: "Level 13: Bomb damage is still 100, but Imps are massive.", timeLimit: 120, pacmanFrequency: 0.055, pacmanHealthRange: [150, 250], pacmanTotalLimit: 28, bossImpAfter: 2, specialBlockChance: 0.75, initialPacman: true, minWidth: 110 },
  { id: 14, maxSpawn: 17, targetScore: 500000000, description: "Level 14: Bomb damage increased to 200! You'll need it.", timeLimit: 120, pacmanFrequency: 0.06, pacmanHealthRange: [180, 300], pacmanTotalLimit: 30, bossImpAfter: 2, specialBlockChance: 0.8, initialPacman: true, minWidth: 100 },
  { id: 15, maxSpawn: 18, targetScore: 1000000000, description: "Level 15: One billion points target!", timeLimit: 120, pacmanFrequency: 0.065, pacmanHealthRange: [200, 350], pacmanTotalLimit: 32, bossImpAfter: 2, specialBlockChance: 0.85, initialPacman: true, minWidth: 90 },
  { id: 16, maxSpawn: 19, targetScore: 2500000000, description: "Level 16: The end is near. Or is it?", timeLimit: 120, pacmanFrequency: 0.07, pacmanHealthRange: [220, 400], pacmanTotalLimit: 35, bossImpAfter: 1, specialBlockChance: 0.9, initialPacman: true, minWidth: 80 },
  { id: 17, maxSpawn: 20, targetScore: 5000000000, description: "Level 17: Almost at the final level!", timeLimit: 120, pacmanFrequency: 0.075, pacmanHealthRange: [250, 450], pacmanTotalLimit: 38, bossImpAfter: 1, specialBlockChance: 0.95, initialPacman: true, minWidth: 70 },
  { id: 18, maxSpawn: 21, targetScore: 10000000000, description: "Level 18: THE FINAL CHALLENGE. 10 Billion points!", timeLimit: 120, pacmanFrequency: 0.08, pacmanHealthRange: [300, 500], pacmanTotalLimit: 40, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 60 },
  { id: 19, maxSpawn: 22, targetScore: 25000000000, description: "Level 19: The stakes are higher than ever!", timeLimit: 120, pacmanFrequency: 0.085, pacmanHealthRange: [350, 550], pacmanTotalLimit: 42, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 55 },
  { id: 20, maxSpawn: 23, targetScore: 50000000000, description: "Level 20: Halfway through the elite levels!", timeLimit: 120, pacmanFrequency: 0.09, pacmanHealthRange: [400, 600], pacmanTotalLimit: 45, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 50 },
  { id: 21, maxSpawn: 24, targetScore: 100000000000, description: "Level 21: 100 Billion points! Can you survive?", timeLimit: 120, pacmanFrequency: 0.095, pacmanHealthRange: [450, 650], pacmanTotalLimit: 48, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 45 },
  { id: 22, maxSpawn: 25, targetScore: 250000000000, description: "Level 22: Imps are becoming legendary.", timeLimit: 120, pacmanFrequency: 0.1, pacmanHealthRange: [500, 700], pacmanTotalLimit: 50, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 40 },
  { id: 23, maxSpawn: 26, targetScore: 500000000000, description: "Level 23: The void is calling.", timeLimit: 120, pacmanFrequency: 0.105, pacmanHealthRange: [550, 750], pacmanTotalLimit: 52, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 35 },
  { id: 24, maxSpawn: 27, targetScore: 1000000000000, description: "Level 24: ONE TRILLION POINTS. You are a god.", timeLimit: 120, pacmanFrequency: 0.11, pacmanHealthRange: [600, 800], pacmanTotalLimit: 55, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 30 },
  { id: 25, maxSpawn: 28, targetScore: 2500000000000, description: "Level 25: Reality is breaking.", timeLimit: 120, pacmanFrequency: 0.115, pacmanHealthRange: [650, 850], pacmanTotalLimit: 58, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 25 },
  { id: 26, maxSpawn: 29, targetScore: 5000000000000, description: "Level 26: Almost at the end of the universe.", timeLimit: 120, pacmanFrequency: 0.12, pacmanHealthRange: [700, 900], pacmanTotalLimit: 60, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 20 },
  { id: 27, maxSpawn: 30, targetScore: 10000000000000, description: "Level 27: 10 Trillion! The Imps are unstoppable.", timeLimit: 120, pacmanFrequency: 0.125, pacmanHealthRange: [750, 950], pacmanTotalLimit: 65, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 15 },
  { id: 28, maxSpawn: 31, targetScore: 25000000000000, description: "Level 28: THE TRUE FINAL CHALLENGE. 25 Trillion!", timeLimit: 120, pacmanFrequency: 0.13, pacmanHealthRange: [800, 1000], pacmanTotalLimit: 70, bossImpAfter: 1, specialBlockChance: 1.0, initialPacman: true, minWidth: 10 },
];

// --- Donut Background Component ---
const DonutBackground: React.FC<{ urgency: number }> = ({ urgency }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const urgencyRef = useRef(urgency);

  useEffect(() => {
    urgencyRef.current = urgency;
  }, [urgency]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width: number, height: number;
    let donuts: { x: number; y: number; baseRadius: number; phase: number }[] = [];
    const spacing = 80; 
    let mouse = { x: -1000, y: -1000 };

    const colors = {
      base: 'rgba(0, 100, 200, 0.1)',
      highlight: 'rgba(0, 255, 200, 0.2)',
      bg: '#030303'
    };

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initDonuts();
    };

    const initDonuts = () => {
      donuts = [];
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          donuts.push({
            x: i * spacing,
            y: j * spacing,
            baseRadius: 6,
            phase: (i + j) * 0.15
          });
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      mouse.x = touch.clientX;
      mouse.y = touch.clientY;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchstart', onTouchMove);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('resize', resize);
    resize();

    let animationId: number;
    const animate = () => {
      const currentUrgency = urgencyRef.current;
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);
      
      const timeSpeed = 0.0015 + (currentUrgency * 0.01);
      const nowTime = Date.now();
      const time = nowTime * timeSpeed;
      
      // Diagonal movement offset
      const moveSpeed = 0.02;
      const offsetX = (nowTime * moveSpeed) % spacing;
      const offsetY = (nowTime * moveSpeed * 0.7) % spacing;

      ctx.lineWidth = 2;
      donuts.forEach(d => {
        const waveAmp = 1.2 + (currentUrgency * 5);
        const wave = Math.sin(time + d.phase) * waveAmp;
        
        // Apply offset and wrap around
        let drawX = d.x + offsetX;
        let drawY = d.y + offsetY;
        if (drawX > width + spacing) drawX -= (width + spacing);
        if (drawY > height + spacing) drawY -= (height + spacing);

        const dx = mouse.x - drawX;
        const dy = mouse.y - drawY;
        const distSq = dx * dx + dy * dy;
        let interaction = 0;
        if (distSq < 14400) interaction = (120 - Math.sqrt(distSq)) / 15;

        const currentRadius = Math.max(0.1, d.baseRadius + wave + interaction);
        const opacityBase = 0.03 + (currentUrgency * 0.1);
        const opacity = opacityBase + (currentRadius / 100);

        ctx.beginPath();
        ctx.arc(drawX, drawY, currentRadius, 0, Math.PI * 2);
        
        if (interaction > 1 || currentUrgency > 0.7) {
          const r = currentUrgency > 0.8 ? 255 : 0;
          const g = currentUrgency > 0.8 ? 50 : 255;
          const b = currentUrgency > 0.8 ? 50 : 200;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 1.5})`;
        } else {
          ctx.strokeStyle = `rgba(0, 150, 255, ${opacity})`;
        }
        ctx.stroke();
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchstart', onTouchMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10" />;
};

// --- Audio Helper ---
let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioCtx;
};

const playSound = (type: 'collision' | 'merge' | 'drop' | 'win' | 'lose' | 'shake' | 'eat' | 'pacman_die' | 'special' | 'wall_hit' | 'block_hit' | 'pacman_move') => {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    switch (type) {
      case 'collision':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.2, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'merge':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.4, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'drop':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.1, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      case 'win':
        // Arpeggio for victory
        [440, 554, 659, 880, 1108].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + i * 0.1);
          g.gain.setValueAtTime(0.2, now + i * 0.1); // Louder
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.5);
          o.start(now + i * 0.1);
          o.stop(now + i * 0.1 + 0.5);
        });
        break;
      case 'lose':
        // Descending dissonant tones for game over
        [200, 150, 100, 80].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, now + i * 0.15);
          g.gain.setValueAtTime(0.2, now + i * 0.15); // Louder
          g.gain.linearRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
          o.start(now + i * 0.15);
          o.stop(now + i * 0.15 + 0.4);
        });
        break;
      case 'shake':
        osc.type = 'square';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.3);
        gain.gain.setValueAtTime(0.2, now); // Louder
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'eat':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.3, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'pacman_die':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
        gain.gain.setValueAtTime(0.4, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      case 'special':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
        gain.gain.setValueAtTime(0.3, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'wall_hit':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        gain.gain.setValueAtTime(0.1, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      case 'block_hit':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(250, now);
        gain.gain.setValueAtTime(0.1, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      case 'pacman_move':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.1);
        gain.gain.setValueAtTime(0.05, now); // Louder
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
    }
  } catch (e) {}
};

// --- Particle System ---
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

// --- Main Component ---

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  
  const [gameState, setGameState] = useState<GameState>('START');
  const [gameMode, setGameMode] = useState<GameMode>('LEVELS');
  const [isLoading, setIsLoading] = useState(true);
  const [currentLevelIdx, setCurrentLevelIdx] = useState(0);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  useEffect(() => { scoreRef.current = score; }, [score]);
  const [timeLeft, setTimeLeft] = useState(120);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [frenzyLevel, setFrenzyLevel] = useState(0); // 0 to 1
  const [milestonesReached, setMilestonesReached] = useState<number[]>([]);
  const [nextDrop, setNextDrop] = useState<{value: number, special: SpecialType}>({value: 1, special: 'NONE'});
  const [canDrop, setCanDrop] = useState(true);
  const [isShaking, setIsShaking] = useState(false);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [shakesUsedInLevel, setShakesUsedInLevel] = useState(0);
  const [showShakeNotify, setShowShakeNotify] = useState(false);
  const notifiedShakeRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(400);
  const containerWidthRef = useRef(400);
  const pacmenRef = useRef<Matter.Body[]>([]);
  const pacmenSpawnedRef = useRef(0);
  const wallsRef = useRef<Matter.Body[]>([]);

  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [gameResetCounter, setGameResetCounter] = useState(0);
  const [isDangerZone, setIsDangerZone] = useState(false);
  const [survivalMilestones, setSurvivalMilestones] = useState<number[]>([]);
  
  // Survival Mode Shop State
  const [bombsBought, setBombsBought] = useState(0);
  const [x2BombsBought, setX2BombsBought] = useState(0);
  const [clearsBought, setClearsBought] = useState(0);
  const [queuedSpecial, setQueuedSpecial] = useState<SpecialType>('NONE');

  const getItemCost = (base: number, count: number) => Math.floor(base * Math.pow(2, count));

  const buyItem = (type: SpecialType) => {
    if (gameState !== 'PLAYING' || gameMode !== 'SURVIVAL') return;
    
    let cost = 0;
    if (type === 'BOMB') {
      cost = getItemCost(1000, bombsBought);
      if (score >= cost) {
        setScore(prev => prev - cost);
        setBombsBought(prev => prev + 1);
        setQueuedSpecial('BOMB');
        playSound('special');
      }
    } else if (type === 'BOMB_X2') {
      cost = getItemCost(2000, x2BombsBought);
      if (score >= cost) {
        setScore(prev => prev - cost);
        setX2BombsBought(prev => prev + 1);
        setQueuedSpecial('BOMB_X2');
        playSound('special');
      }
    } else if (type === 'CLEAR_SCREEN') {
      cost = getItemCost(100000, clearsBought);
      if (score >= cost) {
        setScore(prev => prev - cost);
        setClearsBought(prev => prev + 1);
        
        if (engineRef.current) {
          const bodies = Matter.Composite.allBodies(engineRef.current.world);
          bodies.forEach(b => {
            if (b.label === 'number' || b.label === 'pacman') {
              const val = (b as any).value || 0;
              const spec = (b as any).special || 'NONE';
              Matter.Composite.remove(engineRef.current.world, b);
              createExplosion(b.position.x, b.position.y, b.label === 'pacman' ? '#FFD700' : getNeonColor(val, spec), 10);
            }
          });
          // Also clear the pacmenRef
          pacmenRef.current = [];
          playSound('pacman_die');
          triggerScreenShake(40);
        }
      }
    }
  };
  
  // --- Score Milestones for Extra Time ---
  useEffect(() => {
    if (gameState !== 'PLAYING' || gameMode === 'SURVIVAL') return;
    
    const milestones = [
      { score: 1000000, time: 5 },
      { score: 1500000, time: 10 },
      { score: 3000000, time: 15 },
      { score: 5000000, time: 20 },
      { score: 10000000, time: 25 }
    ];

    milestones.forEach(m => {
      if (score >= m.score && !milestonesReached.includes(m.score)) {
        setTimeLeft(prev => prev + m.time);
        setMilestonesReached(prev => [...prev, m.score]);
        // Visual feedback could be added here
      }
    });
  }, [score, milestonesReached, gameState, gameMode]);

  const triggerEarthquake = useCallback(() => {
    if (!engineRef.current) return;
    playSound('shake');
    triggerScreenShake(30);
    const bodies = Matter.Composite.allBodies(engineRef.current.world);
    bodies.forEach(b => {
      if (b.label === 'number') {
        const force = {
          x: (Math.random() - 0.5) * 0.5,
          y: -Math.random() * 0.5
        };
        Matter.Body.applyForce(b, b.position, force);
      }
    });
  }, []);

  const triggerSurvivalEvent = useCallback((type: 'EXPLOSION' | 'BOSS' | 'EARTHQUAKE') => {
    if (!engineRef.current) return;
    
    if (type === 'EXPLOSION') {
      playSound('special');
      triggerScreenShake(20);
      // Create a massive explosion in the center
      const bodies = Matter.Composite.allBodies(engineRef.current.world);
      bodies.forEach(b => {
        if (b.label === 'number') {
          const dist = Math.sqrt(Math.pow(b.position.x - 200, 2) + Math.pow(b.position.y - 300, 2));
          if (dist < 200) {
            const force = {
              x: (b.position.x - 200) * 0.005,
              y: (b.position.y - 300) * 0.005
            };
            Matter.Body.applyForce(b, b.position, force);
            if (Math.random() < 0.3) {
              Matter.Composite.remove(engineRef.current!.world, b);
              setScore(prev => prev + 5000);
            }
          }
        }
      });
    } else if (type === 'BOSS') {
      // Force next spawn to be a boss by setting a flag or just spawning one immediately
      playSound('win');
      const currentWidth = containerWidthRef.current;
      const x = Math.random() * (currentWidth - 100) + (200 - currentWidth/2 + 50);
      const y = -50;
      const health = (Math.floor(Math.random() * 200) + 100) * 8; // Extra big boss
      const pacman = Matter.Bodies.circle(x, y, 80, { // Even bigger
        label: 'pacman',
        isStatic: false,
        frictionAir: 0.02, 
        render: { visible: false }
      });
      (pacman as any).health = health;
      (pacman as any).initialHealth = health;
      (pacman as any).minHealth = 1;
      (pacman as any).isBoss = true;
      (pacman as any).lastEatTime = 0;
      (pacman as any).lastHitTime = 0;
      (pacman as any).targetId = null;
      (pacman as any).patrolDir = Math.random() > 0.5 ? 1 : -1;
      Matter.Composite.add(engineRef.current.world, pacman);
      pacmenRef.current.push(pacman);
    } else if (type === 'EARTHQUAKE') {
      triggerEarthquake();
    }
  }, [triggerEarthquake]);

  // Survival Mode Logic: Danger Zone & Milestones
  useEffect(() => {
    if (gameState !== 'PLAYING' || gameMode !== 'SURVIVAL') return;

    // Milestones in Survival
    const milestones = [100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000];
    milestones.forEach(m => {
      if (score >= m && !survivalMilestones.includes(m)) {
        setSurvivalMilestones(prev => [...prev, m]);
        const events: ('EXPLOSION' | 'BOSS' | 'EARTHQUAKE')[] = ['EXPLOSION', 'BOSS', 'EARTHQUAKE'];
        const event = events[Math.floor(Math.random() * events.length)];
        triggerSurvivalEvent(event);
      }
    });

    // Danger Zone logic: Randomly trigger every 45-90 seconds
    const triggerDangerZone = () => {
      setIsDangerZone(true);
      playSound('win'); // Use a distinct sound
      setTimeout(() => setIsDangerZone(false), 10000); // Lasts 10 seconds
    };

    const interval = setInterval(() => {
      if (Math.random() < 0.2) { // 20% chance every 10s to trigger if not already
        if (!isDangerZone) triggerDangerZone();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [score, survivalMilestones, gameState, gameMode, isDangerZone, triggerSurvivalEvent]);

  const playMusic = useCallback(() => {
    if (audioRef.current && !isMuted) {
      audioRef.current.play().catch(() => {
        // Still blocked by browser policy
      });
    }
  }, [isMuted]);

  // Loading timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      playMusic(); // Try to play when loading finishes
    }, 2500);
    return () => clearTimeout(timer);
  }, [playMusic]);

  // Music logic
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/data/music.mp3');
      audioRef.current.loop = true;
      audioRef.current.volume = 0.25;
      // Try to play as soon as it's ready
      audioRef.current.addEventListener('canplaythrough', playMusic, { once: true });
    }
    
    if (!isMuted) {
      playMusic();
      // Add listeners to catch first interaction if autoplay is blocked
      window.addEventListener('click', playMusic, { once: true });
      window.addEventListener('touchstart', playMusic, { once: true });
      window.addEventListener('keydown', playMusic, { once: true });
    } else {
      audioRef.current.pause();
    }

    return () => {
      window.removeEventListener('click', playMusic);
      window.removeEventListener('touchstart', playMusic);
      window.removeEventListener('keydown', playMusic);
    };
  }, [isMuted, playMusic]);

  const level = LEVELS[currentLevelIdx];
  const nextShakeCost = 200 * Math.pow(2, shakesUsedInLevel);
  const canShake = score >= nextShakeCost;

  const urgency = gameMode === 'SURVIVAL' 
    ? Math.min(1, frenzyLevel * 1.5 + (survivalTime / 1200)) // Base urgency from time + frenzy
    : Math.max(0, 1 - (timeLeft / level.timeLimit));

  // Timer logic
  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    
    const timer = setInterval(() => {
      if (gameMode === 'SURVIVAL') {
        // Increment survivalTime faster if frenzyLevel is high
        // Up to 5x speed at max frenzy
        const increment = 1 + Math.floor(frenzyLevel * 4);
        setSurvivalTime(prev => prev + increment);
        
        // Decay frenzyLevel
        setFrenzyLevel(prev => Math.max(0, prev - 0.05));
      } else {
        setTimeLeft(prev => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, gameMode, frenzyLevel]);

  // Handle Game Over / Level Complete in a stable way
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    if (gameMode === 'LEVELS') {
      if (timeLeft === 0) {
        setGameState('GAMEOVER');
        playSound('lose');
        if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      }

      if (score >= level.targetScore) {
        setGameState('LEVEL_COMPLETE');
        playSound('win');
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      }
    }
  }, [timeLeft, score, gameState, level.targetScore, gameMode]);

  const handleShake = useCallback(() => {
    if (!canShake || isShaking || !engineRef.current) return;
    
    // In Survival mode, shaking costs more and is restricted
    if (gameMode === 'SURVIVAL') {
      if (score < nextShakeCost * 5) return; // Much higher cost barrier for survival
    }

    setShakesUsedInLevel(prev => prev + 1);
    setScore(prev => Math.max(0, prev - nextShakeCost)); // Subtract points
    playSound('shake');
    triggerScreenShake(15); // Lighter screen shake

    const bodies = Matter.Composite.allBodies(engineRef.current.world);
    bodies.forEach(b => {
      if (b.label === 'number') {
        const force = {
          x: (Math.random() - 0.5) * 0.2, // Lighter force
          y: -Math.random() * 0.2
        };
        Matter.Body.applyForce(b, b.position, force);
      }
    });
  }, [canShake, isShaking, nextShakeCost, gameMode, score]);

  // Shake Notification
  useEffect(() => {
    if (canShake && !notifiedShakeRef.current && gameState === 'PLAYING') {
      setShowShakeNotify(true);
      notifiedShakeRef.current = true;
      setTimeout(() => setShowShakeNotify(false), 3000);
    }
    if (!canShake) {
      notifiedShakeRef.current = false;
    }
  }, [canShake, gameState]);

  // Keyboard & Touch Shake Trigger
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && gameState === 'PLAYING') {
        e.preventDefault();
        handleShake();
      }
    };
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && gameState === 'PLAYING') {
        handleShake();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [handleShake, gameState]); // Re-bind when state changes to get fresh handleShake context

  const triggerScreenShake = (intensity: number) => {
    setShakeIntensity(intensity);
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
      setShakeIntensity(0);
    }, 300);
  };

  // Initialize Engine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 }
    });
    engineRef.current = engine;

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine: engine,
      options: {
        width: 400,
        height: 600,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 1, // Sharp rendering
      }
    });
    renderRef.current = render;

    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    // Walls
    const wallOptions = { 
      isStatic: true, 
      render: { fillStyle: '#111111' },
      friction: 0.05,
      restitution: 0.8
    };
    
    updateWalls(containerWidth);

    Matter.Render.run(render);
    Matter.Runner.run(runner, engine);

    // Pacman AI Logic in beforeUpdate for smooth movement
    const beforeUpdateListener = () => {
      if (gameState !== 'PLAYING') return;
      const now = Date.now();
      const bodies = Matter.Composite.allBodies(engine.world);
      const numbers = bodies.filter(b => b.label === 'number');
      const huntableNumbers = numbers.filter(b => (b as any).special !== 'NEGATIVE');

      // Black Bomb Timer Logic
      numbers.forEach(b => {
        if ((b as any).special === 'BLACK_BOMB') {
          (b as any).timer -= 1/60; // Assuming 60fps
          if ((b as any).timer <= 0) {
            // Penalty Explosion!
            const x = b.position.x;
            const y = b.position.y;
            const val = (b as any).value || 10;
            const penalty = val * 5000;
            
            // Use a timeout to avoid modifying world during update if possible
            // although beforeUpdate is usually safe.
            setScore(prev => Math.max(0, prev - penalty));
            
            // Spawn fewer small blocks to avoid physics overload
            for (let i = 0; i < 5; i++) {
              const spawnX = x + (Math.random() - 0.5) * 60;
              const spawnY = y + (Math.random() - 0.5) * 60;
              spawnNumber(spawnX, spawnY, Math.floor(Math.random() * 3) + 1);
            }
            
            createMegaExplosion(x, y, '#000000');
            playSound('pacman_die');
            triggerScreenShake(30);
            Matter.Composite.remove(engine.world, b);
          }
        }
      });

      pacmenRef.current.forEach(p => {
        const lastEatTime = (p as any).lastEatTime || 0;
        const lastHitTime = (p as any).lastHitTime || 0;
        const isStunned = now - Math.max(lastEatTime, lastHitTime) < 2000;

        if (isStunned) {
          Matter.Body.setVelocity(p, { x: 0, y: 0 }); 
          return;
        }

        // Speed multiplier for Survival mode
        const speedMult = gameMode === 'SURVIVAL' ? 1.5 + (survivalTime / 600) : 1.0;

        if (p.position.y < 500) {
          // Descend towards bottom
          Matter.Body.applyForce(p, p.position, { x: 0, y: 0.0002 * speedMult }); 
          
          // Hunt if something is close - Optimized: use pre-filtered huntableNumbers
          const target = huntableNumbers.find(n => Matter.Vector.magnitude(Matter.Vector.sub(p.position, n.position)) < 150);
          if (target) {
            const dir = Matter.Vector.normalise(Matter.Vector.sub(target.position, p.position));
            Matter.Body.applyForce(p, p.position, Matter.Vector.mult(dir, 0.0004 * speedMult)); 
          }

          // Retreat from NEGATIVE blocks
          const nearbyNegative = numbers.find(n => 
            (n as any).special === 'NEGATIVE' && 
            Matter.Vector.magnitude(Matter.Vector.sub(p.position, n.position)) < 100
          );
          if (nearbyNegative) {
            // Reverse direction and move away
            const dir = Matter.Vector.normalise(Matter.Vector.sub(p.position, nearbyNegative.position));
            Matter.Body.applyForce(p, p.position, Matter.Vector.mult(dir, 0.001 * speedMult));
            (p as any).patrolDir = p.position.x > nearbyNegative.position.x ? 1 : -1;
          }
        } else {
          // Patrol left/right at bottom
          const direction = (p as any).patrolDir || 1;
          Matter.Body.applyForce(p, p.position, { x: 0.0008 * direction * speedMult, y: 0 }); // Much slower patrol
          
          const currentWidth = containerWidthRef.current;
          const halfWidth = currentWidth / 2;
          const leftBound = 200 - halfWidth + 40;
          const rightBound = 200 + halfWidth - 40;
          
          if (p.position.x > rightBound) (p as any).patrolDir = -1;
          if (p.position.x < leftBound) (p as any).patrolDir = 1;

          // Occasionally jump to eat something slightly higher
          if (Math.random() < 0.005) {
            Matter.Body.applyForce(p, p.position, { x: 0, y: -0.01 * speedMult }); // Much slower jump
          }
        }

        if (Math.random() < 0.005) playSound('pacman_move');
      });
    };
    Matter.Events.on(engine, 'beforeUpdate', beforeUpdateListener);

    // Collision Events
    Matter.Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        
        // Sound for wall hits
        if (bodyA.isStatic || bodyB.isStatic) {
          playSound('wall_hit');
        } else if (bodyA.label === 'number' && bodyB.label === 'number') {
          playSound('block_hit');
        }

        // Pacman Collision
        const isPacmanA = bodyA.label === 'pacman';
        const isPacmanB = bodyB.label === 'pacman';
        const isNumberA = bodyA.label === 'number';
        const isNumberB = bodyB.label === 'number';

        if ((isPacmanA && isNumberB) || (isPacmanB && isNumberA)) {
          const pacman = isPacmanA ? bodyA : bodyB;
          const number = isPacmanA ? bodyB : bodyA;
          const numVal = (number as any).value;
          const isBoss = (pacman as any).isBoss;
          const pacHealth = (pacman as any).health;
          const minHealth = (pacman as any).minHealth || 1;
          const special = (number as any).special as SpecialType;

          // Bomb explodes on contact with IMP
          if (special === 'BOMB' || special === 'BOMB_X2') {
            const bombX = number.position.x;
            const bombY = number.position.y;
            const isX2 = special === 'BOMB_X2';
            
            // Damage the IMP
            const currentHealth = (pacman as any).health;
            const baseDamage = getBombDamage();
            const bombDamage = isBoss ? baseDamage * 3 : baseDamage;
            if (currentHealth <= bombDamage) {
              // IMP Dies
              Matter.Composite.remove(engine.world, [pacman, number]);
              pacmenRef.current = pacmenRef.current.filter(p => p.id !== pacman.id);
              createExplosion(pacman.position.x, pacman.position.y, isBoss ? '#FF00FF' : '#FFFF00', isBoss ? 40 : 15);
              
              const initialH = (pacman as any).initialHealth || currentHealth;
              const rewardMult = isBoss ? 50 : 10;
              let reward = initialH * rewardMult;
              
              // Bonus points
              if (isBoss) reward += 500000;
              else if (initialH >= 600) reward += 50000;
              else if (initialH >= 500) reward += 30000;
              else if (initialH >= 400) reward += 10000;
              
              // Level 7+: Min 50,000 points per pacman
              const minReward = (level.id >= 7 || gameMode === 'SURVIVAL') ? 50000 : 5000;
              reward = Math.max(minReward, reward);
              setScore(prev => prev + reward);
              playSound('pacman_die');
              triggerScreenShake(isBoss ? 40 : 20);
            } else {
              (pacman as any).health -= bombDamage;
              (pacman as any).lastHitTime = Date.now();
              Matter.Composite.remove(engine.world, number);
              createExplosion(pacman.position.x, pacman.position.y, isBoss ? '#FF00FF' : '#FFFF00', 5);
            }
            
            // Bomb explosion logic (nearby blocks)
            const nearby = Matter.Composite.allBodies(engine.world).filter(b => 
              b.label === 'number' && 
              Matter.Vector.magnitude(Matter.Vector.sub(b.position, { x: bombX, y: bombY })) < 120
            );
            nearby.forEach(b => {
              const bVal = (b as any).value;
              const bSpec = (b as any).special as SpecialType;
              let bPoints = Math.pow(2, Math.min(bVal, 15)) * 50;
              
              // Level 7+: Bomb explosion gives 20,000 per block
              if (level.id >= 7 || gameMode === 'SURVIVAL') bPoints = 20000;

              const finalPoints = isX2 ? bPoints * 2 : bPoints;
              
              if (bSpec === 'NEGATIVE') {
                setScore(prev => Math.max(0, prev - finalPoints));
              } else {
                setScore(prev => prev + finalPoints);
              }

              Matter.Composite.remove(engine.world, b);
              createExplosion(b.position.x, b.position.y, getNeonColor(bVal, bSpec), 5);
            });

            // Damage nearby IMPs
            const nearbyPacmen = Matter.Composite.allBodies(engine.world).filter(b => 
              b.label === 'pacman' && 
              b.id !== pacman.id && 
              Matter.Vector.magnitude(Matter.Vector.sub(b.position, { x: bombX, y: bombY })) < 120
            );
            const nearbyBaseDamage = getBombDamage();
            nearbyPacmen.forEach(p => {
              const pHealth = (p as any).health;
              const pBoss = (p as any).isBoss;
              const pDamage = pBoss ? nearbyBaseDamage * 3 : nearbyBaseDamage;
              if (pHealth <= pDamage) {
                Matter.Composite.remove(engine.world, p);
                pacmenRef.current = pacmenRef.current.filter(pac => pac.id !== p.id);
                createExplosion(p.position.x, p.position.y, '#FFFF00', 15);
                
                const initialH = (p as any).initialHealth || pHealth;
                const rewardMult = pBoss ? 50 : 10;
                let reward = initialH * rewardMult;
                
                // Bonus points
                if (pBoss) reward += 500000;
                else if (initialH >= 600) reward += 50000;
                else if (initialH >= 500) reward += 30000;
                else if (initialH >= 400) reward += 10000;
                
                const minReward = (level.id >= 7 || gameMode === 'SURVIVAL') ? 50000 : 5000;
                reward = Math.max(minReward, reward);
                setScore(prev => prev + reward);
              } else {
                (p as any).health -= pDamage;
                (p as any).lastHitTime = Date.now();
                createExplosion(p.position.x, p.position.y, '#FFFF00', 5);
              }
            });
            
            createSpecialExplosion(bombX, bombY, isX2 ? '#FFAA00' : '#FF0000', 40);
            triggerScreenShake(20);
            return;
          }

          // Check if hit from top and value matches
          const isAbove = number.position.y < pacman.position.y - 20;
          
          if (numVal === pacHealth) {
            // Pacman dies (Exact hit)
            Matter.Composite.remove(engine.world, [pacman, number]);
            pacmenRef.current = pacmenRef.current.filter(p => p.id !== pacman.id);
            createExplosion(pacman.position.x, pacman.position.y, isBoss ? '#FF00FF' : '#FFFF00', isBoss ? 40 : 15);
            
            const initialH = (pacman as any).initialHealth || pacHealth;
            const rewardMult = isBoss ? 50 : 10;
            let reward = initialH * rewardMult;
            
            // Bonus points
            if (isBoss) reward += 500000;
            else if (initialH >= 600) reward += 50000;
            else if (initialH >= 500) reward += 30000;
            else if (initialH >= 400) reward += 10000;
            
            reward = Math.max(5000, reward);
            setScore(prev => prev + reward);
            playSound('pacman_die');
            triggerScreenShake(isBoss ? 40 : 20);
          } else {
            // Pacman eats number or gets hit
            if (isAbove) {
              // Hit from top but value doesn't match
              (pacman as any).lastHitTime = Date.now();
              playSound('block_hit');
              triggerScreenShake(5);
              
              // Health reduction: 100% of block value (200% for Boss), down to minHealth
              const reductionMult = isBoss ? 2 : 1;
              (pacman as any).health = Math.max(minHealth, pacHealth - (numVal * reductionMult));
            } else {
              // Pacman eats number
              if (special === 'NEGATIVE') {
                // Pacman doesn't eat NEGATIVE blocks, it just bounces off
                (pacman as any).lastHitTime = Date.now();
                (pacman as any).patrolDir *= -1; // Reverse direction
                return;
              }

              Matter.Composite.remove(engine.world, number);
              createExplosion(number.position.x, number.position.y, getNeonColor(numVal, special), 5);
              playSound('eat');
              
              // Penalty: subtract points equivalent to what player gets x100
              setScore(prev => Math.max(0, prev - numVal * 1000));
              
              // User gets time if IMP eats time item
              if (special === 'TIME_2') setTimeLeft(prev => prev + 2);
              if (special === 'TIME_5') setTimeLeft(prev => prev + 5);
              
              // Health reduction: 200% of block value (400% for Boss), down to minHealth
              const reductionMult = isBoss ? 4.0 : 2.0;
              const reduction = Math.floor(numVal * reductionMult);
              (pacman as any).health = Math.max(minHealth, pacHealth - reduction);
              
              (pacman as any).lastEatTime = Date.now();
              (pacman as any).targetId = null;
            }
          }
          return;
        }

        if (isNumberA && isNumberB && bodyA.id !== bodyB.id) {
          const valA = (bodyA as any).value;
          const valB = (bodyB as any).value;
          const specA = (bodyA as any).special as SpecialType;
          const specB = (bodyB as any).special as SpecialType;

          // Check for NEGATIVE block being hit by a normal block
          if ((specA === 'NEGATIVE' && specB === 'NONE') || (specB === 'NEGATIVE' && specA === 'NONE')) {
            const negative = specA === 'NEGATIVE' ? bodyA : bodyB;
            const normal = specA === 'NEGATIVE' ? bodyB : bodyA;
            
            const damage = (normal as any).value;
            (negative as any).health -= damage;
            
            Matter.Composite.remove(engine.world, normal);
            createExplosion(normal.position.x, normal.position.y, getNeonColor((normal as any).value), 5);
            playSound('block_hit');
            
            if ((negative as any).health <= 0) {
              Matter.Composite.remove(engine.world, negative);
              createExplosion(negative.position.x, negative.position.y, '#000000', 15);
              playSound('pacman_die');
              // Reward for destroying negative block
              setScore(prev => prev + (negative as any).value * 1000);
            }
            return;
          }

          if (valA === valB) {
              const newX = (bodyA.position.x + bodyB.position.x) / 2;
              const newY = (bodyA.position.y + bodyB.position.y) / 2;
              const newValue = valA + 1;
              const isNegative = specA === 'NEGATIVE' || specB === 'NEGATIVE';

              // Trigger specials
              if (specA !== 'NONE' || specB !== 'NONE') {
              if (specA === 'BOMB' && specB === 'BOMB') {
                // MEGA BOMB EXPLOSION
                const nearby = Matter.Composite.allBodies(engine.world).filter(b => 
                  b.label === 'number' && 
                  Matter.Vector.magnitude(Matter.Vector.sub(b.position, { x: newX, y: newY })) < 250
                );
                nearby.forEach(b => {
                  Matter.Composite.remove(engine.world, b);
                  createExplosion(b.position.x, b.position.y, getNeonColor((b as any).value), 8);
                });

                const nearbyPacmen = Matter.Composite.allBodies(engine.world).filter(b => 
                  b.label === 'pacman' && 
                  Matter.Vector.magnitude(Matter.Vector.sub(b.position, { x: newX, y: newY })) < 250
                );
                nearbyPacmen.forEach(p => {
                  const pHealth = (p as any).health;
                  const pBoss = (p as any).isBoss;
                  if (pHealth <= 150) { // Mega bomb kills even stronger imps
                    Matter.Composite.remove(engine.world, p);
                    pacmenRef.current = pacmenRef.current.filter(pac => pac.id !== p.id);
                    createExplosion(p.position.x, p.position.y, '#FFFF00', 25);
                    
                    const initialH = (p as any).initialHealth || pHealth;
                    const rewardMult = pBoss ? 50 : 10;
                    let reward = initialH * rewardMult;
                    
                    // Bonus points
                    if (pBoss) reward += 500000;
                    else if (initialH >= 600) reward += 50000;
                    else if (initialH >= 500) reward += 30000;
                    else if (initialH >= 400) reward += 10000;
                    
                    reward = Math.max(5000, reward);
                    setScore(prev => prev + reward);
                  } else {
                    (p as any).health -= 150;
                    (p as any).lastHitTime = Date.now();
                    createExplosion(p.position.x, p.position.y, '#FFFF00', 15);
                  }
                });

                createMegaExplosion(newX, newY, '#FF4400');
                triggerScreenShake(40);
                playSound('pacman_die');
              } else {
                const type = specA !== 'NONE' ? specA : specB;
                if (type === 'TIME_2') {
                  setTimeLeft(prev => prev + 2);
                  createSpecialExplosion(newX, newY, '#00FF00');
                }
                if (type === 'TIME_5') {
                  setTimeLeft(prev => prev + 5);
                  createSpecialExplosion(newX, newY, '#00FFFF');
                }
                if (type === 'BOMB' || type === 'BOMB_X2') {
                  const isX2 = type === 'BOMB_X2';
                  const nearby = Matter.Composite.allBodies(engine.world).filter(b => 
                    b.label === 'number' && 
                    Matter.Vector.magnitude(Matter.Vector.sub(b.position, { x: newX, y: newY })) < 120
                  );
                  nearby.forEach(b => {
                    const bVal = (b as any).value;
                    const bPoints = Math.pow(2, Math.min(bVal, 15)) * 50;
                    const finalPoints = isX2 ? bPoints * 2 : bPoints;
                    setScore(prev => prev + finalPoints);
                    Matter.Composite.remove(engine.world, b);
                    createExplosion(b.position.x, b.position.y, getNeonColor(bVal), 5);
                  });

                  // Damage nearby IMPs
                  const nearbyPacmen = Matter.Composite.allBodies(engine.world).filter(b => 
                    b.label === 'pacman' && 
                    Matter.Vector.magnitude(Matter.Vector.sub(b.position, { x: newX, y: newY })) < 120
                  );
                  const baseDamage = getBombDamage();
                  nearbyPacmen.forEach(p => {
                    const pHealth = (p as any).health;
                    const pBoss = (p as any).isBoss;
                    const damage = pBoss ? baseDamage * 3 : baseDamage;
                    if (pHealth <= damage) {
                      Matter.Composite.remove(engine.world, p);
                      pacmenRef.current = pacmenRef.current.filter(pac => pac.id !== p.id);
                      createExplosion(p.position.x, p.position.y, '#FFFF00', 15);
                      
                      const initialH = (p as any).initialHealth || pHealth;
                      const rewardMult = pBoss ? 50 : 10;
                      let reward = initialH * rewardMult;
                      
                      // Bonus points
                      if (pBoss) reward += 500000;
                      else if (initialH >= 600) reward += 50000;
                      else if (initialH >= 500) reward += 30000;
                      else if (initialH >= 400) reward += 10000;
                      
                      reward = Math.max(5000, reward);
                      setScore(prev => prev + reward);
                    } else {
                      (p as any).health -= damage;
                      (p as any).lastHitTime = Date.now();
                      createExplosion(p.position.x, p.position.y, '#FFFF00', 5);
                    }
                  });

                  createSpecialExplosion(newX, newY, isX2 ? '#FFAA00' : '#FF0000', 40);
                  triggerScreenShake(15);
                  playSound('pacman_die');
                }
              }
              playSound('special');
            }

            Matter.Composite.remove(engine.world, [bodyA, bodyB]);
            spawnNumber(newX, newY, newValue);
            
            // Explosion Effect
            createExplosion(newX, newY, getNeonColor(newValue), newValue);
            
            // Shockwave based on size - Stronger shock for larger merges
            // Reduced intensity for small blocks, only strong for large ones
            const shakeVal = newValue > 5 ? Math.min(newValue * 0.8, 25) : 2;
            triggerScreenShake(shakeVal);
            
            const mergePoints = Math.pow(2, Math.min(newValue, 15)) * 50;
            if (isNegative) {
              setScore(prev => Math.max(0, prev - mergePoints * 2));
            } else {
              setScore(prev => prev + mergePoints);
            }
            playSound('merge');
          } else {
            playSound('collision');
          }
        }
      });
    });

    // Custom drawing for numbers and particles
    const afterRenderListener = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !engineRef.current) return;

      // Danger Zone Visual
      if (isDangerZone) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(0, 0, 400, 600);
        
        // Red border pulse
        const pulse = Math.sin(Date.now() / 200) * 0.5 + 0.5;
        ctx.strokeStyle = `rgba(255, 0, 0, ${0.3 + pulse * 0.4})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, 390, 590);
        ctx.restore();
      }
      
      // Update and Draw Particles
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      if (particlesRef.current.length > 400) {
        particlesRef.current = particlesRef.current.slice(-400);
      }
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      const bodies = Matter.Composite.allBodies(engineRef.current.world);
      bodies.forEach(b => {
        if (b.label === 'pacman') {
          const health = (b as any).health;
          const isBoss = (b as any).isBoss;
          const size = isBoss ? 60 : 35;
          ctx.save();
          ctx.translate(b.position.x, b.position.y);
          
          // Mouth faces direction of movement
          const angle = Math.atan2(b.velocity.y, b.velocity.x);
          ctx.rotate(angle);
          
          // Draw Pacman
          const isHit = Date.now() - ((b as any).lastHitTime || 0) < 300;
          const minH = (b as any).minHealth || 1;
          const isMinHealth = health <= minH;
          const flash = isMinHealth && Math.floor(Date.now() / 100) % 2 === 0;
          
          const baseColor = isBoss ? '#A020F0' : '#FFFF00'; // Deeper purple for boss
          let drawColor = isHit ? '#FF0000' : baseColor;
          if (flash) drawColor = '#FFFFFF';
          
          ctx.fillStyle = drawColor;
          
          if (isBoss) {
            // Pulsing glow for boss
            const pulse = Math.sin(Date.now() * 0.01) * 15 + 25;
            ctx.shadowBlur = pulse;
            ctx.shadowColor = isHit ? '#FF0000' : (flash ? '#FFFFFF' : '#A020F0');
          } else {
            ctx.shadowBlur = 20;
            ctx.shadowColor = isHit ? '#FF0000' : (flash ? '#FFFFFF' : baseColor);
          }

          ctx.beginPath();
          const mouthOpen = Math.sin(Date.now() * 0.01) * 0.4 + 0.4;
          ctx.arc(0, 0, size, mouthOpen, Math.PI * 2 - mouthOpen);
          ctx.lineTo(0, 0);
          ctx.fill();

          // Warning text when at min health
          if (isMinHealth) {
            ctx.save();
            ctx.rotate(-angle);
            ctx.fillStyle = '#FF0000';
            ctx.font = 'black 18px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'white';
            ctx.fillText(`TARGET: ${health}`, 0, -size - 10);
            ctx.restore();
          }

          // Draw Eyes
          if (isBoss) {
            // Eye white
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(size * 0.3, -size * 0.4, size * 0.25, 0, Math.PI * 2);
            ctx.fill();
            // Pupil
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(size * 0.4, -size * 0.4, size * 0.12, 0, Math.PI * 2);
            ctx.fill();

            // Boss details: Spiky Crown
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(-size * 0.8, -size * 0.4);
            ctx.lineTo(-size * 1.0, -size * 1.0);
            ctx.lineTo(-size * 0.4, -size * 0.7);
            ctx.lineTo(0, -size * 1.2);
            ctx.lineTo(size * 0.4, -size * 0.7);
            ctx.lineTo(size * 1.0, -size * 1.0);
            ctx.lineTo(size * 0.8, -size * 0.4);
            ctx.stroke();

            // BOSS Text
            ctx.rotate(-angle); // Keep text upright
            ctx.fillStyle = 'white';
            ctx.font = 'black 14px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('BOSS', 0, -size - 25);
            ctx.rotate(angle); // Restore rotation
          }
          
          // Draw Health
          ctx.shadowBlur = 0;
          ctx.fillStyle = isBoss ? 'white' : 'black';
          ctx.font = `bold ${isBoss ? 24 : 16}px "Inter", sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(health.toString(), 0, isBoss ? 8 : 5);
          ctx.restore();
        }

        if (b.label === 'number') {
          const val = (b as any).value;
          const special = (b as any).special as SpecialType;
          const color = getNeonColor(val, special);
          const size = getBlockSize(val, level.id, gameMode, survivalTime);
          ctx.save();
          ctx.translate(b.position.x, b.position.y);
          ctx.rotate(b.angle);
          
          // Neon Glow Shadow
          ctx.shadowBlur = special === 'NEGATIVE' ? 5 : 15; 
          ctx.shadowColor = special === 'NEGATIVE' ? '#333333' : color;
          
          // Draw circle
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();

          if (special === 'NEGATIVE') {
            // Draw a subtle pattern or border for negative blocks
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          
          // Inner Shadow for depth
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255,255,255,0.4)'; 
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw number - High contrast with stroke for clarity
          const text = val.toString();
          ctx.fillStyle = val % 10 > 5 ? 'white' : '#000000';
          
          // Dynamic font size based on digits
          const fontSizeScale = text.length > 2 ? 0.6 : text.length > 1 ? 0.8 : 1.1;
          ctx.font = `900 ${size * fontSizeScale}px "Inter", sans-serif`; 
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Outer stroke for maximum contrast
          ctx.strokeStyle = val % 10 > 5 ? 'black' : 'white';
          ctx.lineWidth = text.length > 2 ? 1 : 2;
          ctx.strokeText(text, 0, 0);
          
          // Sharp text shadow for clarity
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(text, 0, 0);

          // Draw Special Icon - Enhanced Visuals
          const spec = (b as any).special as SpecialType;
          if (spec !== 'NONE') {
            ctx.save();
            // Position badge at the top right of the circle
            ctx.translate(size * 0.5, -size * 0.5);
            
            // Badge background
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            
            if (spec === 'BOMB') {
              ctx.fillStyle = '#FF0000';
              ctx.shadowColor = '#FF0000';
            } else {
              ctx.fillStyle = '#00FF00';
              ctx.shadowColor = '#00FF00';
            }
            
            ctx.shadowBlur = 15;
            ctx.fill();
            
            // Badge border
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Icon text/graphics
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            if (spec === 'BOMB' || spec === 'BOMB_X2' || spec === 'BLACK_BOMB' || spec === 'NEGATIVE') {
              // Draw a more detailed bomb or negative icon
              if (spec === 'BLACK_BOMB' || spec === 'NEGATIVE') {
                ctx.fillStyle = '#000000';
              } else {
                ctx.fillStyle = spec === 'BOMB_X2' ? '#FFA500' : 'black';
              }
              
              ctx.beginPath();
              ctx.arc(0, 2, 8, 0, Math.PI * 2);
              ctx.fill();

              if (spec === 'NEGATIVE') {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px "Inter", sans-serif';
                ctx.fillText((b as any).health?.toString() || '💀', 0, 2);
              } else if (spec === 'BOMB' || spec === 'BOMB_X2' || spec === 'BLACK_BOMB') {
                // Fuse
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -6);
                ctx.quadraticCurveTo(5, -10, 8, -8);
                ctx.stroke();
                // Spark
                ctx.fillStyle = '#FFFF00';
                ctx.beginPath();
                ctx.arc(8, -8, 3, 0, Math.PI * 2);
                ctx.fill();
                
                if (spec === 'BOMB_X2') {
                  ctx.fillStyle = 'white';
                  ctx.font = 'bold 10px "Inter", sans-serif';
                  ctx.fillText('X2', 0, 2);
                } else if (spec === 'BLACK_BOMB') {
                  const timer = (b as any).timer || 0;
                  ctx.fillStyle = timer < 3 ? '#FF0000' : 'white';
                  ctx.font = 'bold 10px "Inter", sans-serif';
                  ctx.fillText(Math.ceil(timer).toString(), 0, 2);
                }
              }
            } else {
              // Draw Time Icon
              ctx.font = 'black 12px "Inter", sans-serif';
              const timeText = spec === 'TIME_2' ? '+2s' : '+5s';
              ctx.fillText(timeText, 0, 0);
            }
            
            ctx.restore();

            // Add an extra glow ring around the whole block if it's special
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, size + 3, 0, Math.PI * 2);
            ctx.strokeStyle = (spec === 'BOMB' || spec === 'BOMB_X2') ? 'rgba(255,0,0,0.8)' : 'rgba(0,255,0,0.8)';
            if (spec === 'BOMB_X2') ctx.strokeStyle = 'rgba(255,165,0,0.9)'; // Orange for X2
            ctx.lineWidth = 4;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -Date.now() * 0.05;
            ctx.stroke();
            ctx.restore();
          }

          ctx.restore();
        }
      });
    };
    Matter.Events.on(render, 'afterRender', afterRenderListener);

    // Game Over Check Loop
    const checkInterval = setInterval(() => {
      if (gameState !== 'PLAYING' || !engineRef.current) return;
      
      const bodies = Matter.Composite.allBodies(engine.world);
      const overflow = bodies.some(b => b.label === 'number' && b.position.y < 90 && !b.isStatic && Math.abs(b.velocity.y) < 0.05);
      
      if (overflow || (gameMode === 'SURVIVAL' && survivalTime > 5 && score <= 0)) {
        setGameState('GAMEOVER');
        playSound('lose');
        if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
      }

        // Spawn Pacman logic
        const totalLimit = gameMode === 'SURVIVAL' ? Infinity : (level.pacmanTotalLimit || 0);
        const canSpawnMore = totalLimit > 0 && (gameMode === 'SURVIVAL' || pacmenSpawnedRef.current < totalLimit);
        
        let spawnChance = level.pacmanFrequency;
        if (gameMode === 'SURVIVAL') {
          // Increase frequency over time: starts at 0.01, grows to 0.1 over 10 mins
          // Frenzy multiplier: up to 5x faster spawn at max frenzy
          const baseChance = 0.01 + (survivalTime / 600) * 0.09;
          spawnChance = Math.min(0.5, baseChance * (1 + frenzyLevel * 4));
          
          // Danger Zone: Double spawn chance
          if (isDangerZone) spawnChance *= 2;
        }

        if ((spawnChance > 0 && Math.random() < spawnChance && canSpawnMore) || 
            (level.initialPacman && pacmenRef.current.length === 0 && pacmenSpawnedRef.current === 0 && totalLimit > 0)) {
          
          // Only one Pacman at a time in Levels, but more in Survival
          // Max Pacmen increases with frenzy: up to 10 at max frenzy
          let maxPacmen = gameMode === 'SURVIVAL' 
            ? Math.min(10, (1 + Math.floor(survivalTime / 120)) + Math.floor(frenzyLevel * 5)) 
            : 1;
          if (isDangerZone) maxPacmen += 2; // More pacmen in danger zone
          
          if (pacmenRef.current.length < maxPacmen) {
            const currentWidth = containerWidthRef.current;
            const x = Math.random() * (currentWidth - 100) + (200 - currentWidth/2 + 50);
            const y = -50; // Spawn from top
            
            // Boss logic: 1st boss after 3 regular (4th spawn), then every 5 regular (10th, 16th, etc.)
            const spawnIdx = pacmenSpawnedRef.current;
            let isBoss = false;
            
            if (gameMode === 'SURVIVAL') {
              // Boss chance increases over time and with frenzy
              // Up to 80% boss chance at max frenzy
              const baseBossChance = 0.05 + (survivalTime / 600) * 0.45;
              const bossChance = Math.min(0.8, baseBossChance + (frenzyLevel * 0.3));
              isBoss = Math.random() < bossChance;
            } else {
              if (spawnIdx === 3) {
                isBoss = true;
              } else if (spawnIdx > 3) {
                isBoss = (spawnIdx - 3) % 6 === 0;
              }
            }
            
            const healthMult = isBoss ? 5 : 1;
            let hRange = level.pacmanHealthRange;
            if (gameMode === 'SURVIVAL') {
              // Scale health over time
              const hMin = 50 + Math.floor(survivalTime / 10);
              const hMax = 150 + Math.floor(survivalTime / 5);
              hRange = [hMin, hMax];
            }

            const health = (Math.floor(Math.random() * (hRange[1] - hRange[0])) + hRange[0]) * healthMult;
            const minHealth = Math.floor(Math.random() * 6) + 1;
          
          const pacmanSize = isBoss ? 60 : 35;
          const pacman = Matter.Bodies.circle(x, y, pacmanSize, {
            label: 'pacman',
            isStatic: false,
            isSensor: false,
            frictionAir: 0.02, 
            render: { visible: false }
          });
          (pacman as any).health = health;
          (pacman as any).initialHealth = health;
          (pacman as any).minHealth = minHealth;
          (pacman as any).isBoss = isBoss;
          (pacman as any).lastEatTime = 0;
          (pacman as any).lastHitTime = 0;
          (pacman as any).targetId = null;
          (pacman as any).patrolDir = Math.random() > 0.5 ? 1 : -1;
          Matter.Composite.add(engine.world, pacman);
          pacmenRef.current.push(pacman);
          pacmenSpawnedRef.current += 1;
        }
      }

      // Dynamic Container Width logic
      const maxVal = bodies.reduce((max, b) => b.label === 'number' ? Math.max(max, (b as any).value) : max, 0);
      let targetWidth = level.minWidth ? Math.min(400, level.minWidth + maxVal * 5) : 400;
      
      if (gameMode === 'SURVIVAL') {
        // Narrow as score increases: starts at 400, narrows to 200 at 10M score
        const scoreNarrowing = Math.min(200, (scoreRef.current / 10000000) * 200);
        
        // Frenzy Tiers: 5 levels of narrowing
        // Tier 0: 0px, Tier 1: 30px, Tier 2: 60px, Tier 3: 90px, Tier 4: 120px
        const frenzyTier = Math.min(4, Math.floor(frenzyLevel * 5));
        const frenzyNarrowing = frenzyTier * 30;
        
        targetWidth = Math.max(150, 400 - scoreNarrowing - frenzyNarrowing);
      }

      // Danger Zone: Rapidly narrow container
      if (isDangerZone) {
        targetWidth = Math.max(150, targetWidth - 100);
      }

      if (Math.abs(containerWidthRef.current - targetWidth) > 5) {
        setContainerWidth(targetWidth);
        containerWidthRef.current = targetWidth;
      }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      Matter.Events.off(render, 'afterRender', afterRenderListener);
      Matter.Events.off(engine, 'beforeUpdate', beforeUpdateListener);
      pacmenRef.current = []; // Clear pacmen on cleanup
      pacmenSpawnedRef.current = 0;
    };
  }, [gameState, currentLevelIdx, level.targetScore]); // Removed containerWidth from dependencies

  const updateWalls = (width: number) => {
    if (!engineRef.current) return;
    
    // Remove old walls
    if (wallsRef.current.length > 0) {
      Matter.Composite.remove(engineRef.current.world, wallsRef.current);
    }

    const wallOptions = { 
      isStatic: true, 
      render: { fillStyle: '#111111' },
      friction: 0.05,
      restitution: 0.8
    };

    const centerX = 200;
    const halfWidth = width / 2;

    const ground = Matter.Bodies.rectangle(centerX, 610, width + 10, 20, wallOptions);
    const leftWall = Matter.Bodies.rectangle(centerX - halfWidth - 10, 300, 20, 600, wallOptions);
    const rightWall = Matter.Bodies.rectangle(centerX + halfWidth + 10, 300, 20, 600, wallOptions);
    
    wallsRef.current = [ground, leftWall, rightWall];
    Matter.Composite.add(engineRef.current.world, wallsRef.current);
  };

  useEffect(() => {
    updateWalls(containerWidth);
  }, [containerWidth]);

  const createExplosion = (x: number, y: number, color: string, value: number) => {
    const count = value * 8; // More particles
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * value + 3;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color,
        size: Math.random() * 4 + 1
      });
    }
  };

  const createSpecialExplosion = (x: number, y: number, color: string, count: number = 30) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.5,
        color,
        size: Math.random() * 6 + 2
      });
    }
  };

  const createMegaExplosion = (x: number, y: number, color: string) => {
    // Huge particle burst
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 15 + 5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2.0,
        color: i % 2 === 0 ? color : '#FFFFFF',
        size: Math.random() * 8 + 3
      });
    }
    // Shockwave rings
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        for (let j = 0; j < 50; j++) {
          const angle = (j / 50) * Math.PI * 2;
          const speed = 10 + i * 5;
          particlesRef.current.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: '#FFCC00',
            size: 4
          });
        }
      }, i * 100);
    }
  };

  const getBombDamage = useCallback(() => {
    if (level.id >= 14) return 200;
    if (level.id >= 9) return 100;
    return 50;
  }, [level.id]);

  const generateNextDrop = useCallback((maxSpawn: number, specialChance: number) => {
    const value = Math.floor(Math.random() * maxSpawn) + 1;
    let special: SpecialType = 'NONE';
    
    // In Survival mode, items must be bought, they don't drop randomly
    if (gameMode === 'SURVIVAL') {
      return { value, special: 'NONE' };
    }

    // Level 5+: Items can appear on any block randomly
    // Below Level 5: Only on blocks 1-3
    const canHaveItem = level.id >= 5 ? true : value <= 3;
    
    if (canHaveItem && Math.random() < specialChance) {
      // Reduced time items frequency: Bombs are much more common
      const types: SpecialType[] = ['BOMB', 'BOMB', 'BOMB', 'BOMB', 'BOMB', 'TIME_2'];
      
      // Level 7+: Add TIME_5 and NEGATIVE
      if (level.id >= 7 || gameMode === 'SURVIVAL') {
        types.push('TIME_5', 'NEGATIVE', 'NEGATIVE');
      }

      // Survival mode: Add BLACK_BOMB
      if (gameMode === 'SURVIVAL') {
        types.push('BLACK_BOMB', 'BLACK_BOMB');
      }

      if (level.id >= 4 || gameMode === 'SURVIVAL') {
        types.push('BOMB_X2', 'BOMB_X2', 'BOMB_X2', 'BOMB_X2', 'BOMB_X2');
      }
      special = types[Math.floor(Math.random() * types.length)];
    }
    return { value, special };
  }, [level.id, gameMode]);

  const spawnNumber = (x: number, y: number, value: number, special: SpecialType = 'NONE') => {
    if (!engineRef.current) return;
    const radius = getBlockSize(value, level.id);
    
    const body = Matter.Bodies.circle(x, y, radius, {
      label: 'number',
      restitution: 0.6,
      friction: 0.05,
      render: { visible: false } // We draw manually
    });
    (body as any).value = value;
    (body as any).special = special;
    
    if (special === 'NEGATIVE') {
      (body as any).health = value;
      (body as any).initialHealth = value;
    }
    
    if (special === 'BLACK_BOMB') {
      (body as any).timer = 10.0; // 10 seconds to detonate
      (body as any).maxTimer = 10.0;
      (body as any).value = Math.max(value, 10); // Higher value for black bombs
    }
    
    Matter.Composite.add(engineRef.current.world, body);
  };

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING' || !canDrop) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const radius = getBlockSize(nextDrop.value, level.id);
    
    const halfWidth = containerWidth / 2;
    const clampedX = Math.max(200 - halfWidth + radius + 5, Math.min(200 + halfWidth - radius - 5, x));
    
    // Apply queued special if in Survival mode
    const finalSpecial = gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special;
    
    spawnNumber(clampedX, 50, nextDrop.value, finalSpecial);
    playSound('drop');
    setScore(prev => prev + nextDrop.value * 10);
    setCanDrop(false);
    
    if (gameMode === 'SURVIVAL') {
      setQueuedSpecial('NONE');
      // Increase frenzyLevel on drop
      setFrenzyLevel(prev => Math.min(1, prev + 0.15));
    }

    setTimeout(() => {
      setCanDrop(true);
      setNextDrop(generateNextDrop(level.maxSpawn, level.specialBlockChance));
    }, 800);
  };

  const resetLevel = () => {
    if (!engineRef.current || !runnerRef.current) return;
    Matter.Composite.clear(engineRef.current.world, false);
    Matter.Runner.run(runnerRef.current, engineRef.current); // Restart runner
    pacmenRef.current = [];
    pacmenSpawnedRef.current = 0;
    wallsRef.current = [];
    setContainerWidth(level.minWidth || 400);
    containerWidthRef.current = level.minWidth || 400;
    updateWalls(level.minWidth || 400);
    setScore(gameMode === 'SURVIVAL' ? 5000 : 0);
    setSurvivalTime(0);
    setFrenzyLevel(0);
    setSurvivalMilestones([]);
    setBombsBought(0);
    setX2BombsBought(0);
    setClearsBought(0);
    setQueuedSpecial('NONE');
    setTimeLeft(level.timeLimit);
    setShakesUsedInLevel(0);
    setGameState('PLAYING');
    setNextDrop(generateNextDrop(level.maxSpawn, level.specialBlockChance));
    setGameResetCounter(prev => prev + 1);
  };

  const replayFromStart = () => {
    setCurrentLevelIdx(0);
    resetLevel();
    setGameState('START');
    setNextDrop(generateNextDrop(LEVELS[0].maxSpawn, LEVELS[0].specialBlockChance));
  };

  const takeScreenshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `number-buster-score-${score}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  const nextLevel = () => {
    if (currentLevelIdx < LEVELS.length - 1) {
      const nextIdx = currentLevelIdx + 1;
      setCurrentLevelIdx(nextIdx);
      setGameState('START');
      setScore(0);
      setTimeLeft(LEVELS[nextIdx].timeLimit);
      setShakesUsedInLevel(0);
      setBombsBought(0);
      setX2BombsBought(0);
      setClearsBought(0);
      setQueuedSpecial('NONE');
      setNextDrop(generateNextDrop(LEVELS[nextIdx].maxSpawn, LEVELS[nextIdx].specialBlockChance));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 font-sans overflow-hidden select-none relative">
      <DonutBackground key={`bg-${currentLevelIdx}-${gameResetCounter}`} urgency={urgency} />

      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 180, 360],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-24 h-24 border-4 border-cyan-500 border-t-transparent rounded-full mb-8 shadow-[0_0_30px_rgba(0,255,255,0.5)]"
            />
            <h1 className="text-4xl font-black text-white tracking-widest italic animate-pulse">
              LOADING...
            </h1>
            <p className="text-cyan-400 mt-4 font-black uppercase tracking-[0.3em] text-xs">
              SUDY GAME STUDIO
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute Button */}
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="fixed top-4 left-4 z-50 p-3 bg-black/50 border border-white/20 rounded-full text-white hover:bg-white/20 transition-colors"
      >
        {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
      </button>

      {/* Header UI */}
      <div className="w-full max-w-[400px] flex justify-between items-center mb-4 bg-black/60 backdrop-blur-xl p-4 rounded-2xl border border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Score</span>
          <span className="text-3xl font-black text-white tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">{score.toLocaleString()}</span>
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {gameMode === 'SURVIVAL' ? 'Survival Time' : 'Time'}
          </span>
          <span className={`text-3xl font-black tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] ${gameMode === 'LEVELS' && timeLeft < 20 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {gameMode === 'SURVIVAL' 
              ? `${Math.floor(survivalTime / 60)}:${(survivalTime % 60).toString().padStart(2, '0')}`
              : `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`
            }
          </span>
        </div>

        <div className="text-right flex flex-col">
          {gameMode === 'LEVELS' ? (
            <>
              <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Lvl {level.id} Target</span>
              <span className="text-2xl font-black text-cyan-300 tabular-nums drop-shadow-[0_0_15px_rgba(0,255,255,0.4)]">{level.targetScore.toLocaleString()}</span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Rhythm Tier {Math.min(4, Math.floor(frenzyLevel * 5)) + 1}</span>
              <div className="w-24 h-2 bg-black/40 rounded-full overflow-hidden border border-white/10 mt-1">
                <motion.div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-fuchsia-500"
                  animate={{ width: `${frenzyLevel * 100}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>
              <div className="flex justify-between w-24 px-0.5 mt-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={`w-1 h-1 rounded-full ${Math.min(4, Math.floor(frenzyLevel * 5)) + 1 >= i ? 'bg-white' : 'bg-white/20'}`} />
                ))}
              </div>
              <span className="text-[10px] font-bold text-white/60 uppercase mt-1">x{(1 + frenzyLevel * 4).toFixed(1)} Speed</span>
            </>
          )}
        </div>
      </div>

      {/* Game Container */}
      <motion.div 
        ref={containerRef}
        animate={isShaking ? {
          x: [0, -shakeIntensity, shakeIntensity, -shakeIntensity, shakeIntensity, 0],
          y: [0, shakeIntensity, -shakeIntensity, shakeIntensity, -shakeIntensity, 0],
        } : {}}
        transition={{ duration: 0.3 }}
        className="relative w-[400px] h-[600px] bg-black/70 rounded-3xl shadow-[0_0_60px_rgba(0,180,255,0.3)] border-4 border-cyan-500/60 overflow-hidden cursor-crosshair touch-none"
        onMouseDown={handleCanvasClick}
      >
        {/* Dynamic Walls Visual */}
        <div 
          className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-cyan-900/20 border-x-2 border-cyan-500/30 transition-all duration-500"
          style={{ width: `${containerWidth}px`, height: '100%' }}
        />
        {/* Next Number Preview */}
        {gameState === 'PLAYING' && canDrop && (
          <motion.div 
            initial={{ scale: 0, y: -20 }}
            animate={{ scale: 1, y: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center"
          >
            <div className="relative">
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black shadow-[0_0_20px_rgba(255,255,255,0.6)] border-2 border-white text-2xl"
                style={{ backgroundColor: getNeonColor(nextDrop.value, gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) }}
              >
                {nextDrop.value}
              </div>
              {(gameMode === 'SURVIVAL' ? queuedSpecial !== 'NONE' : nextDrop.special !== 'NONE') && (
                <div 
                  className={`absolute -top-2 -right-2 w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black shadow-lg ${
                    ((gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'BOMB' || (gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'BOMB_X2') ? 'bg-red-600' : ((gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'NEGATIVE' ? 'bg-black' : 'bg-green-600')
                  }`}
                >
                  {(gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'BOMB' ? '💣' : (gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'BOMB_X2' ? 'X2' : (gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'TIME_2' ? '+2s' : (gameMode === 'SURVIVAL' ? queuedSpecial : nextDrop.special) === 'TIME_5' ? '+5s' : '💀'}
                </div>
              )}
            </div>
            <p className="text-[10px] font-black text-white mt-1 uppercase tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">Next Drop</p>
          </motion.div>
        )}

        {/* Danger Line */}
        <div className="absolute top-[90px] left-0 w-full h-[2px] bg-red-500/40 border-t border-dashed border-red-500/60 z-0" />

        {/* Danger Zone Overlay */}
        <AnimatePresence>
          {isDangerZone && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center"
            >
              <motion.div 
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="bg-red-600/20 w-full h-full absolute inset-0"
              />
              <motion.h2 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="text-6xl font-black text-red-500 italic tracking-tighter drop-shadow-[0_0_30px_rgba(255,0,0,0.8)] z-30"
              >
                DANGER ZONE
              </motion.h2>
              <p className="text-white font-black uppercase tracking-[0.5em] text-xs mt-2 z-30 drop-shadow-lg">Container Narrowing!</p>
            </motion.div>
          )}
        </AnimatePresence>

        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Shake Ready Notification */}
        <AnimatePresence>
          {showShakeNotify && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            >
              <div className="bg-yellow-400 text-black px-6 py-2 rounded-full font-black text-sm shadow-[0_0_30px_rgba(255,255,0,0.6)] border-2 border-white animate-bounce">
                SHAKE READY! (SPACE / 2-FINGER)
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl z-20 flex flex-col items-center justify-center p-8 text-center"
            >
              <Trophy className="w-20 h-20 text-yellow-400 mb-4 drop-shadow-[0_0_20px_rgba(255,255,0,0.6)]" />
              <h1 className="text-4xl font-black text-white mb-2 tracking-tighter drop-shadow-lg uppercase italic">Number Buster</h1>
              <p className="text-cyan-400 mb-8 font-black text-xs tracking-[0.3em] uppercase">Sudy Game Studio</p>
              
              <div className="flex flex-col gap-4 w-full max-w-[300px]">
                <button 
                  onClick={() => {
                    setGameMode('LEVELS');
                    setGameState('PLAYING');
                    playMusic();
                  }}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black px-8 py-4 rounded-2xl font-black text-2xl flex items-center justify-center gap-4 transition-all active:scale-95 shadow-[0_0_40px_rgba(0,255,255,0.4)]"
                >
                  <Play className="fill-current w-8 h-8" /> LEVELS
                </button>
                
                <button 
                  onClick={() => {
                    setGameMode('SURVIVAL');
                    setGameState('PLAYING');
                    setSurvivalTime(0);
                    playMusic();
                  }}
                  className="bg-fuchsia-500 hover:bg-fuchsia-400 text-black px-8 py-4 rounded-2xl font-black text-2xl flex items-center justify-center gap-4 transition-all active:scale-95 shadow-[0_0_40px_rgba(255,0,255,0.4)]"
                >
                  <Zap className="fill-current w-8 h-8" /> SURVIVAL
                </button>
              </div>

              <div className="mt-8 text-white/60 text-xs font-black uppercase tracking-widest">
                {gameMode === 'LEVELS' ? `Next: Level ${level.id}` : 'Survival Mode: No Time Limit'}
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-red-950/95 backdrop-blur-2xl z-20 flex flex-col items-center justify-center p-4 text-center text-white"
            >
              <AlertCircle className="w-16 h-16 mb-2 text-red-500 drop-shadow-[0_0_20px_rgba(255,0,0,0.7)]" />
              <h2 className="text-4xl font-black mb-1 tracking-tighter drop-shadow-lg uppercase">
                {gameMode === 'SURVIVAL' ? 'Survival Ended' : (timeLeft === 0 ? "TIME'S UP!" : "OVERFLOW!")}
              </h2>
              <p className="text-xl mb-4 text-red-200 font-black drop-shadow-md uppercase">
                {gameMode === 'SURVIVAL' ? 'The container is full!' : (timeLeft === 0 ? "You ran out of time!" : "The container is full!")}
              </p>
              <div className="bg-white/10 p-6 rounded-3xl mb-6 w-full border border-white/20 backdrop-blur-xl">
                <p className="text-[10px] uppercase font-black text-red-300 tracking-widest mb-1">Final Score</p>
                <p className="text-5xl font-black tabular-nums drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]">{score.toLocaleString()}</p>
                {gameMode === 'SURVIVAL' && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-[10px] uppercase font-black text-cyan-300 tracking-widest mb-1">Survival Time</p>
                    <p className="text-3xl font-black tabular-nums text-cyan-400 drop-shadow-[0_0_20px_rgba(0,255,255,0.4)]">
                      {Math.floor(survivalTime / 60)}:{(survivalTime % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={resetLevel}
                  className="flex-1 bg-white text-red-600 px-6 py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all active:scale-95 shadow-xl"
                >
                  <RefreshCw size={20} /> RETRY
                </button>
                <button 
                  onClick={replayFromStart}
                  className="flex-1 bg-red-600 text-white px-6 py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-2 hover:bg-red-500 transition-all active:scale-95 shadow-xl"
                >
                  <RotateCcw size={20} /> REPLAY
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'LEVEL_COMPLETE' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 bg-cyan-950/95 backdrop-blur-2xl z-20 flex flex-col items-center justify-center p-4 text-center text-white"
            >
              <Trophy className="w-20 h-20 text-yellow-400 mb-4 animate-bounce drop-shadow-[0_0_30px_rgba(255,255,0,0.7)]" />
              <h2 className="text-4xl font-black mb-1 tracking-tighter drop-shadow-lg">VICTORY!</h2>
              <p className="text-xl mb-6 text-cyan-200 font-black drop-shadow-md">Target reached!</p>
              
              {currentLevelIdx < LEVELS.length - 1 ? (
                <button 
                  onClick={nextLevel}
                  className="bg-white text-cyan-600 px-10 py-5 rounded-2xl font-black text-2xl flex items-center gap-3 hover:bg-gray-100 transition-all active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.4)]"
                >
                  NEXT LEVEL <ChevronRight className="w-8 h-8" />
                </button>
              ) : (
                <div className="flex flex-col gap-6">
                  <p className="text-3xl font-black text-yellow-400 drop-shadow-lg">ULTIMATE MASTER!</p>
                  <button 
                    onClick={replayFromStart}
                    className="bg-white text-cyan-600 px-10 py-5 rounded-2xl font-black text-2xl flex items-center gap-3 shadow-2xl"
                  >
                    REPLAY ALL
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Survival Shop - Moved Outside */}
      {gameMode === 'SURVIVAL' && gameState === 'PLAYING' && (
        <div className="mt-4 w-full max-w-[400px] px-4 flex justify-center gap-2 z-30">
          <button 
            onClick={(e) => { e.stopPropagation(); buyItem('BOMB'); }}
            disabled={score < getItemCost(1000, bombsBought)}
            className="flex-1 bg-red-600/80 hover:bg-red-600 border-2 border-white/30 rounded-xl p-2 flex flex-col items-center transition-all disabled:opacity-50 disabled:grayscale"
          >
            <span className="text-2xl">💣</span>
            <span className="text-[10px] font-black text-white uppercase mt-1">{getItemCost(1000, bombsBought).toLocaleString()}</span>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); buyItem('BOMB_X2'); }}
            disabled={score < getItemCost(2000, x2BombsBought)}
            className="flex-1 bg-red-800/80 hover:bg-red-800 border-2 border-white/30 rounded-xl p-2 flex flex-col items-center transition-all disabled:opacity-50 disabled:grayscale"
          >
            <span className="text-2xl font-black text-white">X2</span>
            <span className="text-[10px] font-black text-white uppercase mt-1">{getItemCost(2000, x2BombsBought).toLocaleString()}</span>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); buyItem('CLEAR_SCREEN'); }}
            disabled={score < getItemCost(100000, clearsBought)}
            className="flex-1 bg-blue-600/80 hover:bg-blue-600 border-2 border-white/30 rounded-xl p-2 flex flex-col items-center transition-all disabled:opacity-50 disabled:grayscale"
          >
            <span className="text-2xl">✨</span>
            <span className="text-[10px] font-black text-white uppercase mt-1">{getItemCost(100000, clearsBought).toLocaleString()}</span>
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="w-full max-w-[400px] grid grid-cols-3 gap-4 mt-8">
        <button 
          onClick={handleShake}
          disabled={!canShake || isShaking}
          className={`relative p-5 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-2 font-black transition-all active:scale-95 border-b-8 ${
            canShake 
            ? 'bg-yellow-400 text-black border-yellow-700 hover:bg-yellow-300 shadow-[0_0_20px_rgba(255,255,0,0.3)]' 
            : 'bg-gray-800 text-gray-500 border-gray-900 opacity-50'
          }`}
        >
          <Zap className="w-8 h-8" />
          <span className="text-[10px] font-black uppercase tracking-tighter drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">SHAKE</span>
          <span className="text-[12px] font-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">{nextShakeCost.toLocaleString()}</span>
          {canShake && (
            <span className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] px-3 py-1 rounded-full animate-pulse shadow-lg font-black">
              READY
            </span>
          )}
        </button>
        <button 
          onClick={replayFromStart}
          className="bg-white/10 backdrop-blur-2xl p-5 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-2 font-black text-white hover:bg-white/20 transition-all active:scale-95 border-b-8 border-white/5"
        >
          <RotateCcw className="w-8 h-8" />
          <span className="text-[10px] font-black uppercase tracking-tighter drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">REPLAY</span>
          <span className="text-[12px] font-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">START</span>
        </button>
        <button 
          onClick={takeScreenshot}
          className="bg-white/10 backdrop-blur-2xl p-5 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-2 font-black text-white hover:bg-white/20 transition-all active:scale-95 border-b-8 border-white/5"
        >
          <Camera className="w-8 h-8" />
          <span className="text-[10px] font-black uppercase tracking-tighter drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">SNAP</span>
          <span className="text-[12px] font-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">SAVE</span>
        </button>
      </div>

      {/* Credits */}
      <div className="mt-10 text-center flex flex-col gap-2">
        <h1 className="text-4xl font-black text-white tracking-tighter italic drop-shadow-[0_0_15px_rgba(0,255,255,0.7)]">NUMBER BUSTER</h1>
        <p className="text-[12px] font-black text-white/50 uppercase tracking-[0.3em]">
          Tạo bởi <span className="text-cyan-400 drop-shadow-[0_0_5px_rgba(0,255,255,0.5)]">Trương Điền Duy - SUDY</span>
        </p>
      </div>

      <div className="mt-6 text-center text-white/30 text-[10px] max-w-[300px] font-black uppercase tracking-widest leading-relaxed">
        <p>Next Shake Milestone: {nextShakeCost.toLocaleString()} Points</p>
      </div>
    </div>
  );
}
