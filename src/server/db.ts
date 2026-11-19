/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import {
  User,
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  AppointmentSummary,
  Collaborator,
  DailyVitalLog,
  AuthSession,
} from '../types/index.ts';

export interface DatabaseSchema {
  users: Record<string, User & { password_hash?: string; password_salt?: string }>;
  sessions: Record<string, AuthSession>;
  people: Record<string, Person>;
  conditions: Record<string, Condition>;
  symptoms: Record<string, SymptomEntry>;
  appointments: Record<string, Appointment>;
  summaries: Record<string, AppointmentSummary>;
  collaborators: Record<string, Collaborator>;
  password_reset_tokens: Record<string, { user_id: string; expires_at: string }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'visitready.db');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'visitready.json');

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

class DatabaseService {
  private sqlite!: DatabaseSync;

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    this.sqlite = new DatabaseSync(DB_PATH);
    this.sqlite.exec('PRAGMA journal_mode = WAL;');
    this.sqlite.exec('PRAGMA synchronous = NORMAL;');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');

    this.createTables();
    this.migrateLegacyJsonIfNeeded();
  }

  private createTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        auth_provider TEXT NOT NULL,
        preferences_json TEXT NOT NULL,
        password_hash TEXT,
        password_salt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        birth_date TEXT,
        allergies TEXT,
        notes TEXT,
        height TEXT,
        height_unit TEXT,
        weight REAL,
        weight_unit TEXT,
        blood_type TEXT,
        medical_history TEXT,
        current_medications TEXT,
        baseline_bp TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id);

      CREATE TABLE IF NOT EXISTS conditions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        name TEXT NOT NULL,
        diagnosed_date TEXT,
        treating_clinician TEXT,
        doctor_treatments_json TEXT,
        status TEXT NOT NULL,
        notes TEXT,
        attachments_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_conditions_user ON conditions(user_id);
      CREATE INDEX IF NOT EXISTS idx_conditions_person ON conditions(person_id);

      CREATE TABLE IF NOT EXISTS symptoms (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        condition_ids_json TEXT NOT NULL,
        symptom_name TEXT NOT NULL,
        symptoms_list_json TEXT,
        start_datetime TEXT NOT NULL,
        end_datetime TEXT,
        ongoing INTEGER NOT NULL DEFAULT 0,
        severity_0_to_10 INTEGER NOT NULL DEFAULT 0,
        duration_text TEXT,
        body_location TEXT,
        description TEXT NOT NULL DEFAULT '',
        context TEXT,
        possible_triggers TEXT,
        better_or_worse_notes TEXT,
        associated_symptoms TEXT,
        daily_impact TEXT,
        tags_json TEXT NOT NULL,
        vitals_json TEXT,
        attachments_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_symptoms_user ON symptoms(user_id);
      CREATE INDEX IF NOT EXISTS idx_symptoms_person ON symptoms(person_id);
      CREATE INDEX IF NOT EXISTS idx_symptoms_start ON symptoms(start_datetime);

      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        appointment_datetime TEXT NOT NULL,
        clinician_or_clinic TEXT NOT NULL,
        appointment_type TEXT NOT NULL,
        location_or_telehealth TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_person ON appointments(person_id);

      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        appointment_id TEXT,
        title TEXT NOT NULL,
        date_range_start TEXT NOT NULL,
        date_range_end TEXT NOT NULL,
        selected_entry_ids_json TEXT NOT NULL,
        custom_questions_json TEXT NOT NULL,
        visit_notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_summaries_user ON summaries(user_id);

      CREATE TABLE IF NOT EXISTS collaborators (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        phone TEXT,
        name TEXT NOT NULL,
        category TEXT,
        relationship_detail TEXT,
        role TEXT NOT NULL,
        notes TEXT,
        access_code TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_collaborators_user ON collaborators(user_id);

      CREATE TABLE IF NOT EXISTS vital_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        person_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        blood_pressure_systolic REAL,
        blood_pressure_diastolic REAL,
        blood_sugar REAL,
        blood_sugar_context TEXT,
        blood_sugar_readings_json TEXT,
        oxygen_spo2 REAL,
        pulse REAL,
        temperature REAL,
        temperature_unit TEXT,
        weight REAL,
        weight_unit TEXT,
        respiratory_rate REAL,
        remark TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_vital_logs_user ON vital_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_vital_logs_person ON vital_logs(person_id);
      CREATE INDEX IF NOT EXISTS idx_vital_logs_recorded ON vital_logs(recorded_at);
    `);
  }

  private migrateLegacyJsonIfNeeded() {
    try {
      const countRow = this.sqlite.prepare('SELECT COUNT(*) as cnt FROM users').get() as {
        cnt: number;
      };
      if (countRow && countRow.cnt > 0) return;
      if (!fs.existsSync(LEGACY_JSON_FILE)) return;

      const raw = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      if (!parsed || !parsed.users || Object.keys(parsed.users).length === 0) return;

      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const u of Object.values(parsed.users)) {
          if (u?.id && u?.email) this.saveUser(u);
        }
        for (const s of Object.values(parsed.sessions || {})) {
          if (s?.token && s?.user_id && this.findUserById(s.user_id)) {
            this.saveSession(s);
          }
        }
        for (const p of Object.values(parsed.people || {})) {
          if (p?.id && p?.user_id && this.findUserById(p.user_id)) {
            this.savePerson(p);
          }
        }
        for (const c of Object.values(parsed.conditions || {})) {
          if (c?.id && c?.user_id && this.findUserById(c.user_id)) {
            this.saveCondition(c);
          }
        }
        for (const sym of Object.values(parsed.symptoms || {})) {
          if (sym?.id && sym?.user_id && this.findUserById(sym.user_id)) {
            this.saveSymptom(sym);
          }
        }
        for (const a of Object.values(parsed.appointments || {})) {
          if (a?.id && a?.user_id && this.findUserById(a.user_id)) {
            this.saveAppointment(a);
          }
        }
        for (const sum of Object.values(parsed.summaries || {})) {
          if (sum?.id && sum?.user_id && this.findUserById(sum.user_id)) {
            this.saveSummary(sum);
          }
        }
        for (const col of Object.values(parsed.collaborators || {})) {
          if (col?.id && col?.user_id && this.findUserById(col.user_id)) {
            this.saveCollaborator(col);
          }
        }
        this.sqlite.exec('COMMIT');
        console.log('Migrated existing records from visitready.json into SQLite visitready.db.');
      } catch (innerErr) {
        this.sqlite.exec('ROLLBACK');
        throw innerErr;
      }
    } catch (err) {
      console.error('Error migrating legacy visitready.json:', err);
    }
  }

  private rowToUser(row: any): (User & { password_hash?: string; password_salt?: string }) | null {
    if (!row) return null;
    const u: User & { password_hash?: string; password_salt?: string } = {
      id: row.id,
      email: row.email,
      name: row.name,
      auth_provider: row.auth_provider,
      created_at: row.created_at,
      updated_at: row.updated_at,
      preferences: safeParseJson(row.preferences_json, {
        time_zone: 'Asia/Kolkata',
        date_format: 'DD/MM/YYYY',
        temperature_unit: 'F',
        weight_unit: 'kg',
        blood_sugar_unit: 'mg/dL',
        reminders_enabled: false,
        high_contrast: false,
      }),
    };
    if (row.password_hash) u.password_hash = row.password_hash;
    if (row.password_salt) u.password_salt = row.password_salt;
    return u;
  }

  private rowToPerson(row: any): Person {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      relationship: row.relationship,
      birth_date: row.birth_date ?? undefined,
      allergies: row.allergies ?? undefined,
      notes: row.notes ?? undefined,
      height: row.height ?? undefined,
      height_unit: row.height_unit ?? undefined,
      weight: row.weight !== null && row.weight !== undefined ? Number(row.weight) : undefined,
      weight_unit: row.weight_unit ?? undefined,
      blood_type: row.blood_type ?? undefined,
      medical_history: row.medical_history ?? undefined,
      current_medications: row.current_medications ?? undefined,
      baseline_bp: row.baseline_bp ?? undefined,
      emergency_contact_name: row.emergency_contact_name ?? undefined,
      emergency_contact_phone: row.emergency_contact_phone ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToCondition(row: any): Condition {
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      name: row.name,
      diagnosed_date: row.diagnosed_date ?? undefined,
      treating_clinician: row.treating_clinician ?? undefined,
      doctor_treatments: row.doctor_treatments_json
        ? safeParseJson(row.doctor_treatments_json, undefined)
        : undefined,
      status: row.status,
      notes: row.notes ?? undefined,
      attachments: row.attachments_json
        ? safeParseJson(row.attachments_json, undefined)
        : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToSymptom(row: any): SymptomEntry {
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      condition_ids: safeParseJson(row.condition_ids_json, []),
      symptom_name: row.symptom_name,
      symptoms_list: row.symptoms_list_json
        ? safeParseJson(row.symptoms_list_json, undefined)
        : undefined,
      start_datetime: row.start_datetime,
      end_datetime: row.end_datetime ?? undefined,
      ongoing: Boolean(row.ongoing),
      severity_0_to_10: Number(row.severity_0_to_10),
      duration_text: row.duration_text ?? undefined,
      body_location: row.body_location ?? undefined,
      description: row.description ?? '',
      context: row.context ?? undefined,
      possible_triggers: row.possible_triggers ?? undefined,
      better_or_worse_notes: row.better_or_worse_notes ?? undefined,
      associated_symptoms: row.associated_symptoms ?? undefined,
      daily_impact: row.daily_impact ?? undefined,
      tags: safeParseJson(row.tags_json, []),
      vitals: row.vitals_json ? safeParseJson(row.vitals_json, undefined) : undefined,
      attachments: row.attachments_json
        ? safeParseJson(row.attachments_json, undefined)
        : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToAppointment(row: any): Appointment {
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      appointment_datetime: row.appointment_datetime,
      clinician_or_clinic: row.clinician_or_clinic,
      appointment_type: row.appointment_type,
      location_or_telehealth: row.location_or_telehealth ?? undefined,
      notes: row.notes ?? undefined,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToSummary(row: any): AppointmentSummary {
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      appointment_id: row.appointment_id ?? undefined,
      title: row.title,
      date_range_start: row.date_range_start,
      date_range_end: row.date_range_end,
      selected_entry_ids: safeParseJson(row.selected_entry_ids_json, []),
      custom_questions: safeParseJson(row.custom_questions_json, []),
      visit_notes: row.visit_notes ?? undefined,
      created_at: row.created_at,
    };
  }

  private rowToCollaborator(row: any): Collaborator {
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      email: row.email,
      phone: row.phone ?? undefined,
      name: row.name,
      category: row.category ?? undefined,
      relationship_detail: row.relationship_detail ?? undefined,
      role: row.role,
      notes: row.notes ?? undefined,
      access_code: row.access_code,
      status: row.status,
      created_at: row.created_at,
    };
  }

  private rowToVitalLog(row: any): DailyVitalLog {
    return {
      id: row.id,
      user_id: row.user_id,
      person_id: row.person_id,
      recorded_at: row.recorded_at,
      blood_pressure_systolic:
        row.blood_pressure_systolic !== null && row.blood_pressure_systolic !== undefined
          ? Number(row.blood_pressure_systolic)
          : undefined,
      blood_pressure_diastolic:
        row.blood_pressure_diastolic !== null && row.blood_pressure_diastolic !== undefined
          ? Number(row.blood_pressure_diastolic)
          : undefined,
      blood_sugar:
        row.blood_sugar !== null && row.blood_sugar !== undefined
          ? Number(row.blood_sugar)
          : undefined,
      blood_sugar_context: row.blood_sugar_context ?? undefined,
      blood_sugar_readings: row.blood_sugar_readings_json
        ? safeParseJson(row.blood_sugar_readings_json, undefined)
        : undefined,
      oxygen_spo2:
        row.oxygen_spo2 !== null && row.oxygen_spo2 !== undefined
          ? Number(row.oxygen_spo2)
          : undefined,
      pulse: row.pulse !== null && row.pulse !== undefined ? Number(row.pulse) : undefined,
      temperature:
        row.temperature !== null && row.temperature !== undefined
          ? Number(row.temperature)
          : undefined,
      temperature_unit: row.temperature_unit ?? undefined,
      weight: row.weight !== null && row.weight !== undefined ? Number(row.weight) : undefined,
      weight_unit: row.weight_unit ?? undefined,
      respiratory_rate:
        row.respiratory_rate !== null && row.respiratory_rate !== undefined
          ? Number(row.respiratory_rate)
          : undefined,
      remark: row.remark ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // --- Users & Sessions ---
  public findUserById(id: string) {
    const row = this.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return this.rowToUser(row);
  }

  public findUserByEmail(email: string) {
    const lower = email.trim().toLowerCase();
    const row = this.sqlite.prepare('SELECT * FROM users WHERE lower(email) = ?').get(lower);
    return this.rowToUser(row);
  }

  public saveUser(user: User & { password_hash?: string; password_salt?: string }) {
    this.sqlite
      .prepare(
        `INSERT INTO users (id, email, name, auth_provider, preferences_json, password_hash, password_salt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           auth_provider = excluded.auth_provider,
           preferences_json = excluded.preferences_json,
           password_hash = COALESCE(excluded.password_hash, users.password_hash),
           password_salt = COALESCE(excluded.password_salt, users.password_salt),
           updated_at = excluded.updated_at`
      )
      .run(
        user.id,
        user.email.trim().toLowerCase(),
        user.name,
        user.auth_provider,
        JSON.stringify(user.preferences),
        user.password_hash ?? null,
        user.password_salt ?? null,
        user.created_at,
        user.updated_at
      );
    return user;
  }

  public saveSession(session: AuthSession) {
    this.sqlite
      .prepare(
        `INSERT INTO sessions (token, user_id, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`
      )
      .run(session.token, session.user_id, session.expires_at);
    return session;
  }

  public findSession(token: string) {
    const row = this.sqlite.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as unknown as
      | AuthSession
      | undefined;
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
      this.deleteSession(token);
      return null;
    }
    return row;
  }

  public deleteSession(token: string) {
    this.sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  public setPasswordResetToken(token: string, userId: string, ttlMs = 3600000) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.sqlite
      .prepare(
        `INSERT INTO password_reset_tokens (token, user_id, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`
      )
      .run(token, userId, expiresAt);
  }

  public verifyPasswordResetToken(token: string) {
    const row = this.sqlite
      .prepare('SELECT * FROM password_reset_tokens WHERE token = ?')
      .get(token) as { token: string; user_id: string; expires_at: string } | undefined;
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
      this.consumePasswordResetToken(token);
      return null;
    }
    return row.user_id;
  }

  public consumePasswordResetToken(token: string) {
    this.sqlite.prepare('DELETE FROM password_reset_tokens WHERE token = ?').run(token);
  }

  // --- People (Family & Friends) ---
  public getPeopleForUser(userId: string): Person[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM people WHERE user_id = ? ORDER BY created_at ASC')
      .all(userId);
    return rows.map((r) => this.rowToPerson(r));
  }

  public getPerson(id: string, userId: string): Person | null {
    const row = this.sqlite
      .prepare('SELECT * FROM people WHERE id = ? AND user_id = ?')
      .get(id, userId);
    return row ? this.rowToPerson(row) : null;
  }

  public savePerson(person: Person): Person {
    this.sqlite
      .prepare(
        `INSERT INTO people (
           id, user_id, name, relationship, birth_date, allergies, notes, height, height_unit,
           weight, weight_unit, blood_type, medical_history, current_medications, baseline_bp,
           emergency_contact_name, emergency_contact_phone, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           relationship = excluded.relationship,
           birth_date = excluded.birth_date,
           allergies = excluded.allergies,
           notes = excluded.notes,
           height = excluded.height,
           height_unit = excluded.height_unit,
           weight = excluded.weight,
           weight_unit = excluded.weight_unit,
           blood_type = excluded.blood_type,
           medical_history = excluded.medical_history,
           current_medications = excluded.current_medications,
           baseline_bp = excluded.baseline_bp,
           emergency_contact_name = excluded.emergency_contact_name,
           emergency_contact_phone = excluded.emergency_contact_phone,
           updated_at = excluded.updated_at`
      )
      .run(
        person.id,
        person.user_id,
        person.name,
        person.relationship,
        person.birth_date ?? null,
        person.allergies ?? null,
        person.notes ?? null,
        person.height ?? null,
        person.height_unit ?? null,
        person.weight ?? null,
        person.weight_unit ?? null,
        person.blood_type ?? null,
        person.medical_history ?? null,
        person.current_medications ?? null,
        person.baseline_bp ?? null,
        person.emergency_contact_name ?? null,
        person.emergency_contact_phone ?? null,
        person.created_at,
        person.updated_at
      );
    return person;
  }

  public deletePerson(id: string, userId: string): boolean {
    const person = this.getPerson(id, userId);
    if (!person) return false;

    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.sqlite
        .prepare('DELETE FROM conditions WHERE person_id = ? AND user_id = ?')
        .run(id, userId);
      this.sqlite
        .prepare('DELETE FROM symptoms WHERE person_id = ? AND user_id = ?')
        .run(id, userId);
      this.sqlite
        .prepare('DELETE FROM appointments WHERE person_id = ? AND user_id = ?')
        .run(id, userId);
      this.sqlite
        .prepare('DELETE FROM summaries WHERE person_id = ? AND user_id = ?')
        .run(id, userId);
      this.sqlite
        .prepare('DELETE FROM collaborators WHERE person_id = ? AND user_id = ?')
        .run(id, userId);
      this.sqlite
        .prepare('DELETE FROM vital_logs WHERE person_id = ? AND user_id = ?')
        .run(id, userId);
      this.sqlite.prepare('DELETE FROM people WHERE id = ? AND user_id = ?').run(id, userId);
      this.sqlite.exec('COMMIT');
      return true;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  // --- Conditions / Diseases ---
  public getConditionsForUser(userId: string, personId?: string): Condition[] {
    const rows = personId
      ? this.sqlite
          .prepare('SELECT * FROM conditions WHERE user_id = ? AND person_id = ? ORDER BY created_at ASC')
          .all(userId, personId)
      : this.sqlite
          .prepare('SELECT * FROM conditions WHERE user_id = ? ORDER BY created_at ASC')
          .all(userId);
    return rows.map((r) => this.rowToCondition(r));
  }

  public getCondition(id: string, userId: string): Condition | null {
    const row = this.sqlite
      .prepare('SELECT * FROM conditions WHERE id = ? AND user_id = ?')
      .get(id, userId);
    return row ? this.rowToCondition(row) : null;
  }

  public saveCondition(condition: Condition): Condition {
    this.sqlite
      .prepare(
        `INSERT INTO conditions (
           id, user_id, person_id, name, diagnosed_date, treating_clinician,
           doctor_treatments_json, status, notes, attachments_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           name = excluded.name,
           diagnosed_date = excluded.diagnosed_date,
           treating_clinician = excluded.treating_clinician,
           doctor_treatments_json = excluded.doctor_treatments_json,
           status = excluded.status,
           notes = excluded.notes,
           attachments_json = excluded.attachments_json,
           updated_at = excluded.updated_at`
      )
      .run(
        condition.id,
        condition.user_id,
        condition.person_id,
        condition.name,
        condition.diagnosed_date ?? null,
        condition.treating_clinician ?? null,
        condition.doctor_treatments ? JSON.stringify(condition.doctor_treatments) : null,
        condition.status,
        condition.notes ?? null,
        condition.attachments ? JSON.stringify(condition.attachments) : null,
        condition.created_at,
        condition.updated_at
      );
    return condition;
  }

  public deleteCondition(id: string, userId: string): boolean {
    const res = this.sqlite
      .prepare('DELETE FROM conditions WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  // --- Symptoms ---
  public getSymptomsForUser(
    userId: string,
    filters?: {
      personId?: string;
      conditionId?: string;
      symptomName?: string;
      minSeverity?: number;
      maxSeverity?: number;
      startDate?: string;
      endDate?: string;
      tag?: string;
      search?: string;
    }
  ): SymptomEntry[] {
    const rows = filters?.personId
      ? this.sqlite
          .prepare(
            'SELECT * FROM symptoms WHERE user_id = ? AND person_id = ? ORDER BY start_datetime DESC'
          )
          .all(userId, filters.personId)
      : this.sqlite
          .prepare('SELECT * FROM symptoms WHERE user_id = ? ORDER BY start_datetime DESC')
          .all(userId);

    let results = rows.map((r) => this.rowToSymptom(r));

    if (filters?.conditionId) {
      results = results.filter((s) => s.condition_ids?.includes(filters.conditionId!));
    }

    if (filters?.symptomName) {
      const q = filters.symptomName.toLowerCase().trim();
      results = results.filter((s) => s.symptom_name.toLowerCase().includes(q));
    }

    if (filters?.minSeverity !== undefined) {
      results = results.filter((s) => s.severity_0_to_10 >= filters.minSeverity!);
    }

    if (filters?.maxSeverity !== undefined) {
      results = results.filter((s) => s.severity_0_to_10 <= filters.maxSeverity!);
    }

    if (filters?.startDate) {
      results = results.filter((s) => s.start_datetime >= filters.startDate!);
    }

    if (filters?.endDate) {
      results = results.filter((s) => s.start_datetime <= filters.endDate!);
    }

    if (filters?.tag) {
      const tagLower = filters.tag.toLowerCase();
      results = results.filter((s) => s.tags?.some((t) => t.toLowerCase() === tagLower));
    }

    if (filters?.search) {
      const sq = filters.search.toLowerCase().trim();
      results = results.filter((s) => {
        return (
          s.symptom_name.toLowerCase().includes(sq) ||
          s.description?.toLowerCase().includes(sq) ||
          s.context?.toLowerCase().includes(sq) ||
          s.possible_triggers?.toLowerCase().includes(sq) ||
          s.body_location?.toLowerCase().includes(sq) ||
          s.associated_symptoms?.toLowerCase().includes(sq) ||
          s.daily_impact?.toLowerCase().includes(sq) ||
          s.tags?.some((t) => t.toLowerCase().includes(sq))
        );
      });
    }

    results.sort(
      (a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
    );
    return results;
  }

  public getSymptom(id: string, userId: string): SymptomEntry | null {
    const row = this.sqlite
      .prepare('SELECT * FROM symptoms WHERE id = ? AND user_id = ?')
      .get(id, userId);
    return row ? this.rowToSymptom(row) : null;
  }

  public saveSymptom(symptom: SymptomEntry): SymptomEntry {
    this.sqlite
      .prepare(
        `INSERT INTO symptoms (
           id, user_id, person_id, condition_ids_json, symptom_name, symptoms_list_json,
           start_datetime, end_datetime, ongoing, severity_0_to_10, duration_text, body_location,
           description, context, possible_triggers, better_or_worse_notes, associated_symptoms,
           daily_impact, tags_json, vitals_json, attachments_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           condition_ids_json = excluded.condition_ids_json,
           symptom_name = excluded.symptom_name,
           symptoms_list_json = excluded.symptoms_list_json,
           start_datetime = excluded.start_datetime,
           end_datetime = excluded.end_datetime,
           ongoing = excluded.ongoing,
           severity_0_to_10 = excluded.severity_0_to_10,
           duration_text = excluded.duration_text,
           body_location = excluded.body_location,
           description = excluded.description,
           context = excluded.context,
           possible_triggers = excluded.possible_triggers,
           better_or_worse_notes = excluded.better_or_worse_notes,
           associated_symptoms = excluded.associated_symptoms,
           daily_impact = excluded.daily_impact,
           tags_json = excluded.tags_json,
           vitals_json = excluded.vitals_json,
           attachments_json = excluded.attachments_json,
           updated_at = excluded.updated_at`
      )
      .run(
        symptom.id,
        symptom.user_id,
        symptom.person_id,
        JSON.stringify(symptom.condition_ids || []),
        symptom.symptom_name,
        symptom.symptoms_list ? JSON.stringify(symptom.symptoms_list) : null,
        symptom.start_datetime,
        symptom.end_datetime ?? null,
        symptom.ongoing ? 1 : 0,
        symptom.severity_0_to_10 ?? 0,
        symptom.duration_text ?? null,
        symptom.body_location ?? null,
        symptom.description || '',
        symptom.context ?? null,
        symptom.possible_triggers ?? null,
        symptom.better_or_worse_notes ?? null,
        symptom.associated_symptoms ?? null,
        symptom.daily_impact ?? null,
        JSON.stringify(symptom.tags || []),
        symptom.vitals ? JSON.stringify(symptom.vitals) : null,
        symptom.attachments ? JSON.stringify(symptom.attachments) : null,
        symptom.created_at,
        symptom.updated_at
      );
    return symptom;
  }

  public deleteSymptom(id: string, userId: string): boolean {
    const res = this.sqlite
      .prepare('DELETE FROM symptoms WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  // --- Appointments ---
  public getAppointmentsForUser(userId: string, personId?: string): Appointment[] {
    const rows = personId
      ? this.sqlite
          .prepare(
            'SELECT * FROM appointments WHERE user_id = ? AND person_id = ? ORDER BY appointment_datetime ASC'
          )
          .all(userId, personId)
      : this.sqlite
          .prepare(
            'SELECT * FROM appointments WHERE user_id = ? ORDER BY appointment_datetime ASC'
          )
          .all(userId);
    return rows.map((r) => this.rowToAppointment(r));
  }

  public getAppointment(id: string, userId: string): Appointment | null {
    const row = this.sqlite
      .prepare('SELECT * FROM appointments WHERE id = ? AND user_id = ?')
      .get(id, userId);
    return row ? this.rowToAppointment(row) : null;
  }

  public saveAppointment(appointment: Appointment): Appointment {
    this.sqlite
      .prepare(
        `INSERT INTO appointments (
           id, user_id, person_id, appointment_datetime, clinician_or_clinic,
           appointment_type, location_or_telehealth, notes, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           appointment_datetime = excluded.appointment_datetime,
           clinician_or_clinic = excluded.clinician_or_clinic,
           appointment_type = excluded.appointment_type,
           location_or_telehealth = excluded.location_or_telehealth,
           notes = excluded.notes,
           status = excluded.status,
           updated_at = excluded.updated_at`
      )
      .run(
        appointment.id,
        appointment.user_id,
        appointment.person_id,
        appointment.appointment_datetime,
        appointment.clinician_or_clinic,
        appointment.appointment_type,
        appointment.location_or_telehealth ?? null,
        appointment.notes ?? null,
        appointment.status,
        appointment.created_at,
        appointment.updated_at
      );
    return appointment;
  }

  public deleteAppointment(id: string, userId: string): boolean {
    const res = this.sqlite
      .prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  // --- Summaries ---
  public getSummariesForUser(userId: string, personId?: string): AppointmentSummary[] {
    const rows = personId
      ? this.sqlite
          .prepare(
            'SELECT * FROM summaries WHERE user_id = ? AND person_id = ? ORDER BY created_at DESC'
          )
          .all(userId, personId)
      : this.sqlite
          .prepare('SELECT * FROM summaries WHERE user_id = ? ORDER BY created_at DESC')
          .all(userId);
    return rows.map((r) => this.rowToSummary(r));
  }

  public getSummary(id: string, userId: string): AppointmentSummary | null {
    const row = this.sqlite
      .prepare('SELECT * FROM summaries WHERE id = ? AND user_id = ?')
      .get(id, userId);
    return row ? this.rowToSummary(row) : null;
  }

  public saveSummary(summary: AppointmentSummary): AppointmentSummary {
    this.sqlite
      .prepare(
        `INSERT INTO summaries (
           id, user_id, person_id, appointment_id, title, date_range_start, date_range_end,
           selected_entry_ids_json, custom_questions_json, visit_notes, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           appointment_id = excluded.appointment_id,
           title = excluded.title,
           date_range_start = excluded.date_range_start,
           date_range_end = excluded.date_range_end,
           selected_entry_ids_json = excluded.selected_entry_ids_json,
           custom_questions_json = excluded.custom_questions_json,
           visit_notes = excluded.visit_notes`
      )
      .run(
        summary.id,
        summary.user_id,
        summary.person_id,
        summary.appointment_id ?? null,
        summary.title,
        summary.date_range_start,
        summary.date_range_end,
        JSON.stringify(summary.selected_entry_ids || []),
        JSON.stringify(summary.custom_questions || []),
        summary.visit_notes ?? null,
        summary.created_at
      );
    return summary;
  }

  public deleteSummary(id: string, userId: string): boolean {
    const res = this.sqlite
      .prepare('DELETE FROM summaries WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  // --- Collaborators ---
  public getCollaboratorsForUser(userId: string, personId?: string): Collaborator[] {
    const rows = personId
      ? this.sqlite
          .prepare(
            'SELECT * FROM collaborators WHERE user_id = ? AND person_id = ? ORDER BY created_at ASC'
          )
          .all(userId, personId)
      : this.sqlite
          .prepare('SELECT * FROM collaborators WHERE user_id = ? ORDER BY created_at ASC')
          .all(userId);
    return rows.map((r) => this.rowToCollaborator(r));
  }

  public saveCollaborator(col: Collaborator): Collaborator {
    this.sqlite
      .prepare(
        `INSERT INTO collaborators (
           id, user_id, person_id, email, phone, name, category, relationship_detail,
           role, notes, access_code, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           email = excluded.email,
           phone = excluded.phone,
           name = excluded.name,
           category = excluded.category,
           relationship_detail = excluded.relationship_detail,
           role = excluded.role,
           notes = excluded.notes,
           access_code = excluded.access_code,
           status = excluded.status`
      )
      .run(
        col.id,
        col.user_id,
        col.person_id,
        col.email || '',
        col.phone ?? null,
        col.name,
        col.category ?? null,
        col.relationship_detail ?? null,
        col.role,
        col.notes ?? null,
        col.access_code,
        col.status,
        col.created_at
      );
    return col;
  }

  public deleteCollaborator(id: string, userId: string): boolean {
    const res = this.sqlite
      .prepare('DELETE FROM collaborators WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  // --- Standalone Daily Vital Logs ---
  public getVitalLogsForUser(userId: string, personId?: string): DailyVitalLog[] {
    const rows = personId
      ? this.sqlite
          .prepare(
            'SELECT * FROM vital_logs WHERE user_id = ? AND person_id = ? ORDER BY recorded_at DESC'
          )
          .all(userId, personId)
      : this.sqlite
          .prepare('SELECT * FROM vital_logs WHERE user_id = ? ORDER BY recorded_at DESC')
          .all(userId);
    return rows.map((r) => this.rowToVitalLog(r));
  }

  public getVitalLog(id: string, userId: string): DailyVitalLog | null {
    const row = this.sqlite
      .prepare('SELECT * FROM vital_logs WHERE id = ? AND user_id = ?')
      .get(id, userId);
    return row ? this.rowToVitalLog(row) : null;
  }

  public saveVitalLog(entry: DailyVitalLog): DailyVitalLog {
    this.sqlite
      .prepare(
        `INSERT INTO vital_logs (
           id, user_id, person_id, recorded_at,
           blood_pressure_systolic, blood_pressure_diastolic,
           blood_sugar, blood_sugar_context, blood_sugar_readings_json,
           oxygen_spo2, pulse, temperature, temperature_unit,
           weight, weight_unit, respiratory_rate, remark,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           person_id = excluded.person_id,
           recorded_at = excluded.recorded_at,
           blood_pressure_systolic = excluded.blood_pressure_systolic,
           blood_pressure_diastolic = excluded.blood_pressure_diastolic,
           blood_sugar = excluded.blood_sugar,
           blood_sugar_context = excluded.blood_sugar_context,
           blood_sugar_readings_json = excluded.blood_sugar_readings_json,
           oxygen_spo2 = excluded.oxygen_spo2,
           pulse = excluded.pulse,
           temperature = excluded.temperature,
           temperature_unit = excluded.temperature_unit,
           weight = excluded.weight,
           weight_unit = excluded.weight_unit,
           respiratory_rate = excluded.respiratory_rate,
           remark = excluded.remark,
           updated_at = excluded.updated_at`
      )
      .run(
        entry.id,
        entry.user_id,
        entry.person_id,
        entry.recorded_at,
        entry.blood_pressure_systolic ?? null,
        entry.blood_pressure_diastolic ?? null,
        entry.blood_sugar ?? null,
        entry.blood_sugar_context ?? null,
        entry.blood_sugar_readings ? JSON.stringify(entry.blood_sugar_readings) : null,
        entry.oxygen_spo2 ?? null,
        entry.pulse ?? null,
        entry.temperature ?? null,
        entry.temperature_unit ?? null,
        entry.weight ?? null,
        entry.weight_unit ?? null,
        entry.respiratory_rate ?? null,
        entry.remark ?? null,
        entry.created_at,
        entry.updated_at
      );
    return entry;
  }

  public deleteVitalLog(id: string, userId: string): boolean {
    const res = this.sqlite
      .prepare('DELETE FROM vital_logs WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return Number(res.changes) > 0;
  }

  // --- Atomic Snapshot Restore (for container restart recovery) ---
  public restoreUserWorkspace(payload: {
    user: User & { password_hash?: string; password_salt?: string };
    token: string;
    expires_at: string;
    people: Person[];
    conditions: Condition[];
    symptoms: SymptomEntry[];
    appointments: Appointment[];
    summaries: AppointmentSummary[];
    collaborators: Collaborator[];
    vital_logs?: DailyVitalLog[];
  }) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const uid = payload.user.id;
      this.saveUser(payload.user);
      this.saveSession({
        token: payload.token,
        user_id: uid,
        expires_at: payload.expires_at,
      });

      for (const p of payload.people || []) {
        this.savePerson({ ...p, user_id: uid });
      }
      for (const c of payload.conditions || []) {
        this.saveCondition({ ...c, user_id: uid });
      }
      for (const s of payload.symptoms || []) {
        this.saveSymptom({ ...s, user_id: uid });
      }
      for (const a of payload.appointments || []) {
        this.saveAppointment({ ...a, user_id: uid });
      }
      for (const sum of payload.summaries || []) {
        this.saveSummary({ ...sum, user_id: uid });
      }
      for (const col of payload.collaborators || []) {
        this.saveCollaborator({ ...col, user_id: uid });
      }
      for (const vl of payload.vital_logs || []) {
        this.saveVitalLog({ ...vl, user_id: uid });
      }

      this.sqlite.exec('COMMIT');
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }

  // --- Complete Account Deletion Cascade ---
  public purgeUserAccount(userId: string): boolean {
    const user = this.findUserById(userId);
    if (!user) return false;

    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.sqlite.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM vital_logs WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM symptoms WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM appointments WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM conditions WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM summaries WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM collaborators WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM people WHERE user_id = ?').run(userId);
      this.sqlite.prepare('DELETE FROM users WHERE id = ?').run(userId);
      this.sqlite.exec('COMMIT');
      return true;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }
}

export const db = new DatabaseService();
