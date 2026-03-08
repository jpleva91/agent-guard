// SourceRegistry — manages event source plugins
// Pure domain logic: no DOM, no Node.js-specific APIs.
// Sources feed raw signals into the ingestion pipeline,
// which produces canonical events on the EventBus.

export class SourceRegistry {
  /**
   * @param {{ eventBus: import('./event-bus.js').EventBus, ingest: (raw: string) => Array }} deps
   */
  constructor({ eventBus, ingest }) {
    if (!eventBus) throw new Error('SourceRegistry requires an eventBus');
    if (typeof ingest !== 'function') throw new Error('SourceRegistry requires an ingest function');
    this.eventBus = eventBus;
    this.ingest = ingest;
    /** @type {Map<string, { config: object, running: boolean }>} */
    this.sources = new Map();
  }

  /**
   * Register an event source.
   * @param {{ name: string, start: (onRawSignal: function) => void, stop: () => void, meta?: object }} config
   * @returns {() => void} Unregister function
   */
  register(config) {
    if (!config || typeof config.name !== 'string' || !config.name) {
      throw new Error('Source config must have a non-empty name');
    }
    if (typeof config.start !== 'function') {
      throw new Error(`Source "${config.name}" must have a start function`);
    }
    if (typeof config.stop !== 'function') {
      throw new Error(`Source "${config.name}" must have a stop function`);
    }
    if (this.sources.has(config.name)) {
      throw new Error(`Source "${config.name}" is already registered`);
    }

    this.sources.set(config.name, { config, running: false });
    return () => this.unregister(config.name);
  }

  /**
   * Unregister a source. Stops it first if running.
   * @param {string} name
   */
  unregister(name) {
    const entry = this.sources.get(name);
    if (!entry) return;
    if (entry.running) {
      entry.config.stop();
      entry.running = false;
    }
    this.sources.delete(name);
  }

  /**
   * Start one or all sources.
   * @param {string} [name] - If omitted, starts all registered sources
   */
  start(name) {
    if (name) {
      this._startOne(name);
    } else {
      for (const n of this.sources.keys()) {
        this._startOne(n);
      }
    }
  }

  /**
   * Stop one or all sources.
   * @param {string} [name] - If omitted, stops all running sources
   */
  stop(name) {
    if (name) {
      this._stopOne(name);
    } else {
      for (const n of this.sources.keys()) {
        this._stopOne(n);
      }
    }
  }

  /**
   * List registered sources with their status.
   * @returns {Array<{ name: string, running: boolean, meta?: object }>}
   */
  list() {
    const result = [];
    for (const [name, entry] of this.sources) {
      result.push({
        name,
        running: entry.running,
        meta: entry.config.meta || null,
      });
    }
    return result;
  }

  /** @private */
  _startOne(name) {
    const entry = this.sources.get(name);
    if (!entry) throw new Error(`Source "${name}" is not registered`);
    if (entry.running) return; // idempotent

    const onRawSignal = (rawText) => {
      const events = this.ingest(rawText);
      for (const event of events) {
        this.eventBus.emit(event.kind, event);
      }
    };

    entry.config.start(onRawSignal);
    entry.running = true;
  }

  /** @private */
  _stopOne(name) {
    const entry = this.sources.get(name);
    if (!entry) throw new Error(`Source "${name}" is not registered`);
    if (!entry.running) return; // idempotent

    entry.config.stop();
    entry.running = false;
  }
}
