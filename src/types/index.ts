/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RelationshipType =
  | 'Self'
  | 'Child'
  | 'Spouse'
  | 'Partner'
  | 'Parent'
  | 'Relative'
  | 'Friend'
  | 'Other';

export interface UserPreferences {
  time_zone: string;
  date_format: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
  temperature_unit: 'F' | 'C';
  weight_unit: 'lbs' | 'kg';
  blood_sugar_unit: 'mg/dL' | 'mmol/L';
  reminders_enabled: boolean;
  high_contrast: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  auth_provider: 'email' | 'google' | 'demo';
  created_at: string;
  updated_at: string;
  preferences: UserPreferences;
}

export interface Person {
  id: string;
  user_id: string;
  name: string;
  relationship: RelationshipType;
  birth_date?: string;
  allergies?: string;
  notes?: string;
  height?: string;
  height_unit?: 'in' | 'cm';
  weight?: number;
  weight_unit?: 'lbs' | 'kg';
  blood_type?: string;
  medical_history?: string;
  current_medications?: string;
  baseline_bp?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  created_at: string;
  updated_at: string;
}

export interface DoctorTreatmentItem {
  id: string;
  name: string;
  notes?: string;
}

export interface DoctorTreatmentPlan {
  id: string;
  doctor_name: string;
  specialty_or_clinic?: string;
  treatments: DoctorTreatmentItem[];
}

export interface Condition {
  id: string;
  user_id: string;
  person_id: string;
  name: string;
  diagnosed_date?: string;
  treating_clinician?: string;
  doctor_treatments?: DoctorTreatmentPlan[];
  status: 'active' | 'managed' | 'monitoring' | 'resolved';
  notes?: string;
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

export type BloodSugarContext = 'fasting' | 'non-fasting' | 'random' | 'post-meal' | 'bedtime';

export interface BloodSugarReading {
  id: string;
  value: number;
  context: BloodSugarContext;
  time_note?: string;
}

export interface Vitals {
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  temperature?: number;
  temperature_unit?: 'F' | 'C';
  pulse?: number; // bpm
  blood_sugar?: number;
  blood_sugar_context?: BloodSugarContext;
  blood_sugar_readings?: BloodSugarReading[];
  oxygen_spo2?: number; // %
  weight?: number;
  weight_unit?: 'lbs' | 'kg';
  notes?: string;
}

export interface DailyVitalLog {
  id: string;
  user_id: string;
  person_id: string;
  recorded_at: string;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  blood_sugar?: number;
  blood_sugar_context?: BloodSugarContext;
  blood_sugar_readings?: BloodSugarReading[];
  oxygen_spo2?: number;
  pulse?: number;
  temperature?: number;
  temperature_unit?: 'F' | 'C';
  weight?: number;
  weight_unit?: 'lbs' | 'kg';
  respiratory_rate?: number;
  remark?: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: 'lab_report' | 'prescription' | 'clinical_summary' | 'photo' | 'other';
  uploaded_at: string;
  data_url: string;
  notes?: string;
}

export interface SymptomEntry {
  id: string;
  user_id: string;
  person_id: string;
  condition_ids: string[];
  symptom_name: string;
  symptoms_list?: string[];
  start_datetime: string;
  end_datetime?: string;
  ongoing: boolean;
  severity_0_to_10: number;
  duration_text?: string;
  body_location?: string;
  description: string;
  context?: string;
  possible_triggers?: string;
  better_or_worse_notes?: string;
  associated_symptoms?: string;
  daily_impact?: string;
  tags: string[];
  vitals?: Vitals;
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  person_id: string;
  appointment_datetime: string;
  clinician_or_clinic: string;
  appointment_type:
    | 'Routine Follow-up'
    | 'Specialist Consultation'
    | 'New Symptom Evaluation'
    | 'Lab / Diagnostic Review'
    | 'Urgent Check-in'
    | 'Annual Wellness'
    | 'Other';
  location_or_telehealth?: string;
  notes?: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface AppointmentSummary {
  id: string;
  user_id: string;
  person_id: string;
  appointment_id?: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  selected_entry_ids: string[];
  custom_questions: string[];
  visit_notes?: string;
  created_at: string;
}

export type CollaboratorCategory = 'Doctor' | 'Family' | 'Friend';

export interface Collaborator {
  id: string;
  user_id: string;
  person_id: string;
  email: string;
  phone?: string;
  name: string;
  category?: CollaboratorCategory;
  relationship_detail?: string;
  role: 'Viewer' | 'Editor' | 'Doctor / Care Team';
  notes?: string;
  access_code: string;
  status: 'active' | 'pending';
  created_at: string;
}

export interface AuthSession {
  token: string;
  user_id: string;
  expires_at: string;
}
