import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface PlayerState {
  userId: string;
  username: string;
  x: number;
  y: number;
  health: number;
  score: number;
  alive: boolean;
}

export interface GameState {
  matchId: string;
  tick: number;
  players: Map<string, PlayerState>;
  status: 'waiting' | 'active' | 'finished';
  startedAt: number;
  events: GameEvent[];
}

export interface GameEvent {
  tick: number;
  playerId: string;
  action: string;
  data: Record<string, any>;
  timestamp: number;
}

export type GameAction = 'move' | 'attack' | 'score_event';

interface MoveData {
  dx: number;
  dy: number;
}

interface AttackData {
  targetId: string;
}

const ARENA_SIZE = 1000;
const ATTACK_RANGE = 50;
const ATTACK_DAMAGE = 10;
const TICK_RATE_MS = 100;

export class GameSimulation {
  public state: GameState;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onTick: ((state: GameState) => void) | null = null;
  private onEnd: ((state: GameState) => void) | null = null;

  constructor(matchId: string, players: { userId: string; username: string }[]) {
    this.state = {
      matchId,
      tick: 0,
      players: new Map(),
      status: 'waiting',
      startedAt: Date.now(),
      events: [],
    };

    for (const p of players) {
      this.state.players.set(p.userId, {
        userId: p.userId,
        username: p.username,
        x: Math.floor(Math.random() * ARENA_SIZE),
        y: Math.floor(Math.random() * ARENA_SIZE),
        health: 100,
        score: 0,
        alive: true,
      });
    }
  }

  start(onTick: (state: GameState) => void, onEnd: (state: GameState) => void): void {
    this.state.status = 'active';
    this.onTick = onTick;
    this.onEnd = onEnd;

    this.tickInterval = setInterval(() => {
      this.state.tick++;
      this.checkGameEnd();
      if (this.onTick && this.state.status === 'active') {
        this.onTick(this.state);
      }
    }, TICK_RATE_MS);

    logger.info({ matchId: this.state.matchId }, 'Game simulation started');
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.state.status = 'finished';
  }

  processAction(playerId: string, action: GameAction, data: Record<string, any>): boolean {
    const player = this.state.players.get(playerId);
    if (!player || !player.alive || this.state.status !== 'active') return false;

    const event: GameEvent = {
      tick: this.state.tick,
      playerId,
      action,
      data,
      timestamp: Date.now(),
    };

    switch (action) {
      case 'move': {
        const moveData = data as MoveData;
        const dx = Math.max(-10, Math.min(10, moveData.dx || 0));
        const dy = Math.max(-10, Math.min(10, moveData.dy || 0));
        player.x = Math.max(0, Math.min(ARENA_SIZE, player.x + dx));
        player.y = Math.max(0, Math.min(ARENA_SIZE, player.y + dy));
        break;
      }
      case 'attack': {
        const attackData = data as AttackData;
        const target = this.state.players.get(attackData.targetId);
        if (!target || !target.alive) return false;

        const dist = Math.sqrt(
          Math.pow(player.x - target.x, 2) + Math.pow(player.y - target.y, 2)
        );

        if (dist <= ATTACK_RANGE) {
          target.health = Math.max(0, target.health - ATTACK_DAMAGE);
          player.score += ATTACK_DAMAGE;

          if (target.health <= 0) {
            target.alive = false;
            player.score += 100;
          }
        }
        break;
      }
      case 'score_event': {
        player.score += (data.points as number) || 10;
        break;
      }
      default:
        return false;
    }

    this.state.events.push(event);
    return true;
  }

  getSerializableState(): Record<string, any> {
    const players: Record<string, any> = {};
    for (const [id, p] of this.state.players) {
      players[id] = { ...p };
    }
    return {
      matchId: this.state.matchId,
      tick: this.state.tick,
      players,
      status: this.state.status,
    };
  }

  getWinner(): PlayerState | null {
    let best: PlayerState | null = null;
    for (const [, p] of this.state.players) {
      if (!best || p.score > best.score) best = p;
    }
    return best;
  }

  getLoser(): PlayerState | null {
    let worst: PlayerState | null = null;
    for (const [, p] of this.state.players) {
      if (!worst || p.score < worst.score) worst = p;
    }
    return worst;
  }

  private checkGameEnd(): void {
    const alivePlayers = [...this.state.players.values()].filter((p) => p.alive);

    // End if only one player alive or max ticks reached
    if (alivePlayers.length <= 1 || this.state.tick >= 600) {
      this.stop();
      if (this.onEnd) {
        this.onEnd(this.state);
      }
      logger.info({ matchId: this.state.matchId, tick: this.state.tick }, 'Game ended');
    }
  }
}
