// Source registry — manages event source plugins.
// Sources feed raw signals into the ingestion pipeline.
// No DOM, no Node.js APIs — pure domain logic.

import type { SourceConfig, DomainEvent } from '../core/types.js';
import { EventBus } from '../core/event-bus.js';

interface SourceEntry {
  config: SourceConfig;
  running: boolean;
}

interface SourceInfo {
  name: string;
  running: boolean;
  meta?: Record<string, unknown> | null;
}

interface SourceEventMap {
  event: DomainEvent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export class SourceRegistry {
  private sources = new Map<string, SourceEntry>();
  private eventBus: EventBus<SourceEventMap>;
  private ingest: (raw: string) => DomainEvent[];

  constructor({ eventBus, ingest }: { eventBus?: EventBus<SourceEventMap>; ingest?: (raw: string) => DomainEvent[] }) {
    if (!eventBus) throw new Error('SourceRegistry requires an eventBus');
    if (typeof ingest !== 'function') throw new Error('SourceRegistry requires an ingest function');
    this.eventBus = eventBus;
    this.ingest = ingest;
  }

  register(config: SourceConfig): () => void {
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

  unregister(name: string): void {
    const entry = this.sources.get(name);
    if (!entry) return;
    if (entry.running) {
      entry.config.stop();
      entry.running = false;
    }
    this.sources.delete(name);
  }

  start(name?: string): void {
    if (name) {
      this._startOne(name);
    } else {
      for (const sourceName of this.sources.keys()) {
        this._startOne(sourceName);
      }
    }
  }

  stop(name?: string): void {
    if (name) {
      this._stopOne(name);
    } else {
      for (const sourceName of this.sources.keys()) {
        this._stopOne(sourceName);
      }
    }
  }

  list(): SourceInfo[] {
    const result: SourceInfo[] = [];
    for (const [name, entry] of this.sources) {
      result.push({
        name,
        running: entry.running,
        meta: entry.config.meta || null,
      });
    }
    return result;
  }

  private _startOne(name: string): void {
    const entry = this.sources.get(name);
    if (!entry) throw new Error(`Source "${name}" is not registered`);
    if (entry.running) return;

    const onRawSignal = (rawText: string): void => {
      const events = this.ingest(rawText);
      for (const event of events) {
        this.eventBus.emit((event as DomainEvent & { kind: string }).kind, event);
      }
    };

    entry.config.start(onRawSignal);
    entry.running = true;
  }

  private _stopOne(name: string): void {
    const entry = this.sources.get(name);
    if (!entry) throw new Error(`Source "${name}" is not registered`);
    if (!entry.running) return;
    entry.config.stop();
    entry.running = false;
  }
}
