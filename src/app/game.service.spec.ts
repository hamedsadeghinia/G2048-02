import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';
import { SoundService } from './sound.service';

describe('GameService - Timed 2048 Mechanics', () => {
  let service: GameService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameService, SoundService]
    });
    service = TestBed.inject(GameService);
  });

  it('calculates correct base timer capacity based on value', () => {
    expect(service.getBaseMaxTimerForValue(2)).toBeNull();
    expect(service.getBaseMaxTimerForValue(4)).toBe(10);
    expect(service.getBaseMaxTimerForValue(8)).toBe(14);
    expect(service.getBaseMaxTimerForValue(16)).toBe(20);
    expect(service.getBaseMaxTimerForValue(32)).toBe(28);
    expect(service.getBaseMaxTimerForValue(64)).toBe(40);
    expect(service.getBaseMaxTimerForValue(2048)).toBe(226);
  });

  it('initializes grid with 2 tiles upon start', () => {
    service.start();
    const g = service.grid();
    let count = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (g[r][c] !== null) count++;
      }
    }
    expect(count).toBe(2);
    expect(service.score()).toBe(0);
    expect(service.isGameOver()).toBe(false);
  });

  it('does not declare game over if board is full but has active timers', () => {
    const fullGrid = [
      [
        { id: '1', value: 4, timer: 5, maxTimer: 10, row: 0, col: 0 },
        { id: '2', value: 8, timer: 7, maxTimer: 14, row: 0, col: 1 },
        { id: '3', value: 16, timer: 9, maxTimer: 20, row: 0, col: 2 },
        { id: '4', value: 32, timer: 12, maxTimer: 28, row: 0, col: 3 }
      ],
      [
        { id: '5', value: 64, timer: 15, maxTimer: 40, row: 1, col: 0 },
        { id: '6', value: 128, timer: 18, maxTimer: 57, row: 1, col: 1 },
        { id: '7', value: 256, timer: 20, maxTimer: 80, row: 1, col: 2 },
        { id: '8', value: 512, timer: 25, maxTimer: 113, row: 1, col: 3 }
      ],
      [
        { id: '9', value: 4, timer: 5, maxTimer: 10, row: 2, col: 0 },
        { id: '10', value: 8, timer: 7, maxTimer: 14, row: 2, col: 1 },
        { id: '11', value: 16, timer: 9, maxTimer: 20, row: 2, col: 2 },
        { id: '12', value: 32, timer: 12, maxTimer: 28, row: 2, col: 3 }
      ],
      [
        { id: '13', value: 64, timer: 15, maxTimer: 40, row: 3, col: 0 },
        { id: '14', value: 128, timer: 18, maxTimer: 57, row: 3, col: 1 },
        { id: '15', value: 256, timer: 20, maxTimer: 80, row: 3, col: 2 },
        { id: '16', value: 512, timer: 25, maxTimer: 113, row: 3, col: 3 }
      ]
    ];

    service.grid.set(fullGrid);
    expect(service.canMove()).toBe(false);
    expect(service.hasActiveTimers()).toBe(true);
    expect(service.checkGameOver()).toBe(false);
    expect(service.isGameOver()).toBe(false);
  });

  it('declares game over when no moves remain and no active timers exist', () => {
    // Grid filled with 2s in alternating pattern where no adjacent equal values exist
    const fullGrid = [
      [
        { id: '1', value: 2, timer: null, maxTimer: null, row: 0, col: 0 },
        { id: '2', value: 4, timer: null, maxTimer: null, row: 0, col: 1 },
        { id: '3', value: 2, timer: null, maxTimer: null, row: 0, col: 2 },
        { id: '4', value: 4, timer: null, maxTimer: null, row: 0, col: 3 }
      ],
      [
        { id: '5', value: 4, timer: null, maxTimer: null, row: 1, col: 0 },
        { id: '6', value: 2, timer: null, maxTimer: null, row: 1, col: 1 },
        { id: '7', value: 4, timer: null, maxTimer: null, row: 1, col: 2 },
        { id: '8', value: 2, timer: null, maxTimer: null, row: 1, col: 3 }
      ],
      [
        { id: '9', value: 2, timer: null, maxTimer: null, row: 2, col: 0 },
        { id: '10', value: 4, timer: null, maxTimer: null, row: 2, col: 1 },
        { id: '11', value: 2, timer: null, maxTimer: null, row: 2, col: 2 },
        { id: '12', value: 4, timer: null, maxTimer: null, row: 2, col: 3 }
      ],
      [
        { id: '13', value: 4, timer: null, maxTimer: null, row: 3, col: 0 },
        { id: '14', value: 2, timer: null, maxTimer: null, row: 3, col: 1 },
        { id: '15', value: 4, timer: null, maxTimer: null, row: 3, col: 2 },
        { id: '16', value: 2, timer: null, maxTimer: null, row: 3, col: 3 }
      ]
    ];

    service.grid.set(fullGrid);
    expect(service.canMove()).toBe(false);
    expect(service.hasActiveTimers()).toBe(false);
    expect(service.checkGameOver()).toBe(true);
    expect(service.isGameOver()).toBe(true);
  });

  describe('Move and Merge mechanics', () => {
    it('merges identical adjacent tiles and updates score and timer', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      // Put two 4-value tiles next to each other
      grid[0][0] = { id: 't1', value: 4, timer: 8, maxTimer: 10, row: 0, col: 0 };
      grid[0][1] = { id: 't2', value: 4, timer: 6, maxTimer: 10, row: 0, col: 1 };
      service.grid.set(grid);

      const moved = service.move('left');
      expect(moved).toBe(true);
      expect(service.score()).toBe(8);

      const resGrid = service.grid();
      const merged = resGrid[0][0];
      expect(merged).not.toBeNull();
      expect(merged?.value).toBe(8);

      // Verify timer formula:
      // baseCap for 8 is 14
      // Math.min(14, 0.75 * (8 + 6) + Math.floor(14 / 4))
      // = Math.min(14, 0.75 * 14 + 3) = Math.min(14, 10.5 + 3) = 13.5
      expect(merged?.maxTimer).toBe(14);
      expect(merged?.timer).toBeCloseTo(13.5);
    });

    it('merges 2s into 4 with baseCap4 timer', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      grid[0][0] = { id: 't1', value: 2, timer: null, maxTimer: null, row: 0, col: 0 };
      grid[0][1] = { id: 't2', value: 2, timer: null, maxTimer: null, row: 0, col: 1 };
      service.grid.set(grid);

      service.move('left');
      const merged = service.grid()[0][0];
      expect(merged?.value).toBe(4);
      expect(merged?.timer).toBe(10);
      expect(merged?.maxTimer).toBe(10);
    });

    it('caps merged timer at baseCap if calculation exceeds it', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      // Two 8 tiles with full timers 14
      grid[0][0] = { id: 't1', value: 8, timer: 14, maxTimer: 14, row: 0, col: 0 };
      grid[0][1] = { id: 't2', value: 8, timer: 14, maxTimer: 14, row: 0, col: 1 };
      service.grid.set(grid);

      service.move('left');
      const merged = service.grid()[0][0];
      expect(merged?.value).toBe(16);
      const baseCap16 = service.getBaseMaxTimerForValue(16)!; // 20
      // 0.75 * (14 + 14) + floor(20 / 4) = 21 + 5 = 26 > 20 -> capped to 20
      expect(merged?.maxTimer).toBe(20);
      expect(merged?.timer).toBe(baseCap16);
    });

    it('returns false and does not alter state if move has no effect', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      grid[0][0] = { id: 't1', value: 2, timer: null, maxTimer: null, row: 0, col: 0 };
      service.grid.set(grid);

      const moved = service.move('left');
      expect(moved).toBe(false);
    });
  });

  describe('Win condition and continuing', () => {
    it('sets isWon when 2048 is formed', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      grid[0][0] = { id: 't1', value: 1024, timer: 50, maxTimer: 160, row: 0, col: 0 };
      grid[0][1] = { id: 't2', value: 1024, timer: 50, maxTimer: 160, row: 0, col: 1 };
      service.grid.set(grid);

      expect(service.isWon()).toBe(false);
      service.move('left');
      expect(service.isWon()).toBe(true);
      expect(service.grid()[0][0]?.value).toBe(2048);

      // When won and keepPlayingAfterWin is false, further moves should be blocked
      const furtherMove = service.move('right');
      expect(furtherMove).toBe(false);

      // Keep playing enables moves again
      service.keepPlaying();
      expect(service.keepPlayingAfterWin()).toBe(true);
    });
  });

  describe('Pause, Resume, and Restart', () => {
    it('toggles pause state correctly', () => {
      service.start();
      expect(service.isPaused()).toBe(false);

      service.togglePause();
      expect(service.isPaused()).toBe(true);

      // Moves should be blocked while paused
      const movedWhilePaused = service.move('left');
      expect(movedWhilePaused).toBe(false);

      service.togglePause();
      expect(service.isPaused()).toBe(false);
    });

    it('toggles help modal and automatically pauses/resumes gameplay', () => {
      service.start();
      expect(service.isHelpOpen()).toBe(false);
      expect(service.isPaused()).toBe(false);

      service.toggleHelp();
      expect(service.isHelpOpen()).toBe(true);
      expect(service.isPaused()).toBe(true);

      service.toggleHelp();
      expect(service.isHelpOpen()).toBe(false);
      expect(service.isPaused()).toBe(false);
    });

    it('handles visibility change pause and resume', () => {
      service.start();
      expect(service.isPaused()).toBe(false);

      service.handleVisibilityChange(true);
      expect(service.isPaused()).toBe(true);

      service.handleVisibilityChange(false);
      expect(service.isPaused()).toBe(false);
    });

    it('restarts game cleanly', () => {
      service.start();
      service.score.set(500);
      service.isGameOver.set(true);

      service.restart();
      expect(service.score()).toBe(0);
      expect(service.isGameOver()).toBe(false);
      expect(service.isPaused()).toBe(false);
    });
  });

  describe('Simulation Step: Timer Decay and Inactivity Penalty', () => {
    it('halves tile value when timer expires during gameStep', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      grid[0][0] = { id: 't1', value: 8, timer: 0.2, maxTimer: 14, row: 0, col: 0 };
      service.grid.set(grid);

      // Access private gameStep via index signature
      const now = performance.now();
      (service as unknown as { lastFrameTime: number }).lastFrameTime = now;
      (service as unknown as { gameStep: (t: number) => void }).gameStep(now + 500); // 0.5s passed

      const updatedTile = service.grid()[0][0];
      expect(updatedTile?.value).toBe(4);
      expect(updatedTile?.maxTimer).toBe(10);
      // Decay time = 60% of baseCap (10 * 0.6 = 6s) minus overdue
      expect(updatedTile?.timer).toBeGreaterThan(0);
    });

    it('halves tile to 2 and removes timer when a 4 expires', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      grid[0][0] = { id: 't1', value: 4, timer: 0.1, maxTimer: 10, row: 0, col: 0 };
      service.grid.set(grid);

      const now = performance.now();
      (service as unknown as { lastFrameTime: number }).lastFrameTime = now;
      (service as unknown as { gameStep: (t: number) => void }).gameStep(now + 300);

      const updatedTile = service.grid()[0][0];
      expect(updatedTile?.value).toBe(2);
      expect(updatedTile?.timer).toBeNull();
      expect(updatedTile?.maxTimer).toBeNull();
    });

    it('spawns a new tile when idle elapsed exceeds IDLE_TIME_THRESHOLD (3s)', () => {
      const grid = Array(4).fill(null).map(() => Array(4).fill(null));
      grid[0][0] = { id: 't1', value: 2, timer: null, maxTimer: null, row: 0, col: 0 };
      service.grid.set(grid);

      const now = performance.now();
      (service as unknown as { lastFrameTime: number }).lastFrameTime = now;
      (service as unknown as { lastMoveTime: number }).lastMoveTime = now - 3500; // 3.5s idle

      (service as unknown as { gameStep: (t: number) => void }).gameStep(now);

      let tileCount = 0;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (service.grid()[r][c] !== null) tileCount++;
        }
      }
      expect(tileCount).toBe(2); // Initial 1 tile + 1 idle spawned tile
    });
  });
});
