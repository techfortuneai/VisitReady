/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { signInWithPopup, signOut, deleteUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.ts';
import { firestoreData } from './firestoreData.ts';
import {
  localDb,
  WorkspaceSnapshot,
  createLocalPasswordVerifier,
  verifyLocalPassword,
} from './localDb.ts';
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

const TOKEN_KEY = 'visitready_auth_token';
const AUTH_MODE_KEY = 'visitready_auth_mode';

export type AuthMode = 'firebase' | 'server';

class ApiService {
  private token: string | null = null;
  private authMode: AuthMode = 'server';
  private activeUser: User | null = null;
  private restoreInFlight: Promise<boolean> | null = null;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    const savedMode = localStorage.getItem(AUTH_MODE_KEY);
    if (savedMode === 'firebase') {
      this.authMode = 'firebase';
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public getAuthMode(): AuthMode {
    return this.authMode;
  }

  public setAuthMode(mode: AuthMode) {
    this.authMode = mode;
    localStorage.setItem(AUTH_MODE_KEY, mode);
  }

  public isFirebaseMode(): boolean {
    return this.authMode === 'firebase' && Boolean(auth.currentUser);
  }

  private getFirebaseUid(): string {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Firebase user session not ready. Please sign in again.');
    return uid;
  }

  public async persistLocalSnapshot(partial: Partial<WorkspaceSnapshot> & { user?: User }) {
    const user = partial.user || this.activeUser;
    const token = this.token;
    if (!user || !token || this.authMode === 'firebase') return;
    const existing = await localDb.getSnapshotByUserId(user.id);
    await localDb.saveSnapshot({
      userId: user.id,
      email: user.email,
      token,
      verifierHash: partial.verifierHash ?? existing?.verifierHash,
      verifierSalt: partial.verifierSalt ?? existing?.verifierSalt,
      user,
      people: partial.people ?? existing?.people ?? [],
      conditions: partial.conditions ?? existing?.conditions ?? [],
      symptoms: partial.symptoms ?? existing?.symptoms ?? [],
      appointments: partial.appointments ?? existing?.appointments ?? [],
      summaries: partial.summaries ?? existing?.summaries ?? [],
      collaborators: partial.collaborators ?? existing?.collaborators ?? [],
      vital_logs: partial.vital_logs ?? existing?.vital_logs ?? [],
      updatedAt: new Date().toISOString(),
    });
  }

  private async tryRestoreServerSessionFromIdb(): Promise<boolean> {
    if (!this.token || this.authMode === 'firebase') return false;
    if (this.restoreInFlight) return this.restoreInFlight;

    this.restoreInFlight = (async () => {
      try {
        const snap = await localDb.getSnapshotByToken(this.token!);
        if (!snap || !snap.user) return false;

        const res = await fetch('/api/auth/restore-workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: snap.token,
            user: snap.user,
            people: snap.people,
            conditions: snap.conditions,
            symptoms: snap.symptoms,
            appointments: snap.appointments,
            summaries: snap.summaries,
            collaborators: snap.collaborators,
            vital_logs: snap.vital_logs || [],
          }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.token && data.user) {
          this.setToken(data.token);
          this.activeUser = data.user;
          await localDb.saveSnapshot({
            ...snap,
            token: data.token,
            user: data.user,
          });
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.restoreInFlight = null;
      }
    })();

    return this.restoreInFlight;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    allowRestore = true
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      if (allowRestore && this.token) {
        const restored = await this.tryRestoreServerSessionFromIdb();
        if (restored) {
          return this.request<T>(endpoint, options, false);
        }
      }
      this.setToken(null);
      window.dispatchEvent(new CustomEvent('visitready:unauthorized'));
    }

    if (!response.ok) {
      let errMessage = 'Request failed';
      let errCode = '';
      try {
        const data = await response.json();
        errMessage = data.error || data.message || errMessage;
        errCode = data.code || '';
      } catch {
        // fallback
      }
      const err = new Error(errMessage) as Error & { code?: string; status?: number };
      err.code = errCode;
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  // --- Firebase Google Sign-In ---
  public async loginWithGooglePopup(): Promise<{ user: User }> {
    const result = await signInWithPopup(auth, googleProvider);
    this.setAuthMode('firebase');
    this.setToken(null);
    const user = await firestoreData.ensureUserDoc(result.user);
    this.activeUser = user;
    return { user };
  }

  // --- Auth (Server SQLite + IndexedDB Sync) ---
  public async register(payload: {
    email: string;
    password: string;
    name: string;
    acknowledged_safety: boolean;
  }) {
    const data = await this.request<{ token: string; user: User; default_person_id: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      false
    );
    this.setAuthMode('server');
    this.setToken(data.token);
    this.activeUser = data.user;
    const verifier = await createLocalPasswordVerifier(payload.email, payload.password);
    await this.persistLocalSnapshot({
      user: data.user,
      verifierHash: verifier.hash,
      verifierSalt: verifier.salt,
    });
    return data;
  }

  public async login(payload: { email: string; password: string }) {
    try {
      const data = await this.request<{ token: string; user: User }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        false
      );
      this.setAuthMode('server');
      this.setToken(data.token);
      this.activeUser = data.user;
      const verifier = await createLocalPasswordVerifier(payload.email, payload.password);
      await this.persistLocalSnapshot({
        user: data.user,
        verifierHash: verifier.hash,
        verifierSalt: verifier.salt,
      });
      return data;
    } catch (err: any) {
      // If server container restarted cleanly (ACCOUNT_NOT_FOUND), verify against browser IndexedDB backup and restore
      if (err?.code === 'ACCOUNT_NOT_FOUND') {
        const snap = await localDb.getSnapshotByEmail(payload.email);
        if (snap && snap.verifierHash && snap.verifierSalt) {
          const validLocal = await verifyLocalPassword(
            payload.email,
            payload.password,
            snap.verifierHash,
            snap.verifierSalt
          );
          if (validLocal) {
            const res = await fetch('/api/auth/restore-workspace', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: snap.token || 'restore',
                user: snap.user,
                password: payload.password,
                people: snap.people,
                conditions: snap.conditions,
                symptoms: snap.symptoms,
                appointments: snap.appointments,
                summaries: snap.summaries,
                collaborators: snap.collaborators,
                vital_logs: snap.vital_logs || [],
              }),
            });
            if (res.ok) {
              const restored = await res.json();
              this.setAuthMode('server');
              this.setToken(restored.token);
              this.activeUser = restored.user;
              await localDb.saveSnapshot({
                ...snap,
                token: restored.token,
                user: restored.user,
              });
              return { token: restored.token, user: restored.user };
            }
          }
        }
      }
      throw err;
    }
  }

  public async loginGoogle(payload: { email?: string; name?: string }) {
    const data = await this.request<{ token: string; user: User }>(
      '/api/auth/google',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      false
    );
    this.setAuthMode('server');
    this.setToken(data.token);
    this.activeUser = data.user;
    return data;
  }

  public async loginDemo(reset = false) {
    const data = await this.request<{ token: string; user: User }>(
      '/api/auth/demo',
      {
        method: 'POST',
        body: JSON.stringify({ reset }),
      },
      false
    );
    this.setAuthMode('server');
    this.setToken(data.token);
    this.activeUser = data.user;
    return data;
  }

  public async getMe(): Promise<{ user: User }> {
    if (this.isFirebaseMode()) {
      const user = await firestoreData.ensureUserDoc(auth.currentUser!);
      this.activeUser = user;
      return { user };
    }
    const res = await this.request<{ user: User }>('/api/auth/me');
    this.activeUser = res.user;
    await this.persistLocalSnapshot({ user: res.user });
    return res;
  }

  public async updatePreferences(payload: {
    name?: string;
    preferences?: Partial<User['preferences']>;
  }): Promise<{ user: User }> {
    if (this.isFirebaseMode()) {
      const user = await firestoreData.updatePreferences(this.getFirebaseUid(), payload);
      this.activeUser = user;
      return { user };
    }
    const res = await this.request<{ user: User }>('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    this.activeUser = res.user;
    await this.persistLocalSnapshot({ user: res.user });
    return res;
  }

  public async requestPasswordReset(email: string) {
    return this.request<{ message: string; resetToken?: string }>(
      '/api/auth/reset-password-request',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
  }

  public async confirmPasswordReset(payload: { resetToken: string; newPassword: string }) {
    return this.request<{ success: boolean; message: string }>(
      '/api/auth/reset-password-confirm',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  public async logout() {
    if (this.authMode === 'firebase' || auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // ignore
      }
    }
    if (this.token) {
      try {
        await this.request('/api/auth/logout', { method: 'POST' }, false);
      } catch {
        // ignore network errors on logout
      }
    }
    this.setToken(null);
    this.setAuthMode('server');
    this.activeUser = null;
  }

  public async deleteAccount(confirmPhrase: string) {
    if (this.isFirebaseMode()) {
      if (confirmPhrase !== 'DELETE') {
        throw new Error('Please type DELETE to confirm account removal.');
      }
      const uid = this.getFirebaseUid();
      await firestoreData.deleteAccount(uid);
      if (auth.currentUser) {
        try {
          await deleteUser(auth.currentUser);
        } catch {
          await signOut(auth);
        }
      }
      this.setToken(null);
      this.setAuthMode('server');
      this.activeUser = null;
      return { success: true, message: 'Account and cloud health records deleted.' };
    }

    const res = await this.request<{ success: boolean; message: string }>('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirm_phrase: confirmPhrase }),
    });
    if (this.activeUser?.id) {
      await localDb.deleteSnapshot(this.activeUser.id);
    }
    this.setToken(null);
    this.activeUser = null;
    return res;
  }

  // --- People ---
  public async getPeople(): Promise<{ people: Person[] }> {
    if (this.isFirebaseMode()) {
      const people = await firestoreData.getPeople(this.getFirebaseUid());
      return { people };
    }
    const res = await this.request<{ people: Person[] }>('/api/people');
    await this.persistLocalSnapshot({ people: res.people });
    return res;
  }

  public async createPerson(person: Partial<Person>): Promise<{ person: Person }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createPerson(this.getFirebaseUid(), person);
      return { person: created };
    }
    return this.request<{ person: Person }>('/api/people', {
      method: 'POST',
      body: JSON.stringify(person),
    });
  }

  public async updatePerson(id: string, person: Partial<Person>): Promise<{ person: Person }> {
    if (this.isFirebaseMode()) {
      const updated = await firestoreData.updatePerson(this.getFirebaseUid(), id, person);
      return { person: updated };
    }
    return this.request<{ person: Person }>(`/api/people/${id}`, {
      method: 'PUT',
      body: JSON.stringify(person),
    });
  }

  public async deletePerson(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deletePerson(this.getFirebaseUid(), id);
      return { success: true, message: 'Person profile deleted.' };
    }
    return this.request<{ success: boolean; message: string }>(`/api/people/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Conditions ---
  public async getConditions(personId?: string): Promise<{ conditions: Condition[] }> {
    if (this.isFirebaseMode()) {
      const conditions = await firestoreData.getConditions(this.getFirebaseUid(), personId);
      return { conditions };
    }
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    const res = await this.request<{ conditions: Condition[] }>(`/api/conditions${q}`);
    if (!personId) {
      await this.persistLocalSnapshot({ conditions: res.conditions });
    }
    return res;
  }

  public async createCondition(cond: Partial<Condition>): Promise<{ condition: Condition }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createCondition(this.getFirebaseUid(), cond);
      return { condition: created };
    }
    return this.request<{ condition: Condition }>('/api/conditions', {
      method: 'POST',
      body: JSON.stringify(cond),
    });
  }

  public async updateCondition(
    id: string,
    cond: Partial<Condition>
  ): Promise<{ condition: Condition }> {
    if (this.isFirebaseMode()) {
      const updated = await firestoreData.updateCondition(this.getFirebaseUid(), id, cond);
      return { condition: updated };
    }
    return this.request<{ condition: Condition }>(`/api/conditions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(cond),
    });
  }

  public async deleteCondition(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deleteCondition(this.getFirebaseUid(), id);
      return { success: true };
    }
    return this.request<{ success: boolean }>(`/api/conditions/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Symptoms ---
  public async getSymptoms(filters?: {
    personId?: string;
    conditionId?: string;
    symptomName?: string;
    minSeverity?: number;
    maxSeverity?: number;
    startDate?: string;
    endDate?: string;
    tag?: string;
    search?: string;
  }): Promise<{ symptoms: SymptomEntry[] }> {
    if (this.isFirebaseMode()) {
      const symptoms = await firestoreData.getSymptoms(this.getFirebaseUid(), filters);
      return { symptoms };
    }
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
    }
    const q = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ symptoms: SymptomEntry[] }>(`/api/symptoms${q}`);
    if (!filters || (Object.keys(filters).length === 1 && filters.personId)) {
      // Snapshot keeps all symptoms across profiles when fetched globally or merged
      try {
        const allRes = await this.request<{ symptoms: SymptomEntry[] }>('/api/symptoms');
        await this.persistLocalSnapshot({ symptoms: allRes.symptoms });
      } catch {
        await this.persistLocalSnapshot({ symptoms: res.symptoms });
      }
    }
    return res;
  }

  public async createSymptom(entry: Partial<SymptomEntry>): Promise<{ symptom: SymptomEntry }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createSymptom(this.getFirebaseUid(), entry);
      return { symptom: created };
    }
    return this.request<{ symptom: SymptomEntry }>('/api/symptoms', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }

  public async updateSymptom(
    id: string,
    entry: Partial<SymptomEntry>
  ): Promise<{ symptom: SymptomEntry }> {
    if (this.isFirebaseMode()) {
      const updated = await firestoreData.updateSymptom(this.getFirebaseUid(), id, entry);
      return { symptom: updated };
    }
    return this.request<{ symptom: SymptomEntry }>(`/api/symptoms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(entry),
    });
  }

  public async deleteSymptom(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deleteSymptom(this.getFirebaseUid(), id);
      return { success: true, message: 'Symptom entry deleted.' };
    }
    return this.request<{ success: boolean; message: string }>(`/api/symptoms/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Appointments ---
  public async getAppointments(personId?: string): Promise<{ appointments: Appointment[] }> {
    if (this.isFirebaseMode()) {
      const appointments = await firestoreData.getAppointments(this.getFirebaseUid(), personId);
      return { appointments };
    }
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    const res = await this.request<{ appointments: Appointment[] }>(`/api/appointments${q}`);
    try {
      const allRes = personId
        ? await this.request<{ appointments: Appointment[] }>('/api/appointments')
        : res;
      await this.persistLocalSnapshot({ appointments: allRes.appointments });
    } catch {
      // ignore
    }
    return res;
  }

  public async createAppointment(
    appt: Partial<Appointment>
  ): Promise<{ appointment: Appointment }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createAppointment(this.getFirebaseUid(), appt);
      return { appointment: created };
    }
    return this.request<{ appointment: Appointment }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(appt),
    });
  }

  public async updateAppointment(
    id: string,
    appt: Partial<Appointment>
  ): Promise<{ appointment: Appointment }> {
    if (this.isFirebaseMode()) {
      const updated = await firestoreData.updateAppointment(this.getFirebaseUid(), id, appt);
      return { appointment: updated };
    }
    return this.request<{ appointment: Appointment }>(`/api/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(appt),
    });
  }

  public async deleteAppointment(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deleteAppointment(this.getFirebaseUid(), id);
      return { success: true, message: 'Appointment removed.' };
    }
    return this.request<{ success: boolean; message: string }>(`/api/appointments/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Summaries ---
  public async getSummaries(personId?: string): Promise<{ summaries: AppointmentSummary[] }> {
    if (this.isFirebaseMode()) {
      const summaries = await firestoreData.getSummaries(this.getFirebaseUid(), personId);
      return { summaries };
    }
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    const res = await this.request<{ summaries: AppointmentSummary[] }>(`/api/summaries${q}`);
    try {
      const allRes = personId
        ? await this.request<{ summaries: AppointmentSummary[] }>('/api/summaries')
        : res;
      await this.persistLocalSnapshot({ summaries: allRes.summaries });
    } catch {
      // ignore
    }
    return res;
  }

  public async createSummary(
    summary: Partial<AppointmentSummary>
  ): Promise<{ summary: AppointmentSummary }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createSummary(this.getFirebaseUid(), summary);
      return { summary: created };
    }
    return this.request<{ summary: AppointmentSummary }>('/api/summaries', {
      method: 'POST',
      body: JSON.stringify(summary),
    });
  }

  public async deleteSummary(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deleteSummary(this.getFirebaseUid(), id);
      return { success: true };
    }
    return this.request<{ success: boolean }>(`/api/summaries/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Collaborators ---
  public async getCollaborators(personId?: string): Promise<{ collaborators: Collaborator[] }> {
    if (this.isFirebaseMode()) {
      const collaborators = await firestoreData.getCollaborators(this.getFirebaseUid(), personId);
      return { collaborators };
    }
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    const res = await this.request<{ collaborators: Collaborator[] }>(`/api/collaborators${q}`);
    try {
      const allRes = personId
        ? await this.request<{ collaborators: Collaborator[] }>('/api/collaborators')
        : res;
      await this.persistLocalSnapshot({ collaborators: allRes.collaborators });
    } catch {
      // ignore
    }
    return res;
  }

  public async createCollaborator(
    payload: Partial<Collaborator>
  ): Promise<{ collaborator: Collaborator }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createCollaborator(this.getFirebaseUid(), payload);
      return { collaborator: created };
    }
    return this.request<{ collaborator: Collaborator }>('/api/collaborators', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async deleteCollaborator(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deleteCollaborator(this.getFirebaseUid(), id);
      return { success: true };
    }
    return this.request<{ success: boolean }>(`/api/collaborators/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Standalone Daily Vital Logs ---
  public async getVitalLogs(personId?: string): Promise<{ vital_logs: DailyVitalLog[] }> {
    if (this.isFirebaseMode()) {
      const vital_logs = await firestoreData.getVitalLogs(this.getFirebaseUid(), personId);
      return { vital_logs };
    }
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    const res = await this.request<{ vital_logs: DailyVitalLog[] }>(`/api/vitals${q}`);
    try {
      const allRes = personId
        ? await this.request<{ vital_logs: DailyVitalLog[] }>('/api/vitals')
        : res;
      await this.persistLocalSnapshot({ vital_logs: allRes.vital_logs });
    } catch {
      // ignore
    }
    return res;
  }

  public async createVitalLog(
    payload: Partial<DailyVitalLog>
  ): Promise<{ vital_log: DailyVitalLog }> {
    if (this.isFirebaseMode()) {
      const created = await firestoreData.createVitalLog(this.getFirebaseUid(), payload);
      return { vital_log: created };
    }
    return this.request<{ vital_log: DailyVitalLog }>('/api/vitals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateVitalLog(
    id: string,
    payload: Partial<DailyVitalLog>
  ): Promise<{ vital_log: DailyVitalLog }> {
    if (this.isFirebaseMode()) {
      const updated = await firestoreData.updateVitalLog(this.getFirebaseUid(), id, payload);
      return { vital_log: updated };
    }
    return this.request<{ vital_log: DailyVitalLog }>(`/api/vitals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async deleteVitalLog(id: string) {
    if (this.isFirebaseMode()) {
      await firestoreData.deleteVitalLog(this.getFirebaseUid(), id);
      return { success: true };
    }
    return this.request<{ success: boolean }>(`/api/vitals/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Exports (works for both Firestore and SQLite) ---
  public async exportWorkspaceJson(personId?: string): Promise<string> {
    const [
      { user },
      { people },
      { conditions },
      { symptoms },
      { vital_logs },
      { appointments },
      { summaries },
    ] = await Promise.all([
      this.getMe(),
      this.getPeople(),
      this.getConditions(personId),
      this.getSymptoms(personId ? { personId } : undefined),
      this.getVitalLogs(personId),
      this.getAppointments(personId),
      this.getSummaries(personId),
    ]);

    const filteredPeople = personId ? people.filter((p) => p.id === personId) : people;

    return JSON.stringify(
      {
        app: 'VisitReady',
        exported_at: new Date().toISOString(),
        user: { name: user.name, email: user.email },
        people: filteredPeople,
        conditions,
        symptoms,
        vital_logs,
        appointments,
        summaries,
        disclaimer:
          'VisitReady is for personal recordkeeping only. It does not provide medical advice, diagnosis, or triage.',
      },
      null,
      2
    );
  }

  public async exportSymptomsCsv(personId?: string): Promise<string> {
    const [{ people }, { symptoms }] = await Promise.all([
      this.getPeople(),
      this.getSymptoms(personId ? { personId } : undefined),
    ]);
    const peopleMap = new Map(people.map((p) => [p.id, p.name]));

    const headers = [
      'Date & Time',
      'Person',
      'Symptom Name',
      'Severity (0-10)',
      'Ongoing',
      'Duration',
      'Body Location',
      'Description',
      'Context & Activity',
      'Possible Triggers (User Observation)',
      'Better or Worse Notes',
      'Associated Symptoms',
      'Daily Impact',
      'Systolic BP',
      'Diastolic BP',
      'Pulse (BPM)',
      'Temp',
      'Temp Unit',
      'Blood Sugar (mg/dL)',
      'Blood Sugar Context',
      'Oxygen (SpO2 %)',
      'Tags',
    ];

    const escapeCsv = (val: unknown) => {
      if (val === undefined || val === null) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    };

    const rows = symptoms.map((s) => {
      const sugarReadings =
        s.vitals?.blood_sugar_readings && s.vitals.blood_sugar_readings.length > 0
          ? s.vitals.blood_sugar_readings
          : s.vitals?.blood_sugar
          ? [
              {
                value: s.vitals.blood_sugar,
                context: s.vitals.blood_sugar_context || 'fasting',
                time_note: undefined,
              },
            ]
          : [];
      const sugarValues = sugarReadings.map((r) => r.value).join('; ');
      const sugarContexts = sugarReadings
        .map((r) => `${r.value} (${r.context}${r.time_note ? ` @ ${r.time_note}` : ''})`)
        .join('; ');
      return [
        escapeCsv(s.start_datetime),
        escapeCsv(peopleMap.get(s.person_id) || 'Unknown'),
        escapeCsv(s.symptom_name),
        escapeCsv(s.severity_0_to_10),
        escapeCsv(s.ongoing ? 'Yes' : 'No'),
        escapeCsv(s.duration_text || ''),
        escapeCsv(s.body_location || ''),
        escapeCsv(s.description || ''),
        escapeCsv(s.context || ''),
        escapeCsv(s.possible_triggers || ''),
        escapeCsv(s.better_or_worse_notes || ''),
        escapeCsv(s.associated_symptoms || ''),
        escapeCsv(s.daily_impact || ''),
        escapeCsv(s.vitals?.blood_pressure_systolic ?? ''),
        escapeCsv(s.vitals?.blood_pressure_diastolic ?? ''),
        escapeCsv(s.vitals?.pulse ?? ''),
        escapeCsv(s.vitals?.temperature ?? ''),
        escapeCsv(s.vitals?.temperature_unit ?? ''),
        escapeCsv(sugarValues),
        escapeCsv(sugarContexts),
        escapeCsv(s.vitals?.oxygen_spo2 ?? ''),
        escapeCsv(s.tags?.join('; ') || ''),
      ];
    });

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  public getExportJsonUrl(personId?: string): string {
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    return `/api/export/json${q}`;
  }

  public getExportCsvUrl(personId?: string): string {
    const q = personId ? `?personId=${encodeURIComponent(personId)}` : '';
    return `/api/export/csv${q}`;
  }
}

export const api = new ApiService();
