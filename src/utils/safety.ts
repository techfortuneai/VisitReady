/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SAFETY_DISCLAIMER =
  'VisitReady is not for emergencies and does not provide medical advice or diagnosis. If you believe you may be experiencing an emergency, call 112 / 108 or visit your nearest hospital casualty / emergency department immediately.';

export const SENSITIVE_DATA_NOTICE =
  'Symptom records and health documents may contain sensitive personal health information. VisitReady keeps your records private to your account and never sells or uses your data for advertising.';

const EMERGENCY_TRIGGER_PATTERNS = [
  /\bchest pain\b/i,
  /\bpressure in (my )?chest\b/i,
  /\bshortness of breath\b/i,
  /\b(cannot|can't|trouble|difficulty) breath(e|ing)\b/i,
  /\bstroke\b/i,
  /\bface drooping\b/i,
  /\bslurred speech\b/i,
  /\b(sudden|severe) numbness\b/i,
  /\bparalysis\b/i,
  /\bsevere bleeding\b/i,
  /\bvomiting blood\b/i,
  /\bcoughing up blood\b/i,
  /\banaphylaxis\b/i,
  /\bthroat closing\b/i,
  /\bswallowing difficulty\b/i,
  /\bloss of consciousness\b/i,
  /\bunresponsive\b/i,
  /\bseizure\b/i,
  /\bworst headache of (my )?life\b/i,
  /\bheart attack\b/i,
  /\bsuicid(e|al)\b/i,
];

export function containsEmergencyKeyword(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  return EMERGENCY_TRIGGER_PATTERNS.some((pattern) => pattern.test(text));
}

export const COMMON_SYMPTOMS_CATALOG = [
  'Headache',
  'Throbbing Temple Pain',
  'Fatigue / Exhaustion',
  'Nausea',
  'Dizziness / Lightheadedness',
  'Shortness of Breath',
  'Cough',
  'Fever / Chills',
  'Joint Pain',
  'Lower Back Ache',
  'Neck Stiffness',
  'Abdominal Cramping',
  'Bloating',
  'Chest Tightness',
  'Palpitations',
  'Skin Rash / Itching',
  'Brain Fog / Trouble Concentrating',
  'Insomnia / Disturbed Sleep',
  'Muscle Weakness',
  'Sore Throat',
  'Sinus Pressure / Congestion',
  'Acid Reflux / Heartburn',
  'Numbness / Tingling in Fingers',
  'Tremor / Shaking',
  'Eye Strain / Sensitivity to Light',
];

export const COMMON_BODY_LOCATIONS = [
  'Head / Forehead',
  'Temples / Eyes',
  'Neck / Throat',
  'Chest / Ribs',
  'Upper Back / Shoulders',
  'Lower Back',
  'Abdomen / Stomach',
  'Pelvis / Hips',
  'Arms / Hands',
  'Legs / Knees / Ankles',
  'Skin / Whole Body',
];

export const SEVERITY_DESCRIPTIONS: Record<number, { label: string; detail: string; color: string }> = {
  0: { label: 'None', detail: 'No symptom present', color: 'bg-slate-100 text-slate-700' },
  1: { label: 'Minimal', detail: 'Barely noticeable, negligible impact', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  2: { label: 'Mild', detail: 'Noticeable, easily tolerated without altering daily flow', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  3: { label: 'Mild+', detail: 'Noticeable; may prompt rest breaks', color: 'bg-teal-100 text-teal-800 border-teal-300' },
  4: { label: 'Moderate', detail: 'Interferes with concentration or tasks; hard to ignore', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  5: { label: 'Moderate+', detail: 'Distracting; requires modifications to daily routine', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  6: { label: 'Noticeably Disruptive', detail: 'Limits typical physical or cognitive activities', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  7: { label: 'Severe', detail: 'Significantly limits activities; difficult to function', color: 'bg-orange-200 text-orange-900 border-orange-400' },
  8: { label: 'Very Severe', detail: 'Prevents normal daily tasks; bed rest or stoppage needed', color: 'bg-rose-100 text-rose-800 border-rose-300' },
  9: { label: 'Extremely Severe', detail: 'Near incapacitating; severe distress', color: 'bg-rose-200 text-rose-900 border-rose-400' },
  10: { label: 'Worst Possible', detail: 'Completely debilitating and overwhelming', color: 'bg-red-700 text-white border-red-800' },
};

export function getSeverityLabel(severity: number): string {
  return SEVERITY_DESCRIPTIONS[severity]?.label || 'Moderate';
}

