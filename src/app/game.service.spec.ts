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
    // Fill grid with non-matching tiles, but with active timers
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
    // Game over should not trigger because timers can decay and open moves
    expect(service.checkGameOver()).toBe(false);
    expect(service.isGameOver()).toBe(false);
  });
});
