import { Injectable, inject, signal, computed } from '@angular/core';
import { SoundService } from './sound.service';

export interface TileData {
  id: string;
  value: number;
  timer: number | null;
  maxTimer: number | null;
  row: number;
  col: number;
  isNew?: boolean;
  isMerged?: boolean;
}

export interface AbsorbedTile {
  id: string;
  targetRow: number;
  targetCol: number;
}

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private readonly sound = inject(SoundService);

  readonly gridSize = 4;
  private nextTileId = 1;

  // Constants per GDD/TDD specification
  readonly BASE_TIME_4 = 10;
  readonly IDLE_TIME_THRESHOLD = 3000; // 3 seconds of inactivity
  readonly STEP_SIZE = 0.05; // 50ms simulation substep
  readonly MAX_DELTA_TIME = 1.0; // 1s frame cap per GDD

  // Game state signals
  readonly grid = signal<(TileData | null)[][]>(
    Array(4).fill(null).map(() => Array(4).fill(null))
  );
  readonly score = signal<number>(0);
  readonly bestScore = signal<number>(0);
  readonly isGameOver = signal<boolean>(false);
  readonly isWon = signal<boolean>(false);
  readonly keepPlayingAfterWin = signal<boolean>(false);
  readonly isPaused = signal<boolean>(false);
  readonly isHelpOpen = signal<boolean>(false);
  readonly announcement = signal<string>('');
  readonly idleProgress = signal<number>(0); // 0 to 1 for inactivity gauge
  readonly activeTimerCount = computed(() => {
    let count = 0;
    const g = this.grid();
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = g[r][c];
        if (cell && cell.timer !== null && cell.timer > 0) {
          count++;
        }
      }
    }
    return count;
  });

  // Recent score floating increments
  readonly floatingScores = signal<{ id: number; value: number }[]>([]);
  private nextFloatId = 1;

  // Absorbed tiles animation tracking
  readonly absorbedTiles = signal<AbsorbedTile[]>([]);

  // Loop control
  private animFrameId: number | null = null;
  private lastFrameTime = 0;
  private lastMoveTime = 0;
  private pausedByVisibility = false;
  private pausedByHelp = false;

  constructor() {
    this.bestScore.set(this.loadBestScore());
  }

  loadBestScore(): number {
    if (typeof localStorage === 'undefined') return 0;
    try {
      const stored = localStorage.getItem('color2048_best');
      if (stored !== null) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER) {
          return Math.floor(parsed);
        }
      }
    } catch {
      // storage unavailable or blocked
    }
    return 0;
  }

  saveBestScore(val: number) {
    if (typeof localStorage === 'undefined') return;
    if (!Number.isFinite(val) || val < 0) return;
    try {
      localStorage.setItem('color2048_best', Math.floor(val).toString());
    } catch {
      // storage unavailable or blocked
    }
  }

  announce(msg: string) {
    this.announcement.set('');
    setTimeout(() => {
      this.announcement.set(msg);
    }, 40);
  }

  start() {
    this.stopGameLoop();
    this.nextTileId = 1;
    this.score.set(0);
    this.isGameOver.set(false);
    this.isWon.set(false);
    this.keepPlayingAfterWin.set(false);
    this.isPaused.set(false);
    this.isHelpOpen.set(false);
    this.pausedByVisibility = false;
    this.pausedByHelp = false;
    this.absorbedTiles.set([]);
    this.floatingScores.set([]);

    // Create empty 4x4 grid
    const initialGrid: (TileData | null)[][] = Array(this.gridSize)
      .fill(null)
      .map(() => Array(this.gridSize).fill(null));
    this.grid.set(initialGrid);

    // Initial 2 tiles spawn per GDD
    this.spawnTileInternal();
    this.spawnTileInternal();

    this.lastFrameTime = performance.now();
    this.lastMoveTime = performance.now();
    this.idleProgress.set(0);

    this.announce('Game started. Combine tiles and watch visual decay timers.');
    this.startGameLoop();
  }

  restart() {
    this.start();
  }

  keepPlaying() {
    this.keepPlayingAfterWin.set(true);
    this.announce('Continuing in endless mode.');
    this.lastFrameTime = performance.now();
    this.lastMoveTime = performance.now();
    this.startGameLoop();
  }

  togglePause() {
    if (this.isGameOver() || (this.isWon() && !this.keepPlayingAfterWin())) return;

    const paused = !this.isPaused();
    this.isPaused.set(paused);

    if (paused) {
      this.stopGameLoop();
      this.announce('Game paused. Timers frozen.');
    } else {
      this.lastFrameTime = performance.now();
      this.lastMoveTime = performance.now();
      this.startGameLoop();
      this.announce('Game resumed.');
    }
  }

  toggleHelp() {
    const open = !this.isHelpOpen();
    this.isHelpOpen.set(open);

    if (open) {
      if (!this.isPaused() && !this.isGameOver() && !(this.isWon() && !this.keepPlayingAfterWin())) {
        this.togglePause();
        this.pausedByHelp = true;
      }
    } else {
      if (this.pausedByHelp && this.isPaused()) {
        this.togglePause();
        this.pausedByHelp = false;
      }
    }
  }

  handleVisibilityChange(hidden: boolean) {
    if (hidden) {
      if (!this.isPaused() && !this.isGameOver() && !(this.isWon() && !this.keepPlayingAfterWin())) {
        this.isPaused.set(true);
        this.stopGameLoop();
        this.pausedByVisibility = true;
      }
    } else {
      if (this.pausedByVisibility && this.isPaused()) {
        this.isPaused.set(false);
        this.pausedByVisibility = false;
        this.lastFrameTime = performance.now();
        this.lastMoveTime = performance.now();
        this.startGameLoop();
      }
    }
  }

  private startGameLoop() {
    if (this.animFrameId !== null) return;
    this.lastFrameTime = performance.now();
    const loop = (timestamp: number) => {
      this.gameStep(timestamp);
      if (!this.isPaused() && !this.isGameOver() && !(this.isWon() && !this.keepPlayingAfterWin())) {
        this.animFrameId = requestAnimationFrame(loop);
      } else {
        this.animFrameId = null;
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopGameLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  getBaseMaxTimerForValue(val: number): number | null {
    if (val < 4) return null;
    const n = Math.log2(val) - 2;
    const factor = Math.pow(Math.SQRT2, n);
    return Math.round(this.BASE_TIME_4 * factor);
  }

  private gameStep(timestamp: number) {
    if (this.isPaused() || this.isGameOver() || (this.isWon() && !this.keepPlayingAfterWin())) {
      return;
    }

    const rawDtSeconds = (timestamp - this.lastFrameTime) / 1000;
    // Cap at 1.0 second per GDD specification
    const dtSeconds = Math.min(Math.max(0, rawDtSeconds), this.MAX_DELTA_TIME);
    this.lastFrameTime = timestamp;

    let halvedCount = 0;
    const currentGrid = this.grid();
    let updated = false;

    // Decay timers
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = currentGrid[r][c];
        if (cell && cell.timer !== null) {
          cell.timer -= dtSeconds;
          if (cell.timer <= 0) {
            const overdue = -cell.timer;
            this.halveTileChain(cell, overdue);
            halvedCount++;
            updated = true;
          }
        }
      }
    }

    if (halvedCount > 0) {
      this.sound.playDecayHalve();
      this.announce(`Timer expired! ${halvedCount} tile(s) halved in value.`);
    }

    // Inactivity idle penalty check (3 seconds rule)
    const idleElapsed = timestamp - this.lastMoveTime;
    const progress = Math.min(1, Math.max(0, idleElapsed / this.IDLE_TIME_THRESHOLD));
    this.idleProgress.set(progress);

    if (idleElapsed >= this.IDLE_TIME_THRESHOLD) {
      // Reset lastMoveTime first per GDD, preventing infinite loops on full board
      this.lastMoveTime = timestamp;
      this.idleProgress.set(0);

      if (this.hasEmptyCell()) {
        const spawned = this.spawnTileInternal();
        if (spawned) {
          updated = true;
          this.sound.playIdleSpawn();
          this.announce('Inactivity penalty! A new tile spawned due to 3 seconds of idle time.');
        }
      }
    }

    if (updated) {
      this.grid.set(this.cloneGrid(currentGrid));
    }

    // Check game over
    if (this.checkGameOver()) {
      this.stopGameLoop();
    }
  }

  private halveTileChain(cell: TileData, initialOverdue: number) {
    let overdue = Number.isFinite(initialOverdue) ? initialOverdue : 0;

    while (cell && cell.timer !== null) {
      const oldValue = cell.value;
      const newValue = oldValue / 2;
      cell.value = newValue;

      if (newValue >= 4) {
        const baseCap = this.getBaseMaxTimerForValue(newValue)!;
        cell.maxTimer = baseCap;
        const decayTime = Math.min(baseCap, baseCap * 0.60);

        if (overdue >= decayTime) {
          overdue -= decayTime;
          continue;
        } else {
          cell.timer = Math.max(0.1, decayTime - overdue);
          break;
        }
      } else {
        // Value fell below 4 (e.g. became 2)
        cell.timer = null;
        cell.maxTimer = null;
        break;
      }
    }
  }

  private hasEmptyCell(): boolean {
    const g = this.grid();
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (g[r][c] === null) return true;
      }
    }
    return false;
  }

  private spawnTileInternal(): boolean {
    const g = this.grid();
    const emptyCells: { r: number; c: number }[] = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (g[r][c] === null) {
          emptyCells.push({ r, c });
        }
      }
    }

    if (emptyCells.length === 0) return false;

    const target = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    // 90% chance of 2, 10% chance of 4
    const val = Math.random() < 0.9 ? 2 : 4;
    const baseCap4 = this.getBaseMaxTimerForValue(4);

    const newTile: TileData = {
      id: `tile_${this.nextTileId++}`,
      value: val,
      timer: val === 4 ? baseCap4 : null,
      maxTimer: val === 4 ? baseCap4 : null,
      row: target.r,
      col: target.c,
      isNew: true
    };

    g[target.r][target.c] = newTile;
    this.grid.set(this.cloneGrid(g));
    return true;
  }

  hasActiveTimers(): boolean {
    const g = this.grid();
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = g[r][c];
        if (cell && cell.timer !== null && cell.timer > 0) {
          return true;
        }
      }
    }
    return false;
  }

  canMove(): boolean {
    const g = this.grid();
    if (this.hasEmptyCell()) return true;

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const currentVal = g[r][c]!.value;
        if (c < 3 && g[r][c + 1]!.value === currentVal) return true;
        if (r < 3 && g[r + 1][c]!.value === currentVal) return true;
      }
    }
    return false;
  }

  checkGameOver(): boolean {
    // Game over is only declared when no valid moves AND no tiles with active countdowns!
    if (!this.canMove() && !this.hasActiveTimers()) {
      this.isGameOver.set(true);
      this.sound.playGameOver();
      this.announce('Game Over! No moves remaining and all tile timers have expired.');
      return true;
    }
    return false;
  }

  move(direction: MoveDirection): boolean {
    if (this.isGameOver() || this.isPaused() || this.isHelpOpen() || (this.isWon() && !this.keepPlayingAfterWin())) {
      return false;
    }

    const currentTimestamp = performance.now();

    // Step 1: Sync timers up to current frame time so decay applies before move
    if (this.lastFrameTime > 0) {
      const rawDt = (currentTimestamp - this.lastFrameTime) / 1000;
      const dt = Math.min(Math.max(0, rawDt), this.MAX_DELTA_TIME);
      this.lastFrameTime = currentTimestamp;

      const g = this.grid();
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          const cell = g[r][c];
          if (cell && cell.timer !== null) {
            cell.timer -= dt;
            if (cell.timer <= 0) {
              const overdue = -cell.timer;
              this.halveTileChain(cell, overdue);
            }
          }
        }
      }
    }

    const currentGrid = this.grid();
    const newGrid: (TileData | null)[][] = Array(this.gridSize)
      .fill(null)
      .map(() => Array(this.gridSize).fill(null));

    let moved = false;
    let reached2048 = false;
    let addedScore = 0;
    const absorbed: AbsorbedTile[] = [];

    for (let i = 0; i < this.gridSize; i++) {
      const line: { tile: TileData; origR: number; origC: number }[] = [];
      for (let j = 0; j < this.gridSize; j++) {
        const r = (direction === 'left' || direction === 'right') ? i : j;
        const c = (direction === 'left' || direction === 'right') ? j : i;
        const cell = currentGrid[r][c];
        if (cell) {
          line.push({ tile: { ...cell, isNew: false, isMerged: false }, origR: r, origC: c });
        }
      }

      if (direction === 'right' || direction === 'down') {
        line.reverse();
      }

      const mergedLine: TileData[] = [];
      let skip = false;

      for (let k = 0; k < line.length; k++) {
        if (skip) {
          skip = false;
          continue;
        }

        const curr = line[k];
        const targetIdx = mergedLine.length;
        let targetR = (direction === 'left' || direction === 'right') ? i : targetIdx;
        let targetC = (direction === 'left' || direction === 'right') ? targetIdx : i;

        if (direction === 'right') targetC = this.gridSize - 1 - targetIdx;
        if (direction === 'down') targetR = this.gridSize - 1 - targetIdx;

        // Check if next tile has same value for merge
        if (k < line.length - 1 && curr.tile.value === line[k + 1].tile.value) {
          const nextItem = line[k + 1];
          const newVal = curr.tile.value * 2;
          addedScore += newVal;

          if (newVal === 2048 && !this.isWon() && !this.keepPlayingAfterWin()) {
            reached2048 = true;
          }

          let newTimer: number | null = null;
          let newMaxTimer: number | null = null;

          if (newVal === 4) {
            const baseCap = this.getBaseMaxTimerForValue(4)!;
            newTimer = baseCap;
            newMaxTimer = baseCap;
          } else if (newVal > 4) {
            const baseCap = this.getBaseMaxTimerForValue(newVal)!;
            const t1 = curr.tile.timer ?? 0;
            const t2 = nextItem.tile.timer ?? 0;
            newMaxTimer = baseCap;
            newTimer = Math.min(baseCap, 0.75 * (t1 + t2) + Math.floor(baseCap / 4));
          }

          const mergedTile: TileData = {
            id: curr.tile.id,
            value: newVal,
            timer: newTimer,
            maxTimer: newMaxTimer,
            row: targetR,
            col: targetC,
            isMerged: true,
            isNew: false
          };

          absorbed.push({
            id: nextItem.tile.id,
            targetRow: targetR,
            targetCol: targetC
          });

          mergedLine.push(mergedTile);
          skip = true;
          moved = true;
        } else {
          if (curr.origR !== targetR || curr.origC !== targetC) {
            moved = true;
          }
          curr.tile.row = targetR;
          curr.tile.col = targetC;
          mergedLine.push(curr.tile);
        }
      }

      while (mergedLine.length < this.gridSize) {
        mergedLine.push(null as unknown as TileData);
      }

      if (direction === 'right' || direction === 'down') {
        mergedLine.reverse();
      }

      for (let j = 0; j < this.gridSize; j++) {
        const r = (direction === 'left' || direction === 'right') ? i : j;
        const c = (direction === 'left' || direction === 'right') ? j : i;
        newGrid[r][c] = mergedLine[j] || null;
      }
    }

    if (moved) {
      this.grid.set(newGrid);
      this.absorbedTiles.set(absorbed);

      // Sound feedback
      if (addedScore > 0) {
        this.sound.playMerge(addedScore);
        const newScore = this.score() + addedScore;
        this.score.set(newScore);
        if (newScore > this.bestScore()) {
          this.bestScore.set(newScore);
          this.saveBestScore(newScore);
        }
        // Add floating score indicator
        const floatItem = { id: this.nextFloatId++, value: addedScore };
        this.floatingScores.update(list => [...list.slice(-3), floatItem]);
        setTimeout(() => {
          this.floatingScores.update(list => list.filter(item => item.id !== floatItem.id));
        }, 850);
      } else {
        this.sound.playMove();
      }

      // Reset inactivity idle timer per GDD
      this.lastMoveTime = currentTimestamp;
      this.idleProgress.set(0);

      // Spawn exactly one new tile
      this.spawnTileInternal();

      if (reached2048) {
        this.isWon.set(true);
        this.sound.playWin();
        this.announce('Victory! You reached the 2048 tile in Timed Mode!');
        this.stopGameLoop();
        return true;
      }

      this.checkGameOver();
      return true;
    }

    return false;
  }

  private cloneGrid(g: (TileData | null)[][]): (TileData | null)[][] {
    return g.map(row => row.map(cell => cell ? { ...cell } : null));
  }
}
