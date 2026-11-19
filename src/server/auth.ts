/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import { User, Person, Condition, SymptomEntry, Appointment, Collaborator } from '../types/index.ts';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.substring(7);
  const session = db.findSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }

  const user = db.findUserById(session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'User account not found.' });
  }

  req.user = user;
  next();
}

/**
 * Creates or resets fictional demo sample records for quick testing.
 * Tailored for Indian patients, OPD clinics, metric units, and family care circles.
 */
export function seedDemoData(forceReset = false): { token: string; user: User } {
  const demoEmail = 'demo@visitready.app';
  let user = db.findUserByEmail(demoEmail);

  if (user && forceReset) {
    db.purgeUserAccount(user.id);
    user = null;
  }

  if (!user) {
    const userId = 'demo-user-1';
    const now = new Date().toISOString();
    user = {
      id: userId,
      email: demoEmail,
      name: 'Priya Sharma (Demo)',
      auth_provider: 'demo',
      created_at: now,
      updated_at: now,
      preferences: {
        time_zone: 'Asia/Kolkata',
        date_format: 'DD/MM/YYYY',
        temperature_unit: 'F',
        weight_unit: 'kg',
        blood_sugar_unit: 'mg/dL',
        reminders_enabled: false,
        high_contrast: false,
      },
    };
    db.saveUser(user);

    const personSelf: Person = {
      id: 'demo-person-1',
      user_id: userId,
      name: 'Priya Sharma',
      relationship: 'Self',
      birth_date: '1984-06-15',
      allergies: 'Sulfa drugs, Dust mites',
      height: '164 cm',
      height_unit: 'cm',
      weight: 62,
      weight_unit: 'kg',
      blood_type: 'O+',
      baseline_bp: '118/76',
      current_medications: 'Thyronorm 50mcg empty stomach, Sumatriptan 50mg SOS, Vitamin D3',
      medical_history: 'Hypothyroidism (2020), Seasonal allergic rhinitis',
      emergency_contact_name: 'Aarav Sharma (Spouse)',
      emergency_contact_phone: '+91 98450 12345',
      notes: 'Preparing OPD records for neurology and endocrinology follow-up.',
      created_at: now,
      updated_at: now,
    };
    const personFather: Person = {
      id: 'demo-person-2',
      user_id: userId,
      name: 'Ramesh Sharma',
      relationship: 'Parent',
      birth_date: '1955-11-20',
      allergies: 'Penicillin',
      height: '170 cm',
      height_unit: 'cm',
      weight: 71,
      weight_unit: 'kg',
      blood_type: 'B+',
      baseline_bp: '132/84',
      current_medications: 'Telma 40mg morning, Glycomet-GP 1 before breakfast',
      medical_history: 'Type 2 Diabetes (2017), Essential Hypertension (2018), Cataract surgery (2022)',
      emergency_contact_name: 'Priya Sharma (Daughter)',
      emergency_contact_phone: '+91 98450 54321',
      notes: 'Papa: Monitoring fasting blood sugar, morning BP, and knee stiffness.',
      created_at: now,
      updated_at: now,
    };
    db.savePerson(personSelf);
    db.savePerson(personFather);

    const condMigraine: Condition = {
      id: 'demo-cond-1',
      user_id: userId,
      person_id: personSelf.id,
      name: 'Migraine & Light Sensitivity',
      diagnosed_date: '2021-04-10',
      treating_clinician: 'Dr. Ananya Kulkarni, Dr. Meera Iyer',
      doctor_treatments: [
        {
          id: 'dt-1',
          doctor_name: 'Dr. Ananya Kulkarni',
          specialty_or_clinic: 'Neurology · Apollo Clinic',
          treatments: [
            { id: 't-1', name: 'Sumatriptan 50mg SOS', notes: 'Take at headache onset' },
            { id: 't-2', name: 'Flunarizine 10mg', notes: 'Nightly preventive course' },
          ],
        },
        {
          id: 'dt-2',
          doctor_name: 'Dr. Meera Iyer',
          specialty_or_clinic: 'Ophthalmology & Strain Care',
          treatments: [
            { id: 't-3', name: 'Lubricating Eye Drops', notes: 'Twice daily during screen work' },
          ],
        },
      ],
      status: 'active',
      notes: 'Often triggered by skipped meals, summer heat, or long screen hours.',
      created_at: now,
      updated_at: now,
    };
    const condThyroid: Condition = {
      id: 'demo-cond-2',
      user_id: userId,
      person_id: personSelf.id,
      name: 'Hypothyroidism',
      diagnosed_date: '2020-09-12',
      treating_clinician: 'Dr. Vikram Mehta',
      doctor_treatments: [
        {
          id: 'dt-3',
          doctor_name: 'Dr. Vikram Mehta',
          specialty_or_clinic: 'Endocrinology',
          treatments: [
            { id: 't-4', name: 'Thyronorm 50mcg', notes: 'Daily empty stomach at 6:30 AM' },
            { id: 't-5', name: 'Vitamin D3 60,000 IU', notes: 'Once weekly after breakfast' },
          ],
        },
      ],
      status: 'managed',
      notes: 'TSH reviewed every 6 months; tracking fatigue levels.',
      created_at: now,
      updated_at: now,
    };
    const condDiabetes: Condition = {
      id: 'demo-cond-3',
      user_id: userId,
      person_id: personFather.id,
      name: 'Type 2 Diabetes & Hypertension',
      diagnosed_date: '2017-01-20',
      treating_clinician: 'Dr. Rajesh Nair, Dr. Kavita Rao',
      doctor_treatments: [
        {
          id: 'dt-4',
          doctor_name: 'Dr. Rajesh Nair',
          specialty_or_clinic: 'Diabetology OPD',
          treatments: [
            { id: 't-6', name: 'Glycomet-GP 1', notes: 'Before breakfast' },
          ],
        },
        {
          id: 'dt-5',
          doctor_name: 'Dr. Kavita Rao',
          specialty_or_clinic: 'Cardiology',
          treatments: [
            { id: 't-7', name: 'Telma 40mg', notes: 'Daily morning' },
          ],
        },
      ],
      status: 'active',
      notes: 'Daily morning home glucometer & BP check before OPD visit.',
      created_at: now,
      updated_at: now,
    };
    db.saveCondition(condMigraine);
    db.saveCondition(condThyroid);
    db.saveCondition(condDiabetes);

    const d1 = new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString();
    const d2 = new Date(Date.now() - 1000 * 60 * 60 * 68).toISOString();
    const d3 = new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString();
    const d4 = new Date(Date.now() - 1000 * 60 * 60 * 190).toISOString();

    const sym1: SymptomEntry = {
      id: 'demo-sym-1',
      user_id: userId,
      person_id: personSelf.id,
      condition_ids: [condMigraine.id],
      symptom_name: 'Throbbing left-temple headache with bright light sensitivity',
      start_datetime: d1,
      end_datetime: undefined,
      ongoing: true,
      severity_0_to_10: 7,
      duration_text: 'Ongoing for 4 hours',
      body_location: 'Left temple and behind eye',
      description: 'Pulsing ache that started during an afternoon laptop session after commuting in afternoon heat.',
      context: 'Working from home with delayed lunch and continuous screen meetings.',
      possible_triggers: 'Skipped lunch, harsh afternoon glare, dehydration',
      better_or_worse_notes: 'Resting in a dark quiet room with cold water & balm eased the intensity.',
      associated_symptoms: 'Mild nausea, sensitivity to phone screen brightness',
      daily_impact: 'Needed to pause laptop work and rest.',
      tags: ['migraine', 'heat', 'workday'],
      vitals: {
        blood_pressure_systolic: 122,
        blood_pressure_diastolic: 78,
        pulse: 74,
        temperature: 98.4,
        temperature_unit: 'F',
        weight: 62,
        weight_unit: 'kg',
      },
      created_at: d1,
      updated_at: d1,
    };

    const sym2: SymptomEntry = {
      id: 'demo-sym-2',
      user_id: userId,
      person_id: personSelf.id,
      condition_ids: [condThyroid.id],
      symptom_name: 'Afternoon tiredness and mild joint heaviness',
      start_datetime: d2,
      end_datetime: new Date(new Date(d2).getTime() + 1000 * 60 * 150).toISOString(),
      ongoing: false,
      severity_0_to_10: 4,
      duration_text: 'Approx 2.5 hours',
      body_location: 'Knees and general body fatigue',
      description: 'Felt sluggish after lunch even after a full night of sleep.',
      context: 'Normal office day; took thyroid tablet on time at 6:30 AM.',
      possible_triggers: 'Poor sleep quality, missed morning walk',
      better_or_worse_notes: 'Light stretching and hydrating helped settle the heaviness.',
      associated_symptoms: 'Mild calf soreness',
      daily_impact: 'Slowed down evening errands.',
      tags: ['thyroid', 'fatigue'],
      vitals: {
        oxygen_spo2: 98,
        pulse: 76,
      },
      created_at: d2,
      updated_at: d2,
    };

    const sym3: SymptomEntry = {
      id: 'demo-sym-3',
      user_id: userId,
      person_id: personSelf.id,
      condition_ids: [condMigraine.id],
      symptom_name: 'Dull forehead tightness after traffic commute',
      start_datetime: d3,
      ongoing: false,
      severity_0_to_10: 3,
      duration_text: '2 hours',
      body_location: 'Forehead across brow',
      description: 'Tight band feeling across brow following evening traffic noise and pollution.',
      possible_triggers: 'Traffic glare, dehydration',
      better_or_worse_notes: 'Warm herbal tea and eye rest helped.',
      daily_impact: 'Took a 30-minute screen break.',
      tags: ['headache', 'commute'],
      created_at: d3,
      updated_at: d3,
    };

    const symFather: SymptomEntry = {
      id: 'demo-sym-4',
      user_id: userId,
      person_id: personFather.id,
      condition_ids: [condDiabetes.id],
      symptom_name: 'Fasting sugar check and mild dizziness on waking up',
      start_datetime: d4,
      ongoing: false,
      severity_0_to_10: 3,
      duration_text: '20 minutes',
      body_location: 'Head / general',
      description: 'Noticed brief lightheadedness upon getting up for morning walk. Checked fasting glucose and BP at home.',
      vitals: {
        blood_pressure_systolic: 136,
        blood_pressure_diastolic: 84,
        pulse: 70,
        blood_sugar: 128,
        blood_sugar_context: 'fasting',
        temperature: 98.2,
        temperature_unit: 'F',
        weight: 71,
        weight_unit: 'kg',
      },
      tags: ['vitals-log', 'diabetes', 'dizziness'],
      created_at: d4,
      updated_at: d4,
    };

    db.saveSymptom(sym1);
    db.saveSymptom(sym2);
    db.saveSymptom(sym3);
    db.saveSymptom(symFather);

    const apptDate = new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString();
    const appt: Appointment = {
      id: 'demo-appt-1',
      user_id: userId,
      person_id: personSelf.id,
      appointment_datetime: apptDate,
      clinician_or_clinic: 'Dr. Ananya Kulkarni (Apollo Clinic OPD)',
      appointment_type: 'Specialist Consultation',
      location_or_telehealth: 'OPD Room 204, Indiranagar, Bengaluru',
      notes: 'Review migraine triggers, sleep logs, and carry updated TSH report.',
      status: 'upcoming',
      created_at: now,
      updated_at: now,
    };
    db.saveAppointment(appt);

    const colDoctor: Collaborator = {
      id: 'demo-col-1',
      user_id: userId,
      person_id: personSelf.id,
      name: 'Dr. Ananya Kulkarni',
      email: 'dr.kulkarni@apolloclinic-example.in',
      phone: '+91 98801 44556',
      category: 'Doctor',
      role: 'Doctor / Care Team',
      notes: 'Neurologist — Consulting OPD doctor',
      access_code: 'VR-DOC402',
      status: 'active',
      created_at: now,
    };
    const colFamily: Collaborator = {
      id: 'demo-col-2',
      user_id: userId,
      person_id: personSelf.id,
      name: 'Aarav Sharma (Spouse)',
      email: 'aarav.sharma@example.in',
      phone: '+91 98450 12345',
      category: 'Family',
      role: 'Editor',
      notes: 'Can log symptoms and carry visit sheets during OPD visits',
      access_code: 'VR-FAM819',
      status: 'active',
      created_at: now,
    };
    db.saveCollaborator(colDoctor);
    db.saveCollaborator(colFamily);
  }

  const token = generateToken();
  db.saveSession({
    token,
    user_id: user.id,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  });

  return { token, user };
}
