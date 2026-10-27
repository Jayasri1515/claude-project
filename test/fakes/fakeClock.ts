import type { Clock } from '../../src/core/ports';

/** Controllable clock. Independent of vitest fake timers. */
export class FakeClock implements Clock {
  private current: Date;
  nowCalls = 0;

  constructor(start: Date | string = '2026-01-01T12:00:00Z') {
    this.current = new Date(start);
  }

  now(): Date {
    this.nowCalls += 1;
    return new Date(this.current);
  }

  set(time: Date | string): void {
    this.current = new Date(time);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
