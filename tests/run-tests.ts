/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import { db } from '../src/server/db.ts';
import { hashPassword, verifyPassword, seedDemoData } from '../src/server/auth.ts';
import { Person, Condition, SymptomEntry, Appointment, AppointmentSummary, DailyVitalLog } from '../src/types/index.ts';

async function runTests() {
  console.log('--- STARTING VISITREADY AUTOMATED TEST SUITE ---');

  // Test 1: Password hashing and verification
  console.log('Test 1: Password hashing & verification...');
  const { hash, salt } = hashPassword('SecurePass123!');
  assert(hash.length > 32, 'Hash must be generated');
  assert(verifyPassword('SecurePass123!', hash, salt), 'Password must verify');
  assert(!verifyPassword('WrongPass', hash, salt), 'Wrong password must fail');
  console.log('✓ Password hashing passed.');

  // Test 2: User creation & isolation
  console.log('Test 2: User isolation & ownership checks...');
  const userAId = 'test-user-a-' + Date.now();
  const userBId = 'test-user-b-' + Date.now();

  const userA = {
    id: userAId,
    email: `usera-${Date.now()}@example.in`,
    name: 'User Alpha',
    auth_provider: 'email' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    preferences: {
      time_zone: 'Asia/Kolkata',
      date_format: 'DD/MM/YYYY' as const,
      temperature_unit: 'F' as const,
      weight_unit: 'kg' as const,
      blood_sugar_unit: 'mg/dL' as const,
      reminders_enabled: false,
      high_contrast: false,
    },
  };
  const userB = {
    id: userBId,
    email: `userb-${Date.now()}@example.in`,
    name: 'User Beta',
    auth_provider: 'email' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    preferences: userA.preferences,
  };

  db.saveUser(userA);
  db.saveUser(userB);

  // Test 3: Person CRUD & Family Member additions
  console.log('Test 3: Person CRUD & multiple people...');
  const personA1: Person = {
    id: 'person-a1-' + Date.now(),
    user_id: userAId,
    name: 'Alpha Primary',
    relationship: 'Self',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const personA2: Person = {
    id: 'person-a2-' + Date.now(),
    user_id: userAId,
    name: 'Alpha Child Aarav',
    relationship: 'Child',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const personB1: Person = {
    id: 'person-b1-' + Date.now(),
    user_id: userBId,
    name: 'Beta Primary',
    relationship: 'Self',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.savePerson(personA1);
  db.savePerson(personA2);
  db.savePerson(personB1);

  const aPeople = db.getPeopleForUser(userAId);
  assert.strictEqual(aPeople.length, 2, 'User A should have exactly 2 people profiles');
  const bPeople = db.getPeopleForUser(userBId);
  assert.strictEqual(bPeople.length, 1, 'User B should have exactly 1 person profile');

  const unauthorizedPerson = db.getPerson(personA1.id, userBId);
  assert.strictEqual(unauthorizedPerson, null, 'User B cannot access User A person record');
  console.log('✓ People isolation & CRUD passed.');

  // Test 4: Condition / Disease Management & Multiple Doctors/Treatments
  console.log('Test 4: Condition management & multiple doctors/treatments...');
  const cond1: Condition = {
    id: 'cond-1-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    name: 'Migraine with Aura',
    status: 'active',
    treating_clinician: 'Dr. Ananya Kulkarni, Dr. Meera Iyer',
    doctor_treatments: [
      {
        id: 'dt-test-1',
        doctor_name: 'Dr. Ananya Kulkarni',
        specialty_or_clinic: 'Neurology',
        treatments: [{ id: 'tr-1', name: 'Sumatriptan 50mg SOS', notes: 'At onset' }],
      },
      {
        id: 'dt-test-2',
        doctor_name: 'Dr. Meera Iyer',
        specialty_or_clinic: 'Ophthalmology',
        treatments: [{ id: 'tr-2', name: 'Lubricating Eye Drops', notes: 'Twice daily' }],
      },
    ],
    attachments: [
      {
        id: 'att-cond-1',
        file_name: 'opd-prescription.png',
        file_size: 1024,
        file_type: 'image/png',
        category: 'prescription',
        uploaded_at: new Date().toISOString(),
        data_url: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const cond2: Condition = {
    id: 'cond-2-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    name: 'Allergic Rhinitis',
    status: 'managed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.saveCondition(cond1);
  db.saveCondition(cond2);

  const aConditions = db.getConditionsForUser(userAId, personA1.id);
  assert.strictEqual(aConditions.length, 2, 'User A person 1 has 2 conditions');
  const savedMigraine = aConditions.find((c) => c.id === cond1.id);
  assert(savedMigraine?.doctor_treatments?.length === 2, 'Multiple doctors saved under condition');
  assert.strictEqual(savedMigraine?.attachments?.length, 1, 'Condition attachments stored');
  console.log('✓ Conditions, attachments & multi-doctor treatments CRUD passed.');

  // Test 5: Symptom Entry CRUD with Vitals
  console.log('Test 5: Symptom Entry CRUD & home vitals...');
  const symEntry1: SymptomEntry = {
    id: 'sym-1-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    condition_ids: [cond1.id],
    symptom_name: 'Severe Throbbing Headache',
    start_datetime: '2026-11-01T10:00:00Z',
    ongoing: false,
    severity_0_to_10: 8,
    duration_text: '3 hours',
    body_location: 'Right temple',
    description: 'Intense pulsing after prolonged screen exposure.',
    context: 'After a long morning video meeting.',
    possible_triggers: 'Screen glare and missed breakfast',
    tags: ['migraine', 'headache', 'screens'],
    vitals: {
      blood_pressure_systolic: 125,
      blood_pressure_diastolic: 80,
      pulse: 78,
      temperature: 98.6,
      temperature_unit: 'F',
      blood_sugar: 102,
      blood_sugar_context: 'fasting',
      blood_sugar_readings: [
        { id: 'bs-1', value: 102, context: 'fasting', time_note: '7:30 AM' },
        { id: 'bs-2', value: 156, context: 'non-fasting', time_note: '11:00 AM' },
        { id: 'bs-3', value: 138, context: 'random', time_note: '4:00 PM' },
      ],
      oxygen_spo2: 98,
    },
    attachments: [
      {
        id: 'att-sym-1',
        file_name: 'lab-report.pdf',
        file_size: 2048,
        file_type: 'application/pdf',
        category: 'lab_report',
        uploaded_at: '2026-11-01T10:00:00Z',
        data_url: 'data:application/pdf;base64,JVBERi0xLjQ=',
      },
    ],
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  };

  const symEntry2: SymptomEntry = {
    id: 'sym-2-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    condition_ids: [cond2.id],
    symptom_name: 'Nasal congestion • Mild morning sneezing',
    symptoms_list: ['Nasal congestion', 'Mild morning sneezing'],
    start_datetime: '2026-11-05T08:00:00Z',
    ongoing: true,
    severity_0_to_10: 3,
    description: 'Mild morning congestion.',
    tags: ['allergy', 'nasal'],
    created_at: '2026-11-05T08:00:00Z',
    updated_at: '2026-11-05T08:00:00Z',
  };

  db.saveSymptom(symEntry1);
  db.saveSymptom(symEntry2);

  const userASymptoms = db.getSymptomsForUser(userAId);
  assert.strictEqual(userASymptoms.length, 2, 'User A should have 2 symptom entries');
  assert.strictEqual(userASymptoms[0].id, symEntry2.id, 'Newest entry first');
  assert.strictEqual(userASymptoms[1].attachments?.length, 1, 'Symptom attachments stored');
  assert.strictEqual(
    userASymptoms[1].vitals?.blood_sugar_readings?.length,
    3,
    'Multiple blood sugar readings (fasting, non-fasting, random) persist'
  );
  assert.deepStrictEqual(
    userASymptoms[0].symptoms_list,
    ['Nasal congestion', 'Mild morning sneezing'],
    'Multiple symptoms list persists in single entry'
  );

  const unauthorizedSymptom = db.getSymptom(symEntry1.id, userBId);
  assert.strictEqual(unauthorizedSymptom, null, 'User B cannot retrieve User A symptom');
  console.log('✓ Symptom CRUD, multiple sugar readings & isolation passed.');

  // Test 6: Filtering & Search
  console.log('Test 6: Filtering & search across entries...');
  const filteredByName = db.getSymptomsForUser(userAId, { symptomName: 'Headache' });
  assert.strictEqual(filteredByName.length, 1, 'Filter by symptom name');

  const filteredBySeverity = db.getSymptomsForUser(userAId, { minSeverity: 5 });
  assert.strictEqual(filteredBySeverity.length, 1, 'Filter by min severity');
  assert.strictEqual(filteredBySeverity[0].severity_0_to_10, 8);

  const filteredBySearch = db.getSymptomsForUser(userAId, { search: 'video meeting' });
  assert.strictEqual(filteredBySearch.length, 1, 'Search by keyword in context');

  const filteredByTag = db.getSymptomsForUser(userAId, { tag: 'allergy' });
  assert.strictEqual(filteredByTag.length, 1, 'Filter by tag');
  console.log('✓ Search and filtering passed.');

  // Test 7: Appointments & Appointment Summary Generation
  console.log('Test 7: Appointments & Appointment Summary generation...');
  const appt1: Appointment = {
    id: 'appt-1-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    appointment_datetime: '2026-11-15T14:30:00Z',
    clinician_or_clinic: 'Dr. Kulkarni (Neurology)',
    appointment_type: 'Specialist Consultation',
    notes: 'Review severe headache episodes.',
    status: 'upcoming',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.saveAppointment(appt1);

  const summary1: AppointmentSummary = {
    id: 'sum-1-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    appointment_id: appt1.id,
    title: 'Neurology Visit Prep - November 2026',
    date_range_start: '2026-11-01T00:00:00Z',
    date_range_end: '2026-11-10T23:59:59Z',
    selected_entry_ids: [symEntry1.id],
    custom_questions: [
      'Could screen time triggers indicate eye strain or migraine aura?',
      'Are there specific warning signs I should watch for?',
    ],
    visit_notes: '',
    created_at: new Date().toISOString(),
  };
  db.saveSummary(summary1);

  const userSummaries = db.getSummariesForUser(userAId);
  assert.strictEqual(userSummaries.length, 1, 'User A should have 1 summary');
  assert.strictEqual(userSummaries[0].custom_questions.length, 2, 'Summary retains questions');
  console.log('✓ Appointment prep & summary generation passed.');

  // Test 8: Standalone Daily Vitals Log (multiple times daily, no mandatory fields)
  console.log('Test 8: Standalone Daily Vital Logs CRUD...');
  const vital1: DailyVitalLog = {
    id: 'vital-1-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    recorded_at: '2026-11-10T07:30:00Z',
    blood_pressure_systolic: 118,
    blood_pressure_diastolic: 76,
    oxygen_spo2: 99,
    blood_sugar_readings: [
      { id: 'v-bs-1', value: 96, context: 'fasting', time_note: '7:30 AM' },
    ],
    remark: 'Morning check before breakfast',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const vital2: DailyVitalLog = {
    id: 'vital-2-' + Date.now(),
    user_id: userAId,
    person_id: personA1.id,
    recorded_at: '2026-11-10T21:15:00Z',
    blood_pressure_systolic: 124,
    blood_pressure_diastolic: 80,
    pulse: 74,
    blood_sugar_readings: [
      { id: 'v-bs-2', value: 148, context: 'post-meal', time_note: '9:15 PM' },
    ],
    remark: 'After dinner check',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.saveVitalLog(vital1);
  db.saveVitalLog(vital2);

  const aVitals = db.getVitalLogsForUser(userAId, personA1.id);
  assert.strictEqual(aVitals.length, 2, 'Both morning and evening daily vitals persisted');
  assert.strictEqual(aVitals[0].id, vital2.id, 'Newest vital entry first');
  assert.strictEqual(db.getVitalLog(vital1.id, userBId), null, 'User B cannot read User A vitals');
  console.log('✓ Daily Vital Logs multi-entry CRUD & isolation passed.');

  // Test 9: Cascade Account Deletion
  console.log('Test 9: Cascade account deletion...');
  db.purgeUserAccount(userAId);
  assert.strictEqual(db.findUserById(userAId), null, 'User A must be deleted');
  assert.strictEqual(db.getPeopleForUser(userAId).length, 0, 'User A people must be purged');
  assert.strictEqual(db.getSymptomsForUser(userAId).length, 0, 'User A symptoms must be purged');
  assert.strictEqual(db.getVitalLogsForUser(userAId).length, 0, 'User A vital logs must be purged');
  assert.strictEqual(db.getAppointmentsForUser(userAId).length, 0, 'User A appointments must be purged');
  assert.strictEqual(db.getSummariesForUser(userAId).length, 0, 'User A summaries must be purged');
  console.log('✓ Account deletion cascade passed.');

  // Test 10: Demo data seed & non-destructive reload verification
  console.log('Test 10: Fictional demo seed & non-destructive persistence...');
  const { token, user: demoUser } = seedDemoData();
  assert(token.length > 20, 'Demo token generated');
  assert.strictEqual(demoUser.auth_provider, 'demo', 'Demo user marked as demo');
  const demoSymptoms = db.getSymptomsForUser(demoUser.id);
  assert(demoSymptoms.length >= 3, 'Demo symptoms populated with fictional data');
  const demoCollabs = db.getCollaboratorsForUser(demoUser.id);
  assert(demoCollabs.length >= 2, 'Demo collaborators populated');

  const demoVitalId = 'demo-vital-persist-' + Date.now();
  db.saveVitalLog({
    id: demoVitalId,
    user_id: demoUser.id,
    person_id: db.getPeopleForUser(demoUser.id)[0].id,
    recorded_at: new Date().toISOString(),
    blood_pressure_systolic: 120,
    blood_pressure_diastolic: 78,
    remark: 'Persisted across non-reset demo login',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  seedDemoData(false);
  assert(
    db.getVitalLog(demoVitalId, demoUser.id) !== null,
    'Non-reset demo sign-in preserves previously logged user records'
  );
  db.deleteVitalLog(demoVitalId, demoUser.id);
  console.log('✓ Demo data seed & persistence passed.');

  console.log('\n--- ALL TESTS COMPLETED SUCCESSFULLY (10/10) ---');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
