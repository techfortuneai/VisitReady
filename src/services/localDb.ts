/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  User,
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  AppointmentSummary,
  Collaborator,
  DailyVitalLog,
} from '../types/index.ts';

export interface WorkspaceSnapshot {
  userId: string;
  email: string;
  token: string;
  verifierHash?: string;
  verifierSalt?: string;
  user: User;
  people: Person[];
  conditions: Condition[];
  symptoms: SymptomEntry[];
  appointments: Appointment[];
  summaries: AppointmentSummary[];
  collaborators: Collaborator[];
  vital_logs?: DailyVitalLog[];
  updatedAt: string;
}

const DB_NAME = 'visitready_persistent_db';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';

const ACTIVE_PERSON_PREFIX = 'visitready_active_person_';
const ACTIVE_TAB_PREFIX = 'visitready_active_tab_';

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          const store = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'userId' });
          store.createIndex('email', 'email', { unique: false });
          store.createIndex('token', 'token', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createLocalPasswordVerifier(
  email: string,
  password: string,
  existingSalt?: string
): Promise<{ hash: string; salt: string }> {
  const salt =
    existingSalt ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`);
  const payload = `${salt}:${email.trim().toLowerCase()}:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return { hash: toHex(digest), salt };
  }
  return { hash: btoa(unescape(encodeURIComponent(payload))), salt };
}

export async function verifyLocalPassword(
  email: string,
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const computed = await createLocalPasswordVerifier(email, password, salt);
  return computed.hash === hash;
}

class LocalDbService {
  private memorySnapshots = new Map<string, WorkspaceSnapshot>();

  public async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    const clean: WorkspaceSnapshot = {
      ...snapshot,
      email: snapshot.email.trim().toLowerCase(),
      vital_logs: snapshot.vital_logs || [],
      updatedAt: new Date().toISOString(),
    };
    this.memorySnapshots.set(clean.userId, clean);

    const db = await openIdb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        store.put(clean);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async getSnapshotByUserId(userId: string): Promise<WorkspaceSnapshot | null> {
    const mem = this.memorySnapshots.get(userId);
    const db = await openIdb();
    if (!db) return mem || null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const req = store.get(userId);
        req.onsuccess = () => resolve((req.result as WorkspaceSnapshot) || mem || null);
        req.onerror = () => resolve(mem || null);
      } catch {
        resolve(mem || null);
      }
    });
  }

  public async getSnapshotByToken(token: string): Promise<WorkspaceSnapshot | null> {
    if (!token) return null;
    for (const snap of this.memorySnapshots.values()) {
      if (snap.token === token) return snap;
    }

    const db = await openIdb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const idx = store.index('token');
        const req = idx.get(token);
        req.onsuccess = () => resolve((req.result as WorkspaceSnapshot) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async getSnapshotByEmail(email: string): Promise<WorkspaceSnapshot | null> {
    const lower = email.trim().toLowerCase();
    for (const snap of this.memorySnapshots.values()) {
      if (snap.email === lower) return snap;
    }

    const db = await openIdb();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
        const store = tx.objectStore(STORE_SNAPSHOTS);
        const idx = store.index('email');
        const req = idx.get(lower);
        req.onsuccess = () => resolve((req.result as WorkspaceSnapshot) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async deleteSnapshot(userId: string): Promise<void> {
    this.memorySnapshots.delete(userId);
    const db = await openIdb();
    if (!db) return;

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
        tx.objectStore(STORE_SNAPSHOTS).delete(userId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public getActivePersonPreference(userId: string): string {
    try {
      return localStorage.getItem(`${ACTIVE_PERSON_PREFIX}${userId}`) || '';
    } catch {
      return '';
    }
  }

  public setActivePersonPreference(userId: string, personId: string): void {
    try {
      if (personId) {
        localStorage.setItem(`${ACTIVE_PERSON_PREFIX}${userId}`, personId);
      }
    } catch {
      // ignore storage quota
    }
  }

  public getActiveTabPreference(userId: string): string {
    try {
      return localStorage.getItem(`${ACTIVE_TAB_PREFIX}${userId}`) || '';
    } catch {
      return '';
    }
  }

  public setActiveTabPreference(userId: string, tab: string): void {
    try {
      if (tab) {
        localStorage.setItem(`${ACTIVE_TAB_PREFIX}${userId}`, tab);
      }
    } catch {
      // ignore storage quota
    }
  }
}

export const localDb = new LocalDbService();
