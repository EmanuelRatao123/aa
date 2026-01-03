import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CapybaraSprite } from './components/CapybaraSprite';
import { World } from './components/World';
import { CapyState, Position, Stats, FoodItem, Thought } from './types';
import { generateCapybaraThought } from './services/geminiService';

const MOVEMENT_SPEED = 3; // pixels per tick
const TICK_RATE = 16; // ~60fps
const WATER_LEVEL_Y = window.innerHeight * 0.7; // Y position where water starts
const API_DEBOUNCE_MS = 5000;

export default function App() {
  // --- State ---
  const [pos, setPos] = useState<Position>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [capyState, setCapyState] = useState<CapyState>(CapyState.IDLE);
  const [stats, setStats] = useState<Stats>({ hunger: 80, chill: 50, energy: 90 });
  const [food, setFood] = useState<FoodItem[]>([]);
  const [thought, setThought] = useState<Thought | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Refs for loop management and inputs to avoid closure staleness
  const keysPressed = useRef<Set<string>>(new Set());
  const lastAiCallTime = useRef<number>(0);
  const gameLoopRef = useRef<number | null>(null);

  // --- Helpers ---
  
  const spawnFood = useCallback(() => {
    const id = Math.random().toString(36).substr(2, 9);
    const isWatermelon = Math.random() > 0.8;
    const padding = 50;
    const newFood: FoodItem = {
      id,
      x: Math.random() * (window.innerWidth - padding * 2) + padding,
      y: Math.random() * (WATER_LEVEL_Y - padding) + padding, // Mostly on land
      type: isWatermelon ? 'WATERMELON' : 'ORANGE',
    };
    setFood(prev => [...prev, newFood]);
  }, []);

  const triggerThought = useCallback(async (forcedState?: CapyState) => {
    const now = Date.now();
    if (now - lastAiCallTime.current < API_DEBOUNCE_MS && !forcedState) return;
    
    setIsAiLoading(true);
    lastAiCallTime.current = now;
    
    // Determine state for AI context
    const stateForAi = forcedState || capyState;

    const text = await generateCapybaraThought(stateForAi, stats);
    setThought({ text, timestamp: now });
    setIsAiLoading(false);
  }, [capyState, stats]);


  // --- Game Loop ---

  const updatePhysics = useCallback(() => {
    setPos(currentPos => {
      let newX = currentPos.x;
      let newY = currentPos.y;
      let isMoving = false;
      let newDirection = direction;

      // Movement Logic
      if (capyState !== CapyState.SLEEPING && capyState !== CapyState.MEDITATING && capyState !== CapyState.EATING) {
        if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('w')) newY -= MOVEMENT_SPEED;
        if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('s')) newY += MOVEMENT_SPEED;
        if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) {
            newX -= MOVEMENT_SPEED;
            newDirection = 'left';
            isMoving = true;
        }
        if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) {
            newX += MOVEMENT_SPEED;
            newDirection = 'right';
            isMoving = true;
        }
      }

      // Boundaries
      newX = Math.max(50, Math.min(window.innerWidth - 50, newX));
      newY = Math.max(50, Math.min(window.innerHeight - 50, newY));

      // Update Direction if changed
      setDirection(prev => prev !== newDirection ? newDirection : prev);

      // Determine State based on position and movement
      let nextState = capyState;
      const isInWater = newY > WATER_LEVEL_Y;

      // Only auto-update state if we aren't locked in an action
      if (capyState !== CapyState.SLEEPING && capyState !== CapyState.MEDITATING && capyState !== CapyState.EATING) {
        if (isInWater) {
          nextState = CapyState.SWIMMING;
        } else if (isMoving) {
          nextState = CapyState.WALKING;
        } else {
          nextState = CapyState.IDLE;
        }
      }

      // Check Food Collision
      setFood(currentFood => {
        const remainingFood = currentFood.filter(f => {
            const dx = f.x - newX;
            const dy = f.y - newY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 50) {
                // Eat!
                setCapyState(CapyState.EATING);
                setStats(s => ({ 
                    ...s, 
                    hunger: Math.min(100, s.hunger + (f.type === 'WATERMELON' ? 30 : 15)),
                    energy: Math.min(100, s.energy + 5)
                }));
                setTimeout(() => setCapyState(isInWater ? CapyState.SWIMMING : CapyState.IDLE), 1000);
                triggerThought(CapyState.EATING);
                return false; // Remove from list
            }
            return true;
        });
        return remainingFood;
      });

      if (nextState !== capyState) {
          setCapyState(nextState);
      }

      return { x: newX, y: newY };
    });
  }, [capyState, direction, triggerThought]);

  const updateStats = useCallback(() => {
     setStats(prev => {
         let { hunger, chill, energy } = prev;
         
         // Hunger Decay
         hunger = Math.max(0, hunger - 0.02);
         
         // Energy Logic
         if (capyState === CapyState.SLEEPING) energy = Math.min(100, energy + 0.1);
         else if (capyState === CapyState.WALKING || capyState === CapyState.SWIMMING) energy = Math.max(0, energy - 0.01);
         
         // Chill Logic
         if (capyState === CapyState.MEDITATING) chill = Math.min(100, chill + 0.1);
         if (capyState === CapyState.SWIMMING) chill = Math.min(100, chill + 0.05);
         if (hunger < 20) chill = Math.max(0, chill - 0.05);

         return { hunger, chill, energy };
     });
  }, [capyState]);

  // --- Effects ---

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.key);
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main Game Loop
  useEffect(() => {
    const loop = () => {
      updatePhysics();
      updateStats();
      gameLoopRef.current = requestAnimationFrame(loop);
    };
    gameLoopRef.current = requestAnimationFrame(loop);
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [updatePhysics, updateStats]);

  // Initial Food Spawn
  useEffect(() => {
    spawnFood();
    spawnFood();
    const interval = setInterval(spawnFood, 10000);
    return () => clearInterval(interval);
  }, [spawnFood]);


  // --- Actions ---

  const handleMeditate = () => {
      if (capyState === CapyState.MEDITATING) {
          setCapyState(CapyState.IDLE);
      } else {
          setCapyState(CapyState.MEDITATING);
          triggerThought(CapyState.MEDITATING);
      }
  };

  const handleSleep = () => {
    if (capyState === CapyState.SLEEPING) {
        setCapyState(CapyState.IDLE);
    } else {
        setCapyState(CapyState.SLEEPING);
    }
  };


  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      
      {/* Game World Layer */}
      <World width={window.innerWidth} height={window.innerHeight} food={food} />

      {/* Character Layer */}
      <div 
        className="absolute transition-transform will-change-transform z-10"
        style={{ 
            left: pos.x, 
            top: pos.y, 
            transform: 'translate(-50%, -50%)',
            zIndex: Math.floor(pos.y) // Simple Z-indexing based on Y
        }}
      >
        <CapybaraSprite state={capyState} direction={direction} />
        
        {/* Thought Bubble */}
        {thought && (Date.now() - thought.timestamp < 6000) && (
            <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 w-64 bg-white/90 p-3 rounded-2xl shadow-lg border-2 border-stone-200 animate-bounce-in">
                <p className="text-sm font-medium text-stone-700 text-center italic">
                    "{thought.text}"
                </p>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-b-2 border-r-2 border-stone-200"></div>
            </div>
        )}
      </div>

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-stone-200 shadow-sm w-64 z-50">
          <h1 className="text-lg font-bold text-stone-800 mb-2">Vida de Capivara</h1>
          
          <div className="space-y-2">
              <div>
                  <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                      <span>Fome</span>
                      <span>{Math.round(stats.hunger)}%</span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${stats.hunger}%` }}></div>
                  </div>
              </div>
              <div>
                  <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                      <span>Calma</span>
                      <span>{Math.round(stats.chill)}%</span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-400 transition-all duration-500" style={{ width: `${stats.chill}%` }}></div>
                  </div>
              </div>
              <div>
                  <div className="flex justify-between text-xs font-semibold text-stone-600 mb-1">
                      <span>Energia</span>
                      <span>{Math.round(stats.energy)}%</span>
                  </div>
                  <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 transition-all duration-500" style={{ width: `${stats.energy}%` }}></div>
                  </div>
              </div>
          </div>
          
          <div className="mt-4 text-xs text-stone-500">
             Use <kbd className="font-bold border px-1 rounded">WASD</kbd> para mover.
          </div>
      </div>

      {/* Action Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-50">
          <button 
            onClick={handleMeditate}
            disabled={isAiLoading || capyState === CapyState.SWIMMING || capyState === CapyState.SLEEPING}
            className={`px-6 py-3 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2
                ${capyState === CapyState.MEDITATING 
                    ? 'bg-purple-600 text-white ring-4 ring-purple-200' 
                    : 'bg-white text-stone-700 hover:bg-purple-50'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
              <span>🧘</span>
              {isAiLoading ? 'Pensando...' : capyState === CapyState.MEDITATING ? 'Acordar' : 'Meditar'}
          </button>

          <button 
            onClick={handleSleep}
            disabled={capyState === CapyState.SWIMMING || capyState === CapyState.MEDITATING}
            className={`px-6 py-3 rounded-full font-bold shadow-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2
                ${capyState === CapyState.SLEEPING 
                    ? 'bg-blue-600 text-white ring-4 ring-blue-200' 
                    : 'bg-white text-stone-700 hover:bg-blue-50'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
              <span>💤</span>
              {capyState === CapyState.SLEEPING ? 'Acordar' : 'Dormir'}
          </button>
      </div>

    </div>
  );
}