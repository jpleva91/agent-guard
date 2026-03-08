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
  meta?: Record<string, unknown>;
}

interface SourceEventMap {
  event: DomainEvent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export class SourceRegistry {
  private sources = new Map<string, SourceEntry>();
  private bus: EventBus<SourceEventMap>;
  private ingestFn: ((raw: string) => DomainEvent[]) | null;

  constructor(
    eventBus: EventBus<SourceEventMap>,
    ingest: ((raw: string) => DomainEvent[]) | null = null,
  ) {
    this.bus = eventBus;
    this.ingestFn = ingest;
  }

  register(config: SourceConfig): () => void {
    if (this.sources.has(config.name)) {
      throw new Error(`Source already registered: ${config.name}`);
    }

    this.sources.set(config.name, { config, running: false });
    return () => this.unregister(config.name);
  }

  unregister(name: string): void {
    const entry = this.sources.get(name);
    if (!entry) return;
    if (entry.running) {
      entry.config.stop();
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
    for (const [_name, entry] of this.sources) {
      result.push({
        name: entry.config.name,
        running: entry.running,
        meta: entry.config.meta,
      });
    }
    return result;
  }

  private _startOne(name: string): void {
    const entry = this.sources.get(name);
    if (!entry) throw new Error(`Unknown source: ${name}`);
    if (entry.running) return;

    const onRawSignal = (rawText: string): void => {
      if (!this.ingestFn) return;
      const events = this.ingestFn(rawText);
      for (const event of events) {
        this.bus.emit('event', event);
      }
    };

    entry.config.start(onRawSignal);
    entry.running = true;
  }

  private _stopOne(name: string): void {
    const entry = this.sources.get(name);
    if (!entry || !entry.running) return;
    entry.config.stop();
    entry.running = false;
  }
}
