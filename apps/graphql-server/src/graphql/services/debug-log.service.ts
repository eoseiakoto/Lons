import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

interface DebugEntry {
  id: string;
  timestamp: string;
  [key: string]: any;
}

/**
 * In-memory debug log store with 1-hour TTL.
 * Staging-only service for the debug panel.
 */
@Injectable()
export class DebugLogService {
  private readonly logger = new Logger(DebugLogService.name);
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  private apiLogs: DebugEntry[] = [];
  private adapterLogs: DebugEntry[] = [];
  private events: DebugEntry[] = [];
  private stateTransitions: DebugEntry[] = [];

  private pruneOld(list: DebugEntry[]): DebugEntry[] {
    const cutoff = Date.now() - this.TTL_MS;
    return list.filter((entry) => new Date(entry.timestamp).getTime() > cutoff);
  }

  pushApiLog(log: Omit<DebugEntry, 'id' | 'timestamp'> & { timestamp?: string }): void {
    this.apiLogs = this.pruneOld(this.apiLogs);
    this.apiLogs.unshift({
      id: randomUUID(),
      timestamp: log.timestamp ?? new Date().toISOString(),
      ...log,
    });
    if (this.apiLogs.length > 500) this.apiLogs.length = 500;
  }

  pushAdapterLog(log: Omit<DebugEntry, 'id' | 'timestamp'> & { timestamp?: string }): void {
    this.adapterLogs = this.pruneOld(this.adapterLogs);
    this.adapterLogs.unshift({
      id: randomUUID(),
      timestamp: log.timestamp ?? new Date().toISOString(),
      ...log,
    });
    if (this.adapterLogs.length > 500) this.adapterLogs.length = 500;
  }

  pushEvent(log: Omit<DebugEntry, 'id' | 'timestamp'> & { timestamp?: string }): void {
    this.events = this.pruneOld(this.events);
    this.events.unshift({
      id: randomUUID(),
      timestamp: log.timestamp ?? new Date().toISOString(),
      ...log,
    });
    if (this.events.length > 500) this.events.length = 500;
  }

  pushStateTransition(log: Omit<DebugEntry, 'id' | 'timestamp'> & { timestamp?: string }): void {
    this.stateTransitions = this.pruneOld(this.stateTransitions);
    this.stateTransitions.unshift({
      id: randomUUID(),
      timestamp: log.timestamp ?? new Date().toISOString(),
      ...log,
    });
    if (this.stateTransitions.length > 500) this.stateTransitions.length = 500;
  }

  getApiLogs(limit: number): DebugEntry[] {
    this.apiLogs = this.pruneOld(this.apiLogs);
    return this.apiLogs.slice(0, limit);
  }

  getAdapterLogs(limit: number): DebugEntry[] {
    this.adapterLogs = this.pruneOld(this.adapterLogs);
    return this.adapterLogs.slice(0, limit);
  }

  getEvents(limit: number): DebugEntry[] {
    this.events = this.pruneOld(this.events);
    return this.events.slice(0, limit);
  }

  getStateTransitions(entityId: string): DebugEntry[] {
    this.stateTransitions = this.pruneOld(this.stateTransitions);
    return this.stateTransitions.filter((entry) => entry.entityId === entityId);
  }
}
