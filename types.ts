export type Position = {
  x: number;
  y: number;
};

export enum CapyState {
  IDLE = 'IDLE',
  WALKING = 'WALKING',
  SWIMMING = 'SWIMMING',
  EATING = 'EATING',
  SLEEPING = 'SLEEPING',
  MEDITATING = 'MEDITATING',
}

export type Stats = {
  hunger: number; // 0 (starving) to 100 (full)
  chill: number; // 0 (stressed) to 100 (zen)
  energy: number; // 0 (exhausted) to 100 (energetic)
};

export type FoodItem = {
  id: string;
  x: number;
  y: number;
  type: 'ORANGE' | 'WATERMELON';
};

export type Thought = {
  text: string;
  timestamp: number;
};
