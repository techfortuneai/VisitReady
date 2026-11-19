/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BloodSugarContext, BloodSugarReading, Vitals } from '../types/index.ts';

export const BLOOD_SUGAR_CONTEXT_OPTIONS: { value: BloodSugarContext; label: string; shortLabel: string }[] = [
  { value: 'fasting', label: 'Fasting', shortLabel: 'Fasting' },
  { value: 'non-fasting', label: 'Non-Fasting', shortLabel: 'Non-Fasting' },
  { value: 'random', label: 'Random', shortLabel: 'Random' },
  { value: 'post-meal', label: 'Post-Meal (PP)', shortLabel: 'PP' },
  { value: 'bedtime', label: 'Bedtime', shortLabel: 'Bedtime' },
];

export function formatBloodSugarContext(context?: BloodSugarContext, compact = false): string {
  const match = BLOOD_SUGAR_CONTEXT_OPTIONS.find((opt) => opt.value === context);
  if (!match) return 'Fasting';
  return compact ? match.shortLabel : match.label;
}

export function getBloodSugarReadings(vitals?: Vitals): BloodSugarReading[] {
  if (!vitals) return [];
  if (Array.isArray(vitals.blood_sugar_readings) && vitals.blood_sugar_readings.length > 0) {
    return vitals.blood_sugar_readings.filter(
      (r) => typeof r?.value === 'number' && Number.isFinite(r.value)
    );
  }
  if (typeof vitals.blood_sugar === 'number' && Number.isFinite(vitals.blood_sugar)) {
    return [
      {
        id: 'legacy-sugar',
        value: vitals.blood_sugar,
        context: vitals.blood_sugar_context || 'fasting',
      },
    ];
  }
  return [];
}

export function formatBloodSugarSummary(vitals?: Vitals, compact = false): string {
  const readings = getBloodSugarReadings(vitals);
  if (readings.length === 0) return '';
  return readings
    .map((r) => {
      const ctxLabel = formatBloodSugarContext(r.context, compact);
      const timePart = !compact && r.time_note ? ` @ ${r.time_note}` : '';
      return `${r.value} mg/dL (${ctxLabel}${timePart})`;
    })
    .join(', ');
}
