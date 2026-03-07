// Event Bus - decoupled communication between game systems

class EventBus {
  constructor() { this.listeners = {}; }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    for (const callback of this.listeners[event]) callback(data);
  }
}

export const Events = {
  BATTLE_STARTED: 'BATTLE_STARTED',
  BUGMON_FAINTED: 'BUGMON_FAINTED',
  CACHE_SUCCESS: 'CACHE_SUCCESS',
  BATTLE_ENDED: 'BATTLE_ENDED',
  STATE_CHANGED: 'STATE_CHANGED',
  PASSIVE_ACTIVATED: 'PASSIVE_ACTIVATED',
};

export const eventBus = new EventBus();
