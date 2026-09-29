import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config/env.js';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  location?: string;
  attendees?: string[];
  accountId?: string; // Optional linkage to an email account (e.g. personal vs business)
  category?: 'meeting' | 'task' | 'reminder' | 'personal';
}

export class CalendarManager {
  private eventsFile: string;
  private events: Map<string, CalendarEvent> = new Map();

  constructor(storageDir: string = config.dataDir) {
    this.eventsFile = path.join(storageDir, 'calendar-events.json');
    this.loadEvents();
  }

  private loadEvents(): void {
    try {
      const dir = path.dirname(this.eventsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.eventsFile)) {
        const raw = fs.readFileSync(this.eventsFile, 'utf-8');
        const list: CalendarEvent[] = JSON.parse(raw);
        for (const ev of list) {
          this.events.set(ev.id, ev);
        }
      } else {
        // Seed initial sample events
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);

        const endTomorrow = new Date(tomorrow);
        endTomorrow.setHours(11, 0, 0, 0);

        const sample: CalendarEvent = {
          id: `evt_${crypto.randomBytes(3).toString('hex')}`,
          title: 'OpenClaw System Architecture Sync',
          description: 'Review multi-channel ingress and multi-model fallback cascade',
          startTime: tomorrow.toISOString(),
          endTime: endTomorrow.toISOString(),
          category: 'meeting',
          attendees: ['admin@openclaw.local'],
        };
        this.events.set(sample.id, sample);
        this.saveEvents();
      }
    } catch (err) {
      console.error('[CalendarManager] Failed to load calendar events:', err);
    }
  }

  private saveEvents(): void {
    try {
      const list = Array.from(this.events.values());
      fs.writeFileSync(this.eventsFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CalendarManager] Failed to save events:', err);
    }
  }

  listEvents(start?: Date, end?: Date): CalendarEvent[] {
    const list = Array.from(this.events.values());
    return list
      .filter((ev) => {
        const evStart = new Date(ev.startTime).getTime();
        const evEnd = new Date(ev.endTime).getTime();
        if (start && evEnd < start.getTime()) return false;
        if (end && evStart > end.getTime()) return false;
        return true;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * Check for overlapping schedule conflicts
   */
  findConflicts(startTime: Date, endTime: Date, excludeId?: string): CalendarEvent[] {
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    return Array.from(this.events.values()).filter((ev) => {
      if (excludeId && ev.id === excludeId) return false;
      const evStart = new Date(ev.startTime).getTime();
      const evEnd = new Date(ev.endTime).getTime();
      return startMs < evEnd && endMs > evStart;
    });
  }

  createEvent(event: Omit<CalendarEvent, 'id'>): CalendarEvent {
    const id = `evt_${crypto.randomBytes(4).toString('hex')}`;
    const newEvent: CalendarEvent = {
      ...event,
      id,
    };
    this.events.set(id, newEvent);
    this.saveEvents();
    return newEvent;
  }

  deleteEvent(id: string): boolean {
    const deleted = this.events.delete(id);
    if (deleted) {
      this.saveEvents();
    }
    return deleted;
  }
}
