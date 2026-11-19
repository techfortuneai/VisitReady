/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { firestoreDb, handleFirestoreError, OperationType } from '../firebase.ts';
import {
  User,
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  AppointmentSummary,
  Collaborator,
  DailyVitalLog,
  Attachment,
} from '../types/index.ts';

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'number' && Number.isNaN(v)) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

function clampString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen);
}

function sanitizeAttachmentsForFirestore(attachments?: Attachment[]): Attachment[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
  let runningBytes = 0;
  const maxDocAttachmentBytes = 680_000;
  const cleaned: Attachment[] = [];

  for (const att of attachments.slice(0, 15)) {
    if (!att || !att.data_url) continue;
    const dataUrl = String(att.data_url);
    if (runningBytes + dataUrl.length > maxDocAttachmentBytes) {
      continue;
    }
    runningBytes += dataUrl.length;
    cleaned.push({
      id: att.id || crypto.randomUUID(),
      file_name: clampString(att.file_name || 'attachment', 200),
      file_size: Number(att.file_size) || dataUrl.length,
      file_type: clampString(att.file_type || 'application/octet-stream', 120),
      category: att.category || 'other',
      uploaded_at: att.uploaded_at || new Date().toISOString(),
      data_url: dataUrl,
      ...(att.notes ? { notes: clampString(att.notes, 500) } : {}),
    });
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export const firestoreData = {
  async ensureUserDoc(fbUser: FirebaseUser): Promise<User> {
    const userPath = `users/${fbUser.uid}`;
    const userRef = doc(firestoreDb, 'users', fbUser.uid);
    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }

    if (snap.exists()) {
      const existing = snap.data() as User;
      // Guarantee default person exists
      const people = await this.getPeople(fbUser.uid);
      if (people.length === 0) {
        await this.createPerson(fbUser.uid, {
          name: existing.name || fbUser.displayName || 'Self',
          relationship: 'Self',
          height_unit: 'cm',
          weight_unit: 'kg',
          notes: 'Primary account holder',
        });
      }
      return existing;
    }

    const now = new Date().toISOString();
    const newUser: User = {
      id: fbUser.uid,
      email: (fbUser.email || '').trim().toLowerCase().slice(0, 200),
      name: (fbUser.displayName || fbUser.email?.split('@')[0] || 'VisitReady User').trim().slice(0, 150),
      auth_provider: 'google',
      created_at: now,
      updated_at: now,
      preferences: {
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        date_format: 'DD/MM/YYYY',
        temperature_unit: 'F',
        weight_unit: 'kg',
        blood_sugar_unit: 'mg/dL',
        reminders_enabled: false,
        high_contrast: false,
      },
    };

    try {
      await setDoc(userRef, stripUndefinedDeep(newUser));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }

    await this.createPerson(fbUser.uid, {
      name: newUser.name,
      relationship: 'Self',
      height_unit: 'cm',
      weight_unit: 'kg',
      notes: 'Primary account holder',
    });

    return newUser;
  },

  async getMe(uid: string): Promise<User> {
    const path = `users/${uid}`;
    try {
      const snap = await getDoc(doc(firestoreDb, 'users', uid));
      if (!snap.exists()) {
        throw new Error('User profile not found in Firestore.');
      }
      return snap.data() as User;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  async updatePreferences(
    uid: string,
    payload: { name?: string; preferences?: Partial<User['preferences']> }
  ): Promise<User> {
    const path = `users/${uid}`;
    try {
      const current = await this.getMe(uid);
      const updated: User = {
        ...current,
        name: payload.name?.trim() ? clampString(payload.name.trim(), 150) : current.name,
        preferences: payload.preferences
          ? { ...current.preferences, ...payload.preferences }
          : current.preferences,
        updated_at: new Date().toISOString(),
      };
      await setDoc(doc(firestoreDb, 'users', uid), stripUndefinedDeep(updated));
      return updated;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  // --- People ---
  async getPeople(uid: string): Promise<Person[]> {
    const path = `users/${uid}/people`;
    try {
      const snap = await getDocs(collection(firestoreDb, 'users', uid, 'people'));
      const list = snap.docs.map((d) => d.data() as Person);
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createPerson(uid: string, input: Partial<Person>): Promise<Person> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/people/${id}`;
    const now = new Date().toISOString();
    const person = stripUndefinedDeep<Person>({
      id,
      user_id: uid,
      name: clampString((input.name || 'Patient').trim(), 150),
      relationship: input.relationship || 'Self',
      birth_date: input.birth_date ? clampString(input.birth_date, 40) : undefined,
      allergies: input.allergies ? clampString(input.allergies.trim(), 1000) : undefined,
      notes: input.notes ? clampString(input.notes.trim(), 4000) : undefined,
      height: input.height ? clampString(String(input.height).trim(), 40) : undefined,
      height_unit: input.height_unit || 'cm',
      weight:
        input.weight !== undefined && input.weight !== null && String(input.weight) !== ''
          ? Number(input.weight)
          : undefined,
      weight_unit: input.weight_unit || 'kg',
      blood_type: input.blood_type ? clampString(input.blood_type.trim(), 20) : undefined,
      medical_history: input.medical_history
        ? clampString(input.medical_history.trim(), 5000)
        : undefined,
      current_medications: input.current_medications
        ? clampString(input.current_medications.trim(), 4000)
        : undefined,
      baseline_bp: input.baseline_bp ? clampString(input.baseline_bp.trim(), 40) : undefined,
      emergency_contact_name: input.emergency_contact_name
        ? clampString(input.emergency_contact_name.trim(), 150)
        : undefined,
      emergency_contact_phone: input.emergency_contact_phone
        ? clampString(input.emergency_contact_phone.trim(), 60)
        : undefined,
      created_at: now,
      updated_at: now,
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'people', id), person);
      return person;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updatePerson(uid: string, id: string, input: Partial<Person>): Promise<Person> {
    const path = `users/${uid}/people/${id}`;
    try {
      const ref = doc(firestoreDb, 'users', uid, 'people', id);
      const existingSnap = await getDoc(ref);
      if (!existingSnap.exists()) throw new Error('Person profile not found.');
      const prev = existingSnap.data() as Person;

      const merged = stripUndefinedDeep<Person>({
        ...prev,
        ...input,
        id: prev.id,
        user_id: uid,
        name: input.name ? clampString(input.name.trim(), 150) : prev.name,
        created_at: prev.created_at,
        updated_at: new Date().toISOString(),
      });

      await setDoc(ref, merged);
      return merged;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deletePerson(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/people/${id}`;
    try {
      const subCollections = [
        'conditions',
        'symptoms',
        'vital_logs',
        'appointments',
        'summaries',
        'collaborators',
      ];
      for (const colName of subCollections) {
        const q = query(
          collection(firestoreDb, 'users', uid, colName),
          where('person_id', '==', id)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(firestoreDb);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(doc(firestoreDb, 'users', uid, 'people', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Conditions ---
  async getConditions(uid: string, personId?: string): Promise<Condition[]> {
    const path = `users/${uid}/conditions`;
    try {
      const ref = collection(firestoreDb, 'users', uid, 'conditions');
      const snap = personId
        ? await getDocs(query(ref, where('person_id', '==', personId)))
        : await getDocs(ref);
      const list = snap.docs.map((d) => d.data() as Condition);
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createCondition(uid: string, input: Partial<Condition>): Promise<Condition> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/conditions/${id}`;
    const now = new Date().toISOString();

    const doctorTreatments = Array.isArray(input.doctor_treatments)
      ? input.doctor_treatments
          .filter((dt) => dt && dt.doctor_name?.trim())
          .slice(0, 30)
          .map((dt) => ({
            id: dt.id || crypto.randomUUID(),
            doctor_name: clampString(dt.doctor_name.trim(), 150),
            ...(dt.specialty_or_clinic?.trim()
              ? { specialty_or_clinic: clampString(dt.specialty_or_clinic.trim(), 200) }
              : {}),
            treatments: Array.isArray(dt.treatments)
              ? dt.treatments
                  .filter((t) => t && t.name?.trim())
                  .slice(0, 30)
                  .map((t) => ({
                    id: t.id || crypto.randomUUID(),
                    name: clampString(t.name.trim(), 200),
                    ...(t.notes?.trim() ? { notes: clampString(t.notes.trim(), 500) } : {}),
                  }))
              : [],
          }))
      : undefined;

    const derivedClinicians =
      doctorTreatments && doctorTreatments.length > 0
        ? doctorTreatments.map((dt) => dt.doctor_name).join(', ')
        : input.treating_clinician?.trim();

    const condition = stripUndefinedDeep<Condition>({
      id,
      user_id: uid,
      person_id: input.person_id!,
      name: clampString((input.name || 'Condition').trim(), 200),
      diagnosed_date: input.diagnosed_date ? clampString(input.diagnosed_date, 40) : undefined,
      treating_clinician: derivedClinicians ? clampString(derivedClinicians, 500) : undefined,
      doctor_treatments:
        doctorTreatments && doctorTreatments.length > 0 ? doctorTreatments : undefined,
      status: input.status || 'active',
      notes: input.notes ? clampString(input.notes.trim(), 5000) : undefined,
      attachments: sanitizeAttachmentsForFirestore(input.attachments),
      created_at: now,
      updated_at: now,
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'conditions', id), condition);
      return condition;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateCondition(uid: string, id: string, input: Partial<Condition>): Promise<Condition> {
    const path = `users/${uid}/conditions/${id}`;
    try {
      const ref = doc(firestoreDb, 'users', uid, 'conditions', id);
      const existingSnap = await getDoc(ref);
      if (!existingSnap.exists()) throw new Error('Condition not found.');
      const prev = existingSnap.data() as Condition;

      const updated = stripUndefinedDeep<Condition>({
        ...prev,
        ...input,
        id: prev.id,
        user_id: uid,
        name: input.name ? clampString(input.name.trim(), 200) : prev.name,
        attachments:
          input.attachments !== undefined
            ? sanitizeAttachmentsForFirestore(input.attachments)
            : prev.attachments,
        created_at: prev.created_at,
        updated_at: new Date().toISOString(),
      });

      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteCondition(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/conditions/${id}`;
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'conditions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Symptoms ---
  async getSymptoms(
    uid: string,
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
  ): Promise<SymptomEntry[]> {
    const path = `users/${uid}/symptoms`;
    try {
      const ref = collection(firestoreDb, 'users', uid, 'symptoms');
      const snap = filters?.personId
        ? await getDocs(query(ref, where('person_id', '==', filters.personId)))
        : await getDocs(ref);
      let results = snap.docs.map((d) => d.data() as SymptomEntry);

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
        const tl = filters.tag.toLowerCase();
        results = results.filter((s) => s.tags?.some((t) => t.toLowerCase() === tl));
      }
      if (filters?.search) {
        const sq = filters.search.toLowerCase().trim();
        results = results.filter(
          (s) =>
            s.symptom_name.toLowerCase().includes(sq) ||
            s.description?.toLowerCase().includes(sq) ||
            s.context?.toLowerCase().includes(sq) ||
            s.possible_triggers?.toLowerCase().includes(sq) ||
            s.body_location?.toLowerCase().includes(sq) ||
            s.associated_symptoms?.toLowerCase().includes(sq) ||
            s.daily_impact?.toLowerCase().includes(sq) ||
            s.tags?.some((t) => t.toLowerCase().includes(sq))
        );
      }

      results.sort(
        (a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
      );
      return results;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createSymptom(uid: string, input: Partial<SymptomEntry>): Promise<SymptomEntry> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/symptoms/${id}`;
    const now = new Date().toISOString();

    const cleanedList = Array.isArray(input.symptoms_list)
      ? input.symptoms_list.map((s) => String(s).trim()).filter(Boolean).slice(0, 30)
      : undefined;

    const resolvedName =
      input.symptom_name?.trim() ||
      (cleanedList && cleanedList.length > 0 ? cleanedList.join(' • ') : '');

    const symptom = stripUndefinedDeep<SymptomEntry>({
      id,
      user_id: uid,
      person_id: input.person_id!,
      condition_ids: Array.isArray(input.condition_ids) ? input.condition_ids.slice(0, 30) : [],
      symptom_name: clampString(resolvedName || 'Symptom Log', 300),
      symptoms_list: cleanedList && cleanedList.length > 0 ? cleanedList : undefined,
      start_datetime: input.start_datetime || now,
      end_datetime: input.ongoing ? undefined : input.end_datetime || undefined,
      ongoing: Boolean(input.ongoing),
      severity_0_to_10: Number(input.severity_0_to_10 ?? 0),
      duration_text: input.duration_text ? clampString(input.duration_text.trim(), 200) : undefined,
      body_location: input.body_location ? clampString(input.body_location.trim(), 300) : undefined,
      description: clampString(input.description || '', 5000),
      context: input.context ? clampString(input.context.trim(), 2000) : undefined,
      possible_triggers: input.possible_triggers
        ? clampString(input.possible_triggers.trim(), 2000)
        : undefined,
      better_or_worse_notes: input.better_or_worse_notes
        ? clampString(input.better_or_worse_notes.trim(), 2000)
        : undefined,
      associated_symptoms: input.associated_symptoms
        ? clampString(input.associated_symptoms.trim(), 2000)
        : undefined,
      daily_impact: input.daily_impact ? clampString(input.daily_impact.trim(), 2000) : undefined,
      tags: Array.isArray(input.tags)
        ? input.tags.map((t) => clampString(String(t).trim(), 100)).filter(Boolean).slice(0, 30)
        : [],
      vitals: input.vitals || undefined,
      attachments: sanitizeAttachmentsForFirestore(input.attachments),
      created_at: now,
      updated_at: now,
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'symptoms', id), symptom);
      return symptom;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateSymptom(uid: string, id: string, input: Partial<SymptomEntry>): Promise<SymptomEntry> {
    const path = `users/${uid}/symptoms/${id}`;
    try {
      const ref = doc(firestoreDb, 'users', uid, 'symptoms', id);
      const existingSnap = await getDoc(ref);
      if (!existingSnap.exists()) throw new Error('Symptom entry not found.');
      const prev = existingSnap.data() as SymptomEntry;

      const updated = stripUndefinedDeep<SymptomEntry>({
        ...prev,
        ...input,
        id: prev.id,
        user_id: uid,
        symptom_name: input.symptom_name
          ? clampString(input.symptom_name.trim(), 300)
          : prev.symptom_name,
        attachments:
          input.attachments !== undefined
            ? sanitizeAttachmentsForFirestore(input.attachments)
            : prev.attachments,
        created_at: prev.created_at,
        updated_at: new Date().toISOString(),
      });

      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteSymptom(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/symptoms/${id}`;
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'symptoms', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Appointments ---
  async getAppointments(uid: string, personId?: string): Promise<Appointment[]> {
    const path = `users/${uid}/appointments`;
    try {
      const ref = collection(firestoreDb, 'users', uid, 'appointments');
      const snap = personId
        ? await getDocs(query(ref, where('person_id', '==', personId)))
        : await getDocs(ref);
      const list = snap.docs.map((d) => d.data() as Appointment);
      list.sort(
        (a, b) =>
          new Date(a.appointment_datetime).getTime() - new Date(b.appointment_datetime).getTime()
      );
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createAppointment(uid: string, input: Partial<Appointment>): Promise<Appointment> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/appointments/${id}`;
    const now = new Date().toISOString();

    const appt = stripUndefinedDeep<Appointment>({
      id,
      user_id: uid,
      person_id: input.person_id!,
      appointment_datetime: input.appointment_datetime || now,
      clinician_or_clinic: clampString((input.clinician_or_clinic || 'Clinic').trim(), 250),
      appointment_type: input.appointment_type || 'Routine Follow-up',
      location_or_telehealth: input.location_or_telehealth
        ? clampString(input.location_or_telehealth.trim(), 300)
        : undefined,
      notes: input.notes ? clampString(input.notes.trim(), 4000) : undefined,
      status: input.status || 'upcoming',
      created_at: now,
      updated_at: now,
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'appointments', id), appt);
      return appt;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateAppointment(
    uid: string,
    id: string,
    input: Partial<Appointment>
  ): Promise<Appointment> {
    const path = `users/${uid}/appointments/${id}`;
    try {
      const ref = doc(firestoreDb, 'users', uid, 'appointments', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Appointment not found.');
      const prev = snap.data() as Appointment;

      const updated = stripUndefinedDeep<Appointment>({
        ...prev,
        ...input,
        id: prev.id,
        user_id: uid,
        created_at: prev.created_at,
        updated_at: new Date().toISOString(),
      });
      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteAppointment(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/appointments/${id}`;
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'appointments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Summaries ---
  async getSummaries(uid: string, personId?: string): Promise<AppointmentSummary[]> {
    const path = `users/${uid}/summaries`;
    try {
      const ref = collection(firestoreDb, 'users', uid, 'summaries');
      const snap = personId
        ? await getDocs(query(ref, where('person_id', '==', personId)))
        : await getDocs(ref);
      const list = snap.docs.map((d) => d.data() as AppointmentSummary);
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createSummary(uid: string, input: Partial<AppointmentSummary>): Promise<AppointmentSummary> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/summaries/${id}`;
    const now = new Date().toISOString();

    const summary = stripUndefinedDeep<AppointmentSummary>({
      id,
      user_id: uid,
      person_id: input.person_id!,
      appointment_id: input.appointment_id || undefined,
      title: clampString((input.title || 'OPD Summary').trim(), 250),
      date_range_start: input.date_range_start || new Date(Date.now() - 30 * 86400000).toISOString(),
      date_range_end: input.date_range_end || now,
      selected_entry_ids: Array.isArray(input.selected_entry_ids)
        ? input.selected_entry_ids.slice(0, 500)
        : [],
      custom_questions: Array.isArray(input.custom_questions)
        ? input.custom_questions.map((q) => clampString(String(q).trim(), 500)).filter(Boolean).slice(0, 50)
        : [],
      visit_notes: input.visit_notes ? clampString(input.visit_notes.trim(), 5000) : undefined,
      created_at: now,
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'summaries', id), summary);
      return summary;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async deleteSummary(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/summaries/${id}`;
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'summaries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Collaborators ---
  async getCollaborators(uid: string, personId?: string): Promise<Collaborator[]> {
    const path = `users/${uid}/collaborators`;
    try {
      const ref = collection(firestoreDb, 'users', uid, 'collaborators');
      const snap = personId
        ? await getDocs(query(ref, where('person_id', '==', personId)))
        : await getDocs(ref);
      const list = snap.docs.map((d) => d.data() as Collaborator);
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createCollaborator(uid: string, input: Partial<Collaborator>): Promise<Collaborator> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/collaborators/${id}`;
    const resolvedCategory =
      input.category || (input.role === 'Doctor / Care Team' ? 'Doctor' : 'Family');
    const code =
      'VR-' + Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, 'X');

    const col = stripUndefinedDeep<Collaborator>({
      id,
      user_id: uid,
      person_id: input.person_id!,
      email: clampString((input.email || '').trim().toLowerCase(), 200),
      phone: input.phone ? clampString(input.phone.trim(), 60) : undefined,
      name: clampString((input.name || 'Contact').trim(), 150),
      category: resolvedCategory,
      relationship_detail: input.relationship_detail
        ? clampString(input.relationship_detail.trim(), 150)
        : undefined,
      role: input.role || (resolvedCategory === 'Doctor' ? 'Doctor / Care Team' : 'Viewer'),
      notes: input.notes ? clampString(input.notes.trim(), 1500) : undefined,
      access_code: code,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'collaborators', id), col);
      return col;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async deleteCollaborator(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/collaborators/${id}`;
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'collaborators', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Standalone Daily Vital Logs ---
  async getVitalLogs(uid: string, personId?: string): Promise<DailyVitalLog[]> {
    const path = `users/${uid}/vital_logs`;
    try {
      const ref = collection(firestoreDb, 'users', uid, 'vital_logs');
      const snap = personId
        ? await getDocs(query(ref, where('person_id', '==', personId)))
        : await getDocs(ref);
      const list = snap.docs.map((d) => d.data() as DailyVitalLog);
      list.sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
      );
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async createVitalLog(uid: string, input: Partial<DailyVitalLog>): Promise<DailyVitalLog> {
    const id = crypto.randomUUID();
    const path = `users/${uid}/vital_logs/${id}`;
    const now = new Date().toISOString();

    const numOrUndef = (v: unknown) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return Number.isNaN(n) ? undefined : n;
    };

    const entry = stripUndefinedDeep<DailyVitalLog>({
      id,
      user_id: uid,
      person_id: input.person_id!,
      recorded_at: input.recorded_at || now,
      blood_pressure_systolic: numOrUndef(input.blood_pressure_systolic),
      blood_pressure_diastolic: numOrUndef(input.blood_pressure_diastolic),
      blood_sugar: numOrUndef(input.blood_sugar),
      blood_sugar_context: input.blood_sugar_context,
      blood_sugar_readings: Array.isArray(input.blood_sugar_readings)
        ? input.blood_sugar_readings.slice(0, 20)
        : undefined,
      oxygen_spo2: numOrUndef(input.oxygen_spo2),
      pulse: numOrUndef(input.pulse),
      temperature: numOrUndef(input.temperature),
      temperature_unit: input.temperature_unit,
      weight: numOrUndef(input.weight),
      weight_unit: input.weight_unit,
      respiratory_rate: numOrUndef(input.respiratory_rate),
      remark: input.remark ? clampString(input.remark.trim(), 2000) : undefined,
      created_at: now,
      updated_at: now,
    });

    try {
      await setDoc(doc(firestoreDb, 'users', uid, 'vital_logs', id), entry);
      return entry;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async updateVitalLog(
    uid: string,
    id: string,
    input: Partial<DailyVitalLog>
  ): Promise<DailyVitalLog> {
    const path = `users/${uid}/vital_logs/${id}`;
    try {
      const ref = doc(firestoreDb, 'users', uid, 'vital_logs', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('Vital log not found.');
      const prev = snap.data() as DailyVitalLog;

      const updated = stripUndefinedDeep<DailyVitalLog>({
        ...prev,
        ...input,
        id: prev.id,
        user_id: uid,
        remark:
          input.remark !== undefined
            ? input.remark.trim()
              ? clampString(input.remark.trim(), 2000)
              : undefined
            : prev.remark,
        created_at: prev.created_at,
        updated_at: new Date().toISOString(),
      });

      await setDoc(ref, updated);
      return updated;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteVitalLog(uid: string, id: string): Promise<void> {
    const path = `users/${uid}/vital_logs/${id}`;
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'vital_logs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // --- Delete entire user account cascade ---
  async deleteAccount(uid: string): Promise<void> {
    const path = `users/${uid}`;
    try {
      const subCols = [
        'symptoms',
        'vital_logs',
        'appointments',
        'conditions',
        'summaries',
        'collaborators',
        'people',
      ];
      for (const colName of subCols) {
        const snap = await getDocs(collection(firestoreDb, 'users', uid, colName));
        if (!snap.empty) {
          const batch = writeBatch(firestoreDb);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(doc(firestoreDb, 'users', uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },
};
