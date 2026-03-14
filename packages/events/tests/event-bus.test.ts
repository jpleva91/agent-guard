import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@red-codes/events';

interface TestEventMap {
  Ping: { value: number };
  Pong: { message: string };
}

describe('EventBus', () => {
  let bus: EventBus<TestEventMap>;

  beforeEach(() => {
    bus = new EventBus<TestEventMap>();
  });

  it('should emit and receive events', () => {
    let received: number | null = null;
    bus.on('Ping', ({ value }) => {
      received = value;
    });

    bus.emit('Ping', { value: 42 });
    expect(received).toBe(42);
  });

  it('should support multiple listeners for the same event', () => {
    const values: number[] = [];
    bus.on('Ping', ({ value }) => values.push(value));
    bus.on('Ping', ({ value }) => values.push(value * 2));

    bus.emit('Ping', { value: 5 });
    expect(values).toEqual([5, 10]);
  });

  it('should unsubscribe via returned function', () => {
    let callCount = 0;
    const unsub = bus.on('Ping', () => {
      callCount++;
    });

    bus.emit('Ping', { value: 1 });
    expect(callCount).toBe(1);

    unsub();
    bus.emit('Ping', { value: 2 });
    expect(callCount).toBe(1);
  });

  it('should unsubscribe via off()', () => {
    let callCount = 0;
    const handler = () => {
      callCount++;
    };
    bus.on('Ping', handler);

    bus.emit('Ping', { value: 1 });
    expect(callCount).toBe(1);

    bus.off('Ping', handler);
    bus.emit('Ping', { value: 2 });
    expect(callCount).toBe(1);
  });

  it('should not fail when emitting with no listeners', () => {
    expect(() => bus.emit('Ping', { value: 1 })).not.toThrow();
  });

  it('should handle different event types independently', () => {
    let pingValue: number | null = null;
    let pongMessage: string | null = null;

    bus.on('Ping', ({ value }) => {
      pingValue = value;
    });
    bus.on('Pong', ({ message }) => {
      pongMessage = message;
    });

    bus.emit('Ping', { value: 99 });
    expect(pingValue).toBe(99);
    expect(pongMessage).toBeNull();

    bus.emit('Pong', { message: 'hello' });
    expect(pongMessage).toBe('hello');
  });

  it('should clear all listeners', () => {
    let called = false;
    bus.on('Ping', () => {
      called = true;
    });

    bus.clear();
    bus.emit('Ping', { value: 1 });
    expect(called).toBe(false);
  });

  it('should report listener count', () => {
    expect(bus.listenerCount('Ping')).toBe(0);

    const unsub1 = bus.on('Ping', () => {});
    expect(bus.listenerCount('Ping')).toBe(1);

    bus.on('Ping', () => {});
    expect(bus.listenerCount('Ping')).toBe(2);

    unsub1();
    expect(bus.listenerCount('Ping')).toBe(1);
  });
});
