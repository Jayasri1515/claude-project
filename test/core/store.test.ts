import { describe, expect, it, vi } from 'vitest';
import { serviceUnavailable } from '../../src/core/errors';
import { createInitialState, favoriteAvailability, ViewStateStore } from '../../src/core/store';
import type { WeatherSnapshot } from '../../src/core/domain';
import { sampleLocation, sampleSnapshot } from '../fixtures/domain';

describe('ViewStateStore subscription', () => {
  it('notifies subscribers with the new state and supports unsubscribe', () => {
    const store = new ViewStateStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.setState({ temperatureUnit: 'F' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].temperatureUnit).toBe('F');
    off();
    store.setState({ temperatureUnit: 'C' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies every subscriber', () => {
    const store = new ViewStateStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.setState({ favoritesStorageUnavailable: true });
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  });

  it('a listener may unsubscribe itself during notification', () => {
    const store = new ViewStateStore();
    const calls: number[] = [];
    const off = store.subscribe(() => {
      calls.push(1);
      off();
    });
    store.subscribe(() => calls.push(2));
    store.setState({ temperatureUnit: 'F' });
    store.setState({ temperatureUnit: 'C' });
    expect(calls).toEqual([1, 2, 2]);
  });
});

describe('ViewStateStore listener isolation (L1)', () => {
  it('a throwing listener does not stop later listeners or the state change', () => {
    const store = new ViewStateStore();
    const later = vi.fn();
    store.subscribe(() => {
      throw new Error('listener bug');
    });
    store.subscribe(later);
    expect(() => store.setState({ temperatureUnit: 'F' })).not.toThrow();
    expect(store.getState().temperatureUnit).toBe('F');
    expect(later).toHaveBeenCalledTimes(1);
    expect(later.mock.calls[0]?.[0].temperatureUnit).toBe('F');
  });
});

describe('ViewStateStore immutability and partial updates', () => {
  it('produces a new state object and leaves the old one untouched', () => {
    const store = new ViewStateStore();
    const before = store.getState();
    store.setState({ temperatureUnit: 'F', search: { status: 'loading' } });
    const after = store.getState();
    expect(after).not.toBe(before);
    expect(before.temperatureUnit).toBe('C');
    expect(before.search).toEqual({ status: 'idle' });
    expect(after.temperatureUnit).toBe('F');
  });

  it('a partial update keeps unrelated fields', () => {
    const store = new ViewStateStore(createInitialState({ favorites: [sampleLocation] }));
    store.setState({ temperatureUnit: 'F' });
    expect(store.getState().favorites).toEqual([sampleLocation]);
  });

  it('messages can be pushed and dismissed without touching other state', () => {
    const store = new ViewStateStore();
    const id1 = store.pushMessage('ui.favoriteDuplicate');
    const id2 = store.pushMessage('ui.favoriteLimitReached');
    expect(id1).not.toBe(id2);
    expect(store.getState().messages.map((m) => m.messageId)).toEqual([
      'ui.favoriteDuplicate',
      'ui.favoriteLimitReached',
    ]);
    store.dismissMessage(id1);
    expect(store.getState().messages.map((m) => m.id)).toEqual([id2]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.dismissMessage(9999);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ViewStateStore snapshot retention', () => {
  const T = new Date('2026-01-01T12:00:00Z');

  it('a failed section update never erases prior data or its time', () => {
    const store = new ViewStateStore();
    store.setSnapshot(sampleSnapshot);
    const failed: WeatherSnapshot = {
      ...sampleSnapshot,
      current: { status: 'error', error: serviceUnavailable() },
      forecast: sampleSnapshot.forecast,
    };
    store.setSnapshot(failed);
    const snap = store.getState().snapshot;
    expect(snap?.current.status).toBe('error');
    expect(snap?.current.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(snap?.current.data).toEqual(sampleSnapshot.current.data);
    expect(snap?.current.updatedAt).toEqual(sampleSnapshot.current.updatedAt);
    expect(snap?.forecast).toEqual(sampleSnapshot.forecast);
  });

  it('a loading section keeps the previous data visible', () => {
    const store = new ViewStateStore();
    store.setSnapshot(sampleSnapshot);
    store.setSnapshot({ ...sampleSnapshot, current: { status: 'loading' }, forecast: { status: 'loading' } });
    expect(store.getState().snapshot?.current.data).toEqual(sampleSnapshot.current.data);
    expect(store.getState().snapshot?.forecast.data).toEqual(sampleSnapshot.forecast.data);
  });

  it('a new success replaces the old data', () => {
    const store = new ViewStateStore();
    store.setSnapshot(sampleSnapshot);
    store.setSnapshot({ ...sampleSnapshot, current: { status: 'ready', data: { temperatureC: 1 }, updatedAt: T } });
    expect(store.getState().snapshot?.current.data).toEqual({ temperatureC: 1 });
  });

  it('a different location replaces the snapshot entirely (no old city data under a new name)', () => {
    const store = new ViewStateStore();
    store.setSnapshot(sampleSnapshot);
    const other = { ...sampleLocation, key: 'test:other', name: 'Other' };
    store.setSnapshot({ location: other, current: { status: 'loading' }, forecast: { status: 'loading' } });
    expect(store.getState().snapshot?.location.key).toBe('test:other');
    expect(store.getState().snapshot?.current.data).toBeUndefined();
  });

  it('settleInterruptedLoading turns loading sections back to ready or idle', () => {
    const store = new ViewStateStore();
    store.setState({
      snapshot: {
        location: sampleLocation,
        current: { status: 'loading', data: { temperatureC: 3 } },
        forecast: { status: 'loading' },
      },
    });
    store.settleInterruptedLoading();
    expect(store.getState().snapshot?.current.status).toBe('ready');
    expect(store.getState().snapshot?.forecast.status).toBe('idle');
  });
});

describe('favoriteAvailability', () => {
  it('covers none, can-add, already-favorite and needs-named-place', () => {
    const base = createInitialState();
    expect(favoriteAvailability(base)).toBe('none');
    expect(favoriteAvailability({ ...base, selectedLocation: sampleLocation })).toBe('can-add');
    expect(favoriteAvailability({ ...base, selectedLocation: sampleLocation, favorites: [sampleLocation] })).toBe(
      'already-favorite',
    );
    const device = { ...sampleLocation, key: 'device:current', source: 'device' as const };
    expect(favoriteAvailability({ ...base, selectedLocation: device })).toBe('needs-named-place');
    expect(favoriteAvailability({ ...base, selectedLocation: device, resolvedPlace: sampleLocation })).toBe('can-add');
    expect(
      favoriteAvailability({
        ...base,
        selectedLocation: device,
        resolvedPlace: sampleLocation,
        favorites: [sampleLocation],
      }),
    ).toBe('already-favorite');
  });
});
