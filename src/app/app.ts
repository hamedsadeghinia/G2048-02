import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { GameService, TileData } from './game.service';
import { SoundService } from './sound.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  readonly game = inject(GameService);
  readonly sound = inject(SoundService);

  @ViewChild('boardElement') boardRef!: ElementRef<HTMLDivElement>;
  @ViewChild('helpModal') helpModalRef!: ElementRef<HTMLDivElement>;
  @ViewChild('helpCloseButton') helpCloseBtnRef!: ElementRef<HTMLButtonElement>;

  readonly activeTab = signal<'fa' | 'en'>('fa');
  readonly boardSizePx = signal<number>(370);
  readonly tileSizePx = computed(() => {
    const board = this.boardSizePx();
    const gap = this.gapSizePx();
    return (board - gap * 5) / 4;
  });
  readonly gapSizePx = computed(() => {
    return this.boardSizePx() < 340 ? 6 : (this.boardSizePx() < 420 ? 8 : 10);
  });

  // Flat list of tiles for rendering
  readonly tiles = computed(() => {
    const list: TileData[] = [];
    const g = this.game.grid();
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = g[r][c];
        if (cell) list.push(cell);
      }
    }
    return list;
  });

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private resizeObserver: ResizeObserver | null = null;

  readonly colorMap: Record<number, string> = {
    2: '#eee4da',
    4: '#ede0c8',
    8: '#f2b179',
    16: '#f59563',
    32: '#f67c5f',
    64: '#f65e3b',
    128: '#edcf72',
    256: '#edcc61',
    512: '#edc850',
    1024: '#edc53f',
    2048: '#edc22e',
    4096: '#5da852',
    8192: '#3b82f6',
    16384: '#8b5cf6'
  };

  ngOnInit() {
    this.game.start();
    this.updateBoardDimensions();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResize);
    }
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize);
    }
  }

  private onWindowResize = () => {
    this.updateBoardDimensions();
  };

  private updateBoardDimensions() {
    if (typeof window === 'undefined') return;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let targetSize = 400;
    if (screenWidth < 360) {
      targetSize = 290;
    } else if (screenWidth < 420) {
      targetSize = 330;
    } else if (screenWidth < 500) {
      targetSize = 360;
    } else if (screenWidth < 640) {
      targetSize = 390;
    } else {
      targetSize = Math.min(460, screenHeight * 0.48);
    }

    this.boardSizePx.set(Math.max(280, Math.min(460, targetSize)));
  }

  // Keyboard navigation
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.game.isHelpOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.game.toggleHelp();
      }
      return;
    }

    if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      this.game.togglePause();
      return;
    }

    const keyMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up',
      KeyW: 'up',
      w: 'up',
      W: 'up',
      k: 'up',
      K: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      s: 'down',
      S: 'down',
      j: 'down',
      J: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      a: 'left',
      A: 'left',
      h: 'left',
      H: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      d: 'right',
      D: 'right',
      l: 'right',
      L: 'right'
    };

    const dir = keyMap[event.key] || keyMap[event.code];
    if (dir) {
      event.preventDefault();
      this.game.move(dir);
    }
  }

  @HostListener('document:visibilitychange')
  handleVisibilityChange() {
    this.game.handleVisibilityChange(document.visibilityState === 'hidden');
  }

  // Touch event handlers for swipe
  onTouchStart(e: TouchEvent) {
    if (this.game.isPaused() || this.game.isHelpOpen() || this.game.isGameOver()) return;
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = performance.now();
  }

  onTouchMove(e: TouchEvent) {
    if (!this.game.isPaused() && !this.game.isHelpOpen() && !this.game.isGameOver()) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }

  onTouchEnd(e: TouchEvent) {
    if (this.game.isPaused() || this.game.isHelpOpen() || this.game.isGameOver()) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Minimum 30px threshold per GDD
    if (Math.max(absDx, absDy) >= 30) {
      if (absDx > absDy) {
        this.game.move(dx > 0 ? 'right' : 'left');
      } else {
        this.game.move(dy > 0 ? 'down' : 'up');
      }
    }
  }

  // Tile visual styles
  getTileTopPx(row: number): number {
    const gap = this.gapSizePx();
    const size = this.tileSizePx();
    return gap + row * (size + gap);
  }

  getTileLeftPx(col: number): number {
    const gap = this.gapSizePx();
    const size = this.tileSizePx();
    return gap + col * (size + gap);
  }

  getTileBackground(tile: TileData): string {
    const tileColor = this.colorMap[tile.value] || '#3c3a32';
    if (tile.timer === null || !tile.maxTimer || tile.maxTimer <= 0) {
      return tileColor;
    }

    const ratio = Math.max(0, Math.min(1, tile.timer / tile.maxTimer));
    if (ratio >= 1) {
      return tileColor;
    }
    if (ratio <= 0) {
      return 'var(--bg-color)';
    }

    const emptyPercent = 100 - ratio * 100;
    const feather = Math.min(3, Math.min(emptyPercent, 100 - emptyPercent));
    const startEdge = Math.max(0, emptyPercent - feather);
    const endEdge = Math.min(100, emptyPercent + feather);

    return `linear-gradient(to bottom, var(--bg-color) ${startEdge.toFixed(1)}%, ${tileColor} ${endEdge.toFixed(1)}%)`;
  }

  isTileCritical(tile: TileData): boolean {
    if (tile.timer === null || !tile.maxTimer || tile.maxTimer <= 0) return false;
    const threshold = Math.min(3.0, tile.maxTimer * 0.25);
    return tile.timer <= threshold;
  }

  getShakeX(tile: TileData): string {
    const logVal = Math.log2(tile.value);
    return (logVal * 0.4).toFixed(2);
  }

  getShakeRot(tile: TileData): string {
    const logVal = Math.log2(tile.value);
    return (logVal * 0.3).toFixed(2);
  }

  getTileTextColor(val: number): string {
    return val <= 4 ? '#776e65' : '#f9f6f2';
  }

  formatTimer(timer: number | null): string {
    if (timer === null) return '';
    return timer.toFixed(1) + 's';
  }

  getRemainingIdleSeconds(): string {
    const remaining = Math.max(0, (1 - this.game.idleProgress()) * 3);
    return remaining.toFixed(1);
  }
}
