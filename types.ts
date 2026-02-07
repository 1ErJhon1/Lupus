
export enum Role {
  WEREWOLF = 'Lupo Mannaro',
  VILLAGER = 'Villico',
  SEER = 'Veggente',
  DOCTOR = 'Dottore',
  HUNTER = 'Cacciatore',
  AVENGER = 'Vendicatore',
  WITCH = 'Strega'
}

export enum Phase {
  LOBBY = 'LOBBY',
  SETUP_NAMES = 'SETUP_NAMES',
  SETUP_ROLES = 'SETUP_ROLES',
  ROLE_REVEAL = 'ROLE_REVEAL',
  NIGHT_START = 'NIGHT_START',
  NIGHT_TURN = 'NIGHT_TURN',
  DAY_NARRATION = 'DAY_NARRATION',
  DAY_DISCUSSION = 'DAY_DISCUSSION',
  DAY_VOTING = 'DAY_VOTING',
  AVENGER_REVENGE = 'AVENGER_REVENGE',
  GAME_OVER = 'GAME_OVER'
}

export enum GameMode {
  AI = 'AI',
  LOCAL = 'LOCAL'
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  isAlive: boolean;
  isAI: boolean;
  hasPoison?: boolean;
}

export interface GameState {
  players: Player[];
  currentPhase: Phase;
  dayCount: number;
  lastDeath?: string;
  history: string[];
  mode?: GameMode;
  revealIndex?: number;
  nightTurnIndex?: number;
  winner?: 'VILLAGERS' | 'WEREWOLVES';
  lastDoctorTargetId?: string | null;
  avengerMark?: string | null;
  nightActions: {
    werewolfVotes: Record<string, string>;
    doctorProtect: string | null;
    seerCheck: string | null;
    witchKill: string | null;
    avengerMark: string | null;
  };
}
