/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { db } from './src/server/db.ts';
import {
  requireAuth,
  AuthenticatedRequest,
  hashPassword,
  verifyPassword,
  generateToken,
  seedDemoData,
} from './src/server/auth.ts';
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
  Vitals,
  BloodSugarContext,
  BloodSugarReading,
} from './src/types/index.ts';

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'VisitReady',
    notice: 'Personal recordkeeping only. Not for emergencies or medical diagnosis.',
  });
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { email, password, name, acknowledged_safety } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (!acknowledged_safety) {
      return res.status(400).json({
        error: 'Please acknowledge the safety and privacy notice before creating an account.',
      });
    }

    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const { hash, salt } = hashPassword(password);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newUser: User & { password_hash: string; password_salt: string } = {
      id: userId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      auth_provider: 'email',
      created_at: now,
      updated_at: now,
      password_hash: hash,
      password_salt: salt,
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

    db.saveUser(newUser);

    const selfPerson: Person = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: name.trim(),
      relationship: 'Self',
      height_unit: 'cm',
      weight_unit: 'kg',
      notes: 'Primary account holder',
      created_at: now,
      updated_at: now,
    };
    db.savePerson(selfPerson);

    const token = generateToken();
    db.saveSession({
      token,
      user_id: userId,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    });

    const { password_hash: _h, password_salt: _s, ...cleanUser } = newUser;
    return res.status(201).json({ token, user: cleanUser, default_person_id: selfPerson.id });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Unable to complete registration. Please try again.' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userWithSecrets = db.findUserByEmail(email);
    if (!userWithSecrets) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'ACCOUNT_NOT_FOUND',
      });
    }
    if (!userWithSecrets.password_hash || !userWithSecrets.password_salt) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'INVALID_PASSWORD',
      });
    }

    const isValid = verifyPassword(
      password,
      userWithSecrets.password_hash,
      userWithSecrets.password_salt
    );
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'INVALID_PASSWORD',
      });
    }

    const token = generateToken();
    db.saveSession({
      token,
      user_id: userWithSecrets.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    });

    const { password_hash: _h, password_salt: _s, ...cleanUser } = userWithSecrets;
    return res.json({ token, user: cleanUser });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  }
});

app.post('/api/auth/google', (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;
    const resolvedEmail = (email || 'google.user@example.in').trim().toLowerCase();
    const resolvedName = (name || 'Google User').trim();

    let user = db.findUserByEmail(resolvedEmail);
    const now = new Date().toISOString();

    if (!user) {
      const userId = crypto.randomUUID();
      user = {
        id: userId,
        email: resolvedEmail,
        name: resolvedName,
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
      db.saveUser(user);

      const selfPerson: Person = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: resolvedName,
        relationship: 'Self',
        height_unit: 'cm',
        weight_unit: 'kg',
        notes: 'Signed in via Google',
        created_at: now,
        updated_at: now,
      };
      db.savePerson(selfPerson);
    }

    const token = generateToken();
    db.saveSession({
      token,
      user_id: user.id,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    });

    return res.json({ token, user });
  } catch (err: any) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Google sign-in could not be completed.' });
  }
});

app.post('/api/auth/demo', (req: Request, res: Response) => {
  try {
    const forceReset = Boolean(req.body?.reset);
    const { token, user } = seedDemoData(forceReset);
    return res.json({ token, user });
  } catch (err: any) {
    console.error('Demo seed error:', err);
    return res.status(500).json({ error: 'Demo mode failed to load.' });
  }
});

app.post('/api/auth/restore-workspace', (req: Request, res: Response) => {
  try {
    const {
      token,
      user,
      password,
      people,
      conditions,
      symptoms,
      appointments,
      summaries,
      collaborators,
      vital_logs,
    } = req.body || {};

    if (!token || typeof token !== 'string' || !user?.id || !user?.email) {
      return res.status(400).json({ error: 'Invalid workspace snapshot payload.' });
    }

    const existingById = db.findUserById(user.id);
    const existingByEmail = db.findUserByEmail(user.email);
    if (existingById || existingByEmail) {
      const targetUser = existingById || existingByEmail!;
      const activeSession = db.findSession(token);
      if (activeSession && activeSession.user_id === targetUser.id) {
        const { password_hash: _h, password_salt: _s, ...clean } = targetUser as any;
        return res.json({ token, user: clean, restored: false });
      }
      return res.status(409).json({
        error: 'Account already exists on server.',
        code: 'ACCOUNT_EXISTS',
      });
    }

    const cred =
      typeof password === 'string' && password.length >= 8
        ? hashPassword(password)
        : undefined;

    const newToken = generateToken();
    const restoredUser: User & { password_hash?: string; password_salt?: string } = {
      id: user.id,
      email: String(user.email).trim().toLowerCase(),
      name: String(user.name || 'VisitReady User').trim(),
      auth_provider: user.auth_provider || 'email',
      created_at: user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      preferences: user.preferences || {
        time_zone: 'Asia/Kolkata',
        date_format: 'DD/MM/YYYY',
        temperature_unit: 'F',
        weight_unit: 'kg',
        blood_sugar_unit: 'mg/dL',
        reminders_enabled: false,
        high_contrast: false,
      },
      ...(cred ? { password_hash: cred.hash, password_salt: cred.salt } : {}),
    };

    db.restoreUserWorkspace({
      user: restoredUser,
      token: newToken,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      people: Array.isArray(people) ? people : [],
      conditions: Array.isArray(conditions) ? conditions : [],
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      appointments: Array.isArray(appointments) ? appointments : [],
      summaries: Array.isArray(summaries) ? summaries : [],
      collaborators: Array.isArray(collaborators) ? collaborators : [],
      vital_logs: Array.isArray(vital_logs) ? vital_logs : [],
    });

    const { password_hash: _h, password_salt: _s, ...cleanUser } = restoredUser;
    return res.json({ token: newToken, user: cleanUser, restored: true });
  } catch (err: any) {
    console.error('Restore workspace error:', err);
    return res.status(500).json({ error: 'Unable to restore workspace.' });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { password_hash: _h, password_salt: _s, ...cleanUser } = req.user as any;
  return res.json({ user: cleanUser });
});

app.put('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, preferences } = req.body;

    if (name) user.name = name.trim();
    if (preferences) {
      user.preferences = {
        ...user.preferences,
        ...preferences,
      };
    }
    user.updated_at = new Date().toISOString();
    db.saveUser(user as any);

    const { password_hash: _h, password_salt: _s, ...cleanUser } = user as any;
    return res.json({ user: cleanUser });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update preferences.' });
  }
});

app.post('/api/auth/reset-password-request', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const user = db.findUserByEmail(email);
  if (!user) {
    return res.json({
      message: 'If an account matches that email, a reset link/token has been prepared.',
    });
  }

  const resetToken = crypto.randomBytes(16).toString('hex');
  db.setPasswordResetToken(resetToken, user.id);

  return res.json({
    message: 'Reset instructions generated. Use the verification token below to set a new password.',
    resetToken,
  });
});

app.post('/api/auth/reset-password-confirm', (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Valid reset token and password (8+ chars) required.' });
  }

  const userId = db.verifyPasswordResetToken(resetToken);
  if (!userId) {
    return res.status(400).json({ error: 'Reset token is invalid or expired.' });
  }

  const user = db.findUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const { hash, salt } = hashPassword(newPassword);
  (user as any).password_hash = hash;
  (user as any).password_salt = salt;
  user.updated_at = new Date().toISOString();
  db.saveUser(user as any);
  db.consumePasswordResetToken(resetToken);

  return res.json({ success: true, message: 'Password updated successfully.' });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    db.deleteSession(authHeader.substring(7));
  }
  return res.json({ success: true });
});

app.delete('/api/auth/account', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { confirm_phrase } = req.body || {};
  if (
    confirm_phrase !== 'DELETE' &&
    confirm_phrase !== 'DELETE MY ACCOUNT AND HEALTH RECORDS'
  ) {
    return res.status(400).json({ error: 'Confirmation phrase does not match.' });
  }
  const ok = db.purgeUserAccount(req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ success: true, message: 'Account and all records permanently deleted.' });
});

// --- PEOPLE ROUTES ---

app.get('/api/people', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const people = db.getPeopleForUser(req.user!.id);
  return res.json({ people });
});

app.post('/api/people', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      relationship,
      birth_date,
      allergies,
      notes,
      height,
      height_unit,
      weight,
      weight_unit,
      blood_type,
      medical_history,
      current_medications,
      baseline_bp,
      emergency_contact_name,
      emergency_contact_phone,
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Patient name is required.' });
    }

    const now = new Date().toISOString();
    const person: Person = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      name: name.trim(),
      relationship: relationship || 'Other',
      birth_date: birth_date || undefined,
      allergies: allergies?.trim() || undefined,
      notes: notes?.trim() || undefined,
      height: height?.trim() || undefined,
      height_unit: height_unit || 'cm',
      weight: weight !== undefined && weight !== '' ? Number(weight) : undefined,
      weight_unit: weight_unit || 'kg',
      blood_type: blood_type || undefined,
      medical_history: medical_history?.trim() || undefined,
      current_medications: current_medications?.trim() || undefined,
      baseline_bp: baseline_bp?.trim() || undefined,
      emergency_contact_name: emergency_contact_name?.trim() || undefined,
      emergency_contact_phone: emergency_contact_phone?.trim() || undefined,
      created_at: now,
      updated_at: now,
    };

    db.savePerson(person);
    return res.status(201).json({ person });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create patient profile.' });
  }
});

app.put('/api/people/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getPerson(String(req.params.id), req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Patient profile not found.' });

  const fields = [
    'name',
    'relationship',
    'birth_date',
    'allergies',
    'notes',
    'height',
    'height_unit',
    'weight',
    'weight_unit',
    'blood_type',
    'medical_history',
    'current_medications',
    'baseline_bp',
    'emergency_contact_name',
    'emergency_contact_phone',
  ] as const;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      (existing as any)[f] =
        typeof req.body[f] === 'string' ? req.body[f].trim() || undefined : req.body[f];
    }
  }
  if (!existing.name) {
    return res.status(400).json({ error: 'Patient name cannot be empty.' });
  }
  existing.updated_at = new Date().toISOString();
  db.savePerson(existing);
  return res.json({ person: existing });
});

app.delete('/api/people/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const all = db.getPeopleForUser(req.user!.id);
  if (all.length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the last remaining patient profile.' });
  }
  const ok = db.deletePerson(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Patient profile not found.' });
  return res.json({ success: true, message: 'Patient profile deleted.' });
});

// --- CONDITIONS / DISEASES ROUTES ---

app.get('/api/conditions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const personId = req.query.personId as string | undefined;
  const list = db.getConditionsForUser(req.user!.id, personId);
  return res.json({ conditions: list });
});

function sanitizeDoctorTreatments(raw: any): Condition['doctor_treatments'] {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = raw
    .map((plan: any) => {
      const doctorName = typeof plan?.doctor_name === 'string' ? plan.doctor_name.trim() : '';
      const specialty =
        typeof plan?.specialty_or_clinic === 'string'
          ? plan.specialty_or_clinic.trim() || undefined
          : undefined;
      const treatments = Array.isArray(plan?.treatments)
        ? plan.treatments
            .map((t: any) => ({
              id: typeof t?.id === 'string' && t.id ? t.id : crypto.randomUUID(),
              name: typeof t?.name === 'string' ? t.name.trim() : '',
              notes: typeof t?.notes === 'string' ? t.notes.trim() || undefined : undefined,
            }))
            .filter((t: any) => t.name.length > 0)
        : [];

      if (!doctorName && treatments.length === 0) return null;
      return {
        id: typeof plan?.id === 'string' && plan.id ? plan.id : crypto.randomUUID(),
        doctor_name: doctorName || 'Consulting Doctor',
        specialty_or_clinic: specialty,
        treatments,
      };
    })
    .filter(Boolean) as NonNullable<Condition['doctor_treatments']>;

  return cleaned.length > 0 ? cleaned : undefined;
}

const VALID_ATTACHMENT_CATEGORIES = new Set([
  'lab_report',
  'prescription',
  'clinical_summary',
  'photo',
  'other',
]);

function sanitizeAttachments(raw: any): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((att: any) => {
      const fileName = typeof att?.file_name === 'string' ? att.file_name.trim() : '';
      const dataUrl = typeof att?.data_url === 'string' ? att.data_url.trim() : '';
      if (!fileName || !dataUrl) return null;
      const rawCat = typeof att?.category === 'string' ? att.category : 'other';
      const category = (VALID_ATTACHMENT_CATEGORIES.has(rawCat)
        ? rawCat
        : 'other') as Attachment['category'];
      return {
        id: typeof att?.id === 'string' && att.id ? att.id : crypto.randomUUID(),
        file_name: fileName,
        file_size: typeof att?.file_size === 'number' && Number.isFinite(att.file_size) ? att.file_size : 0,
        file_type: typeof att?.file_type === 'string' ? att.file_type : 'application/octet-stream',
        category,
        uploaded_at:
          typeof att?.uploaded_at === 'string' && att.uploaded_at
            ? att.uploaded_at
            : new Date().toISOString(),
        data_url: dataUrl,
        notes: typeof att?.notes === 'string' ? att.notes.trim() || undefined : undefined,
      } as Attachment;
    })
    .filter(Boolean) as Attachment[];
}

app.post('/api/conditions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      person_id,
      name,
      diagnosed_date,
      treating_clinician,
      doctor_treatments,
      status,
      notes,
      attachments,
    } = req.body;
    if (!person_id || !name?.trim()) {
      return res.status(400).json({ error: 'Patient and disease/condition name are required.' });
    }
    const person = db.getPerson(person_id, req.user!.id);
    if (!person) return res.status(403).json({ error: 'Invalid patient selected.' });

    const sanitizedPlans = sanitizeDoctorTreatments(doctor_treatments);
    const sanitizedAttachments = sanitizeAttachments(attachments);
    const derivedClinician =
      sanitizedPlans && sanitizedPlans.length > 0
        ? sanitizedPlans.map((p) => p.doctor_name).join(', ')
        : treating_clinician?.trim() || undefined;

    const now = new Date().toISOString();
    const cond: Condition = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      person_id,
      name: name.trim(),
      diagnosed_date: diagnosed_date || undefined,
      treating_clinician: derivedClinician,
      doctor_treatments: sanitizedPlans,
      status: status || 'active',
      notes: notes?.trim() || undefined,
      attachments: sanitizedAttachments,
      created_at: now,
      updated_at: now,
    };

    db.saveCondition(cond);
    return res.status(201).json({ condition: cond });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save condition.' });
  }
});

app.put('/api/conditions/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getCondition(String(req.params.id), req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Condition not found.' });

  const {
    name,
    diagnosed_date,
    treating_clinician,
    doctor_treatments,
    status,
    notes,
    attachments,
  } = req.body;
  if (name !== undefined) existing.name = name.trim();
  if (diagnosed_date !== undefined) existing.diagnosed_date = diagnosed_date || undefined;
  if (doctor_treatments !== undefined) {
    const sanitizedPlans = sanitizeDoctorTreatments(doctor_treatments);
    existing.doctor_treatments = sanitizedPlans;
    if (sanitizedPlans && sanitizedPlans.length > 0) {
      existing.treating_clinician = sanitizedPlans.map((p) => p.doctor_name).join(', ');
    } else if (treating_clinician === undefined) {
      existing.treating_clinician = undefined;
    }
  }
  if (treating_clinician !== undefined) {
    existing.treating_clinician = treating_clinician?.trim() || undefined;
  }
  if (status !== undefined) existing.status = status;
  if (notes !== undefined) existing.notes = notes?.trim() || undefined;
  if (attachments !== undefined) {
    existing.attachments = sanitizeAttachments(attachments);
  }
  existing.updated_at = new Date().toISOString();

  db.saveCondition(existing);
  return res.json({ condition: existing });
});

app.delete('/api/conditions/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ok = db.deleteCondition(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Condition not found.' });
  return res.json({ success: true });
});

const VALID_SUGAR_CONTEXTS = new Set<BloodSugarContext>([
  'fasting',
  'non-fasting',
  'random',
  'post-meal',
  'bedtime',
]);

function sanitizeVitals(raw: any): Vitals | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const toNum = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  };

  let readings: BloodSugarReading[] = [];
  if (Array.isArray(raw.blood_sugar_readings)) {
    readings = raw.blood_sugar_readings
      .map((item: any) => {
        const val = toNum(item?.value);
        if (val === undefined || val <= 0) return null;
        const ctx: BloodSugarContext = VALID_SUGAR_CONTEXTS.has(item?.context)
          ? item.context
          : 'fasting';
        const reading: BloodSugarReading = {
          id: typeof item?.id === 'string' && item.id ? item.id : crypto.randomUUID(),
          value: val,
          context: ctx,
          time_note:
            typeof item?.time_note === 'string' && item.time_note.trim()
              ? item.time_note.trim()
              : undefined,
        };
        return reading;
      })
      .filter(Boolean) as BloodSugarReading[];
  }

  const singleSugar = toNum(raw.blood_sugar);
  const singleCtx: BloodSugarContext = VALID_SUGAR_CONTEXTS.has(raw.blood_sugar_context)
    ? raw.blood_sugar_context
    : 'fasting';

  if (readings.length === 0 && singleSugar !== undefined && singleSugar > 0) {
    readings = [
      {
        id: crypto.randomUUID(),
        value: singleSugar,
        context: singleCtx,
      },
    ];
  }

  const sanitized: Vitals = {
    blood_pressure_systolic: toNum(raw.blood_pressure_systolic),
    blood_pressure_diastolic: toNum(raw.blood_pressure_diastolic),
    temperature: toNum(raw.temperature),
    temperature_unit: raw.temperature_unit === 'C' ? 'C' : raw.temperature_unit === 'F' ? 'F' : undefined,
    pulse: toNum(raw.pulse),
    blood_sugar: readings.length > 0 ? readings[0].value : undefined,
    blood_sugar_context: readings.length > 0 ? readings[0].context : undefined,
    blood_sugar_readings: readings.length > 0 ? readings : undefined,
    oxygen_spo2: toNum(raw.oxygen_spo2),
    weight: toNum(raw.weight),
    weight_unit: raw.weight_unit === 'lbs' ? 'lbs' : raw.weight_unit === 'kg' ? 'kg' : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() || undefined : undefined,
  };

  const hasAnyValue = Object.values(sanitized).some((val) =>
    Array.isArray(val) ? val.length > 0 : val !== undefined
  );
  return hasAnyValue ? sanitized : undefined;
}

// --- SYMPTOMS ROUTES ---

app.get('/api/symptoms', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const filters = {
    personId: req.query.personId as string | undefined,
    conditionId: req.query.conditionId as string | undefined,
    symptomName: req.query.symptomName as string | undefined,
    minSeverity: req.query.minSeverity ? Number(req.query.minSeverity) : undefined,
    maxSeverity: req.query.maxSeverity ? Number(req.query.maxSeverity) : undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    tag: req.query.tag as string | undefined,
    search: req.query.search as string | undefined,
  };
  const symptoms = db.getSymptomsForUser(req.user!.id, filters);
  return res.json({ symptoms });
});

app.post('/api/symptoms', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      person_id,
      condition_ids,
      symptom_name,
      symptoms_list,
      start_datetime,
      end_datetime,
      ongoing,
      severity_0_to_10,
      duration_text,
      body_location,
      description,
      context,
      possible_triggers,
      better_or_worse_notes,
      associated_symptoms,
      daily_impact,
      tags,
      vitals,
      attachments,
    } = req.body;

    const cleanedList = Array.isArray(symptoms_list)
      ? symptoms_list
          .map((s: any) => (typeof s === 'string' ? s.trim() : ''))
          .filter((s: string) => s.length > 0)
      : undefined;
    const resolvedName =
      typeof symptom_name === 'string' && symptom_name.trim()
        ? symptom_name.trim()
        : cleanedList && cleanedList.length > 0
        ? cleanedList.join(' • ')
        : '';

    if (!person_id || !resolvedName || !start_datetime) {
      return res.status(400).json({ error: 'Patient, symptom note, and date/time are required.' });
    }

    const person = db.getPerson(person_id, req.user!.id);
    if (!person) return res.status(403).json({ error: 'Invalid patient selected.' });

    const now = new Date().toISOString();
    const entry: SymptomEntry = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      person_id,
      condition_ids: Array.isArray(condition_ids) ? condition_ids : [],
      symptom_name: resolvedName,
      symptoms_list: cleanedList && cleanedList.length > 0 ? cleanedList : [resolvedName],
      start_datetime,
      end_datetime: end_datetime || undefined,
      ongoing: Boolean(ongoing),
      severity_0_to_10: typeof severity_0_to_10 === 'number' ? severity_0_to_10 : 3,
      duration_text: duration_text?.trim() || undefined,
      body_location: body_location?.trim() || undefined,
      description: description?.trim() || '',
      context: context?.trim() || undefined,
      possible_triggers: possible_triggers?.trim() || undefined,
      better_or_worse_notes: better_or_worse_notes?.trim() || undefined,
      associated_symptoms: associated_symptoms?.trim() || undefined,
      daily_impact: daily_impact?.trim() || undefined,
      tags: Array.isArray(tags) ? tags : [],
      vitals: sanitizeVitals(vitals),
      attachments: sanitizeAttachments(attachments),
      created_at: now,
      updated_at: now,
    };

    db.saveSymptom(entry);
    return res.status(201).json({ symptom: entry });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save symptom entry.' });
  }
});

app.put('/api/symptoms/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getSymptom(String(req.params.id), req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Symptom entry not found.' });

  const fields = [
    'person_id',
    'condition_ids',
    'symptom_name',
    'symptoms_list',
    'start_datetime',
    'end_datetime',
    'ongoing',
    'severity_0_to_10',
    'duration_text',
    'body_location',
    'description',
    'context',
    'possible_triggers',
    'better_or_worse_notes',
    'associated_symptoms',
    'daily_impact',
    'tags',
    'vitals',
    'attachments',
  ] as const;

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      if (f === 'symptoms_list' && Array.isArray(req.body[f])) {
        const cleaned = req.body[f]
          .map((s: any) => (typeof s === 'string' ? s.trim() : ''))
          .filter((s: string) => s.length > 0);
        existing.symptoms_list = cleaned;
        if (cleaned.length > 0 && !req.body.symptom_name) {
          existing.symptom_name = cleaned.join(' • ');
        }
      } else if (f === 'attachments') {
        existing.attachments = sanitizeAttachments(req.body[f]);
      } else if (f === 'vitals') {
        existing.vitals = sanitizeVitals(req.body[f]);
      } else {
        (existing as any)[f] =
          typeof req.body[f] === 'string' && f !== 'description'
            ? req.body[f].trim() || undefined
            : req.body[f];
      }
    }
  }
  existing.updated_at = new Date().toISOString();
  db.saveSymptom(existing);
  return res.json({ symptom: existing });
});

app.delete('/api/symptoms/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ok = db.deleteSymptom(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Symptom entry not found.' });
  return res.json({ success: true, message: 'Symptom entry deleted.' });
});

// --- APPOINTMENTS ROUTES ---

app.get('/api/appointments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const personId = req.query.personId as string | undefined;
  const list = db.getAppointmentsForUser(req.user!.id, personId);
  return res.json({ appointments: list });
});

app.post('/api/appointments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      person_id,
      appointment_datetime,
      clinician_or_clinic,
      appointment_type,
      location_or_telehealth,
      notes,
      status,
    } = req.body;

    if (!person_id || !appointment_datetime || !clinician_or_clinic?.trim()) {
      return res
        .status(400)
        .json({ error: 'Patient, appointment date/time, and doctor/clinic name are required.' });
    }

    const person = db.getPerson(person_id, req.user!.id);
    if (!person) return res.status(403).json({ error: 'Invalid patient selected.' });

    const now = new Date().toISOString();
    const appt: Appointment = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      person_id,
      appointment_datetime,
      clinician_or_clinic: clinician_or_clinic.trim(),
      appointment_type: appointment_type || 'Routine Follow-up',
      location_or_telehealth: location_or_telehealth?.trim() || undefined,
      notes: notes?.trim() || undefined,
      status: status || 'upcoming',
      created_at: now,
      updated_at: now,
    };

    db.saveAppointment(appt);
    return res.status(201).json({ appointment: appt });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to schedule appointment.' });
  }
});

app.put('/api/appointments/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getAppointment(String(req.params.id), req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Appointment not found.' });

  const {
    person_id,
    appointment_datetime,
    clinician_or_clinic,
    appointment_type,
    location_or_telehealth,
    notes,
    status,
  } = req.body;

  if (person_id) existing.person_id = person_id;
  if (appointment_datetime) existing.appointment_datetime = appointment_datetime;
  if (clinician_or_clinic) existing.clinician_or_clinic = clinician_or_clinic.trim();
  if (appointment_type) existing.appointment_type = appointment_type;
  if (location_or_telehealth !== undefined)
    existing.location_or_telehealth = location_or_telehealth?.trim() || undefined;
  if (notes !== undefined) existing.notes = notes?.trim() || undefined;
  if (status) existing.status = status;

  existing.updated_at = new Date().toISOString();
  db.saveAppointment(existing);

  return res.json({ appointment: existing });
});

app.delete('/api/appointments/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ok = db.deleteAppointment(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Appointment not found.' });
  return res.json({ success: true, message: 'Appointment removed.' });
});

// --- APPOINTMENT SUMMARIES ROUTES ---

app.get('/api/summaries', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const personId = req.query.personId as string | undefined;
  const list = db.getSummariesForUser(req.user!.id, personId);
  return res.json({ summaries: list });
});

app.post('/api/summaries', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      person_id,
      appointment_id,
      title,
      date_range_start,
      date_range_end,
      selected_entry_ids,
      custom_questions,
      visit_notes,
    } = req.body;

    if (!person_id || !title?.trim() || !Array.isArray(selected_entry_ids)) {
      return res.status(400).json({ error: 'Person, title, and selected entries are required.' });
    }

    const person = db.getPerson(person_id, req.user!.id);
    if (!person) return res.status(403).json({ error: 'Invalid person selected.' });

    const now = new Date().toISOString();
    const summary: AppointmentSummary = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      person_id,
      appointment_id: appointment_id || undefined,
      title: title.trim(),
      date_range_start: date_range_start || new Date(Date.now() - 30 * 86400000).toISOString(),
      date_range_end: date_range_end || now,
      selected_entry_ids,
      custom_questions: Array.isArray(custom_questions) ? custom_questions : [],
      visit_notes: visit_notes?.trim() || '',
      created_at: now,
    };

    db.saveSummary(summary);
    return res.status(201).json({ summary });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save appointment summary.' });
  }
});

app.delete('/api/summaries/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ok = db.deleteSummary(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Summary not found.' });
  return res.json({ success: true });
});

// --- COLLABORATORS / CARE TEAM ROUTES ---

app.get('/api/collaborators', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const personId = req.query.personId as string | undefined;
  const list = db.getCollaboratorsForUser(req.user!.id, personId);
  return res.json({ collaborators: list });
});

app.post('/api/collaborators', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { person_id, email, phone, name, category, relationship_detail, role, notes } = req.body;
    if (!person_id || !name?.trim() || (!email?.trim() && !phone?.trim())) {
      return res
        .status(400)
        .json({ error: 'Patient profile, name, and email or phone are required.' });
    }

    const person = db.getPerson(person_id, req.user!.id);
    if (!person) return res.status(403).json({ error: 'Invalid person selected.' });

    const resolvedCategory = category || (role === 'Doctor / Care Team' ? 'Doctor' : 'Family');
    const col: Collaborator = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      person_id,
      email: (email || '').trim().toLowerCase(),
      phone: phone?.trim() || undefined,
      name: name.trim(),
      category: resolvedCategory,
      relationship_detail:
        typeof relationship_detail === 'string' ? relationship_detail.trim() || undefined : undefined,
      role: role || (resolvedCategory === 'Doctor' ? 'Doctor / Care Team' : 'Viewer'),
      notes: notes?.trim() || undefined,
      access_code: 'VR-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      status: 'active',
      created_at: new Date().toISOString(),
    };

    db.saveCollaborator(col);
    return res.status(201).json({ collaborator: col });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add collaborator.' });
  }
});

app.delete('/api/collaborators/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ok = db.deleteCollaborator(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Collaborator not found.' });
  return res.json({ success: true });
});

// --- STANDALONE DAILY VITALS ROUTES ---

function parseNum(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

app.get('/api/vitals', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const personId = req.query.personId as string | undefined;
  const list = db.getVitalLogsForUser(req.user!.id, personId);
  return res.json({ vital_logs: list });
});

app.post('/api/vitals', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const personId = body.person_id;
    const person = personId ? db.getPerson(personId, req.user!.id) : null;
    if (!person) {
      return res.status(403).json({ error: 'Invalid patient profile selected.' });
    }

    const sanitizedVitals = sanitizeVitals(body);
    const now = new Date().toISOString();

    const entry: DailyVitalLog = {
      id: crypto.randomUUID(),
      user_id: req.user!.id,
      person_id: personId,
      recorded_at: body.recorded_at || now,
      blood_pressure_systolic: sanitizedVitals?.blood_pressure_systolic,
      blood_pressure_diastolic: sanitizedVitals?.blood_pressure_diastolic,
      blood_sugar: sanitizedVitals?.blood_sugar,
      blood_sugar_context: sanitizedVitals?.blood_sugar_context,
      blood_sugar_readings: sanitizedVitals?.blood_sugar_readings,
      oxygen_spo2: sanitizedVitals?.oxygen_spo2,
      pulse: sanitizedVitals?.pulse,
      temperature: sanitizedVitals?.temperature,
      temperature_unit: sanitizedVitals?.temperature_unit,
      weight: sanitizedVitals?.weight,
      weight_unit: sanitizedVitals?.weight_unit,
      respiratory_rate: parseNum(body.respiratory_rate),
      remark: typeof body.remark === 'string' ? body.remark.trim() || undefined : undefined,
      created_at: now,
      updated_at: now,
    };

    db.saveVitalLog(entry);
    return res.status(201).json({ vital_log: entry });
  } catch (err: any) {
    console.error('Create daily vital error:', err);
    return res.status(500).json({ error: 'Failed to save daily vital entry.' });
  }
});

app.put('/api/vitals/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getVitalLog(String(req.params.id), req.user!.id);
  if (!existing) return res.status(404).json({ error: 'Vital entry not found.' });

  const body = req.body || {};
  const sanitizedVitals = sanitizeVitals(body);

  const updated: DailyVitalLog = {
    ...existing,
    person_id: body.person_id && db.getPerson(body.person_id, req.user!.id) ? body.person_id : existing.person_id,
    recorded_at: body.recorded_at || existing.recorded_at,
    blood_pressure_systolic: sanitizedVitals?.blood_pressure_systolic,
    blood_pressure_diastolic: sanitizedVitals?.blood_pressure_diastolic,
    blood_sugar: sanitizedVitals?.blood_sugar,
    blood_sugar_context: sanitizedVitals?.blood_sugar_context,
    blood_sugar_readings: sanitizedVitals?.blood_sugar_readings,
    oxygen_spo2: sanitizedVitals?.oxygen_spo2,
    pulse: sanitizedVitals?.pulse,
    temperature: sanitizedVitals?.temperature,
    temperature_unit: sanitizedVitals?.temperature_unit,
    weight: sanitizedVitals?.weight,
    weight_unit: sanitizedVitals?.weight_unit,
    respiratory_rate:
      body.respiratory_rate !== undefined ? parseNum(body.respiratory_rate) : existing.respiratory_rate,
    remark:
      body.remark !== undefined
        ? typeof body.remark === 'string'
          ? body.remark.trim() || undefined
          : undefined
        : existing.remark,
    updated_at: new Date().toISOString(),
  };

  db.saveVitalLog(updated);
  return res.json({ vital_log: updated });
});

app.delete('/api/vitals/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const ok = db.deleteVitalLog(String(req.params.id), req.user!.id);
  if (!ok) return res.status(404).json({ error: 'Vital entry not found.' });
  return res.json({ success: true });
});

// --- EXPORT DATA (JSON & CSV) ---

app.get('/api/export/json', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const personId = req.query.personId as string | undefined;

  const people = db.getPeopleForUser(userId).filter((p) => !personId || p.id === personId);
  const conditions = db
    .getConditionsForUser(userId)
    .filter((c) => !personId || c.person_id === personId);
  const symptoms = db
    .getSymptomsForUser(userId)
    .filter((s) => !personId || s.person_id === personId);
  const vital_logs = db
    .getVitalLogsForUser(userId)
    .filter((v) => !personId || v.person_id === personId);
  const appointments = db
    .getAppointmentsForUser(userId)
    .filter((a) => !personId || a.person_id === personId);
  const summaries = db
    .getSummariesForUser(userId)
    .filter((sum) => !personId || sum.person_id === personId);

  const exportPayload = {
    app: 'VisitReady',
    exported_at: new Date().toISOString(),
    user: {
      name: req.user!.name,
      email: req.user!.email,
    },
    people,
    conditions,
    symptoms,
    vital_logs,
    appointments,
    summaries,
    disclaimer:
      'VisitReady is for personal recordkeeping only. It does not provide medical advice, diagnosis, or triage.',
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="visitready-export-${Date.now()}.json"`
  );
  return res.send(JSON.stringify(exportPayload, null, 2));
});

app.get('/api/export/csv', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const personId = req.query.personId as string | undefined;

  const symptoms = db
    .getSymptomsForUser(userId)
    .filter((s) => !personId || s.person_id === personId);
  const peopleMap = new Map(db.getPeopleForUser(userId).map((p) => [p.id, p.name]));

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

  const escapeCsv = (val: any) => {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = symptoms.map((s) => {
    const sugarReadings =
      s.vitals?.blood_sugar_readings && s.vitals.blood_sugar_readings.length > 0
        ? s.vitals.blood_sugar_readings
        : s.vitals?.blood_sugar
        ? [{ value: s.vitals.blood_sugar, context: s.vitals.blood_sugar_context || 'fasting', time_note: undefined }]
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

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="visitready-symptoms-${Date.now()}.csv"`);
  return res.send(csvContent);
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`VisitReady full-stack server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start VisitReady server:', err);
  process.exit(1);
});
