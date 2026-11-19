/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Attachment, Person, Condition, SymptomEntry, DailyVitalLog } from '../types/index.ts';
import {
  UserPlus,
  Edit3,
  Trash2,
  Plus,
  Phone,
  ChevronRight,
  Paperclip,
  HeartPulse,
} from 'lucide-react';
import { AttachmentBadgeStrip } from './AttachmentSection.tsx';
import { AttachmentViewerModal } from './AttachmentViewerModal.tsx';
import { getBloodSugarReadings, formatBloodSugarContext } from '../utils/vitals.ts';

interface PatientProfileViewProps {
  activePerson: Person;
  people: Person[];
  conditions: Condition[];
  symptoms: SymptomEntry[];
  vitalLogs?: DailyVitalLog[];
  onSelectPerson: (id: string) => void;
  onOpenCreateProfile: () => void;
  onOpenEditProfile: (p: Person) => void;
  onDeletePerson: (id: string) => Promise<void>;
  onNavigateToDiseases: (conditionId?: string) => void;
  onOpenLogModal: () => void;
  onOpenVitalsModal?: (entry?: DailyVitalLog) => void;
  onDeleteVitalLog?: (id: string) => Promise<void>;
  onOpenAddDisease: () => void;
}

export const PatientProfileView: React.FC<PatientProfileViewProps> = ({
  activePerson,
  people,
  conditions,
  symptoms,
  vitalLogs = [],
  onSelectPerson,
  onOpenCreateProfile,
  onOpenEditProfile,
  onDeletePerson,
  onNavigateToDiseases,
  onOpenLogModal,
  onOpenVitalsModal,
  onDeleteVitalLog,
  onOpenAddDisease,
}) => {
  const calculateBmi = (): { bmi: string; category: string } | null => {
    if (!activePerson.weight) return null;
    let weightKg = activePerson.weight;
    if (activePerson.weight_unit !== 'kg') {
      weightKg = activePerson.weight * 0.453592;
    }

    let heightM: number | null = null;
    if (activePerson.height) {
      const hStr = activePerson.height.toLowerCase();
      const ftMatch = hStr.match(/(\d+)\s*(?:ft|')(?:\s*(\d+)\s*(?:in|"))?/);
      if (ftMatch) {
        const feet = parseInt(ftMatch[1], 10);
        const inches = ftMatch[2] ? parseInt(ftMatch[2], 10) : 0;
        const totalInches = feet * 12 + inches;
        heightM = totalInches * 0.0254;
      } else {
        const cmMatch = hStr.match(/(\d+(?:\.\d+)?)\s*(?:cm)?/);
        if (cmMatch) {
          const val = parseFloat(cmMatch[1]);
          if (val > 50 && val < 250) {
            heightM = val / 100;
          }
        }
      }
    }

    if (!heightM || heightM <= 0) return null;

    const bmiVal = weightKg / (heightM * heightM);
    const bmiFixed = bmiVal.toFixed(1);
    let category = 'Normal';
    if (bmiVal < 18.5) category = 'Underweight';
    else if (bmiVal >= 25 && bmiVal < 30) category = 'Overweight';
    else if (bmiVal >= 30) category = 'Obese';

    return { bmi: bmiFixed, category };
  };

  const bmiData = calculateBmi();

  const [confirmDeletePersonId, setConfirmDeletePersonId] = useState<string | null>(null);
  const [confirmDeleteVitalId, setConfirmDeleteVitalId] = useState<string | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const personSymptoms = symptoms.filter((s) => s.person_id === activePerson.id);
  const sortedVitalLogs = [...vitalLogs]
    .filter((v) => v.person_id === activePerson.id)
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  const allUploadedFiles: Attachment[] = [
    ...conditions.flatMap((c) => c.attachments || []),
    ...personSymptoms.flatMap((s) => s.attachments || []),
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-14 text-zinc-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-900">
            Patient Profiles &amp; Medical History
          </h1>
          <p className="text-3xs text-zinc-500 mt-0.5">
            Baseline measurements, daily vitals log, medical history, allergies, and quick health logging
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          {onOpenVitalsModal && (
            <button
              type="button"
              onClick={() => onOpenVitalsModal()}
              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Log Daily Vitals</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLogModal}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-700" />
            <span>Log Symptom</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddDisease}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-700" />
            <span>Log New Disease</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateProfile}
            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50/40 border border-zinc-200 text-zinc-700 rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-600" />
            <span>New Profile</span>
          </button>
        </div>
      </div>

      {/* Patient Switcher Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-emerald-200/60 scrollbar-none">
        {people.map((p) => {
          const isSelected = p.id === activePerson.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPerson(p.id)}
              className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white border border-emerald-200/80 text-zinc-700 hover:bg-emerald-50/50'
              }`}
            >
              <span>{p.name}</span>
              <span
                className={`text-3xs px-1.5 py-0.2 rounded ${
                  isSelected ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                {p.relationship}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenCreateProfile}
          className="px-2.5 py-1.5 rounded-md text-2xs font-medium border border-dashed border-emerald-300 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50/40 bg-white cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
        >
          <UserPlus className="w-3 h-3" />
          <span>Add Patient</span>
        </button>
      </div>

      {/* Active Patient Card */}
      <div className="bg-white rounded-xl p-4 border border-emerald-200/70 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 pb-3 border-b border-zinc-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900">{activePerson.name}</h2>
              <span className="text-2xs uppercase tracking-wider text-emerald-700 font-medium">
                · {activePerson.relationship}
              </span>
              {activePerson.birth_date && (
                <span className="text-2xs text-zinc-400">
                  · DOB: {new Date(activePerson.birth_date).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>

            {activePerson.allergies ? (
              <p className="text-xs text-rose-600 mt-1">
                <strong>Allergies:</strong> {activePerson.allergies}
              </p>
            ) : (
              <p className="text-2xs text-zinc-400 mt-0.5">No drug/food allergies recorded</p>
            )}

            {activePerson.notes && (
              <p className="text-xs text-zinc-500 mt-1 italic">
                &ldquo;{activePerson.notes}&rdquo;
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-start">
            <button
              type="button"
              onClick={() => onOpenEditProfile(activePerson)}
              className="px-2.5 py-1 rounded-md border border-emerald-200 text-xs font-medium text-emerald-800 hover:bg-emerald-50 flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Edit Profile</span>
            </button>
            {people.length > 1 && (
              confirmDeletePersonId === activePerson.id ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await onDeletePerson(activePerson.id);
                      setConfirmDeletePersonId(null);
                    }}
                    className="px-2 py-1 bg-rose-600 text-white rounded text-2xs font-medium cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeletePersonId(null)}
                    className="px-2 py-1 text-zinc-600 hover:bg-zinc-100 rounded text-2xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeletePersonId(activePerson.id)}
                  className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                  title="Delete patient profile"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        </div>

        {/* Current Medications & Medical History */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-zinc-50/70 border border-zinc-200/70 space-y-1">
            <span className="text-3xs font-semibold text-emerald-900 uppercase tracking-wider block">
              Current Medications &amp; Supplements
            </span>
            {activePerson.current_medications ? (
              <p className="text-2xs text-zinc-800 leading-relaxed">
                {activePerson.current_medications}
              </p>
            ) : (
              <p className="text-3xs text-zinc-400 italic">No daily prescriptions recorded.</p>
            )}
          </div>

          <div className="p-3 rounded-lg bg-zinc-50/70 border border-zinc-200/70 space-y-1">
            <span className="text-3xs font-semibold text-emerald-900 uppercase tracking-wider block">
              Medical History &amp; Surgeries
            </span>
            {activePerson.medical_history ? (
              <p className="text-2xs text-zinc-800 leading-relaxed">
                {activePerson.medical_history}
              </p>
            ) : (
              <p className="text-3xs text-zinc-400 italic">No past surgeries or major medical history noted.</p>
            )}
          </div>
        </div>

        {/* Standalone Daily Vitals Tracker (Multiple Entries Per Day) */}
        <div className="p-3.5 rounded-lg bg-emerald-50/35 border border-emerald-200/70 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-3xs font-semibold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-emerald-700" />
                Daily Vitals Log ({sortedVitalLogs.length})
              </span>
              <p className="text-3xs text-zinc-500 mt-0.5">
                Track BP, blood sugar, SpO2, pulse, temperature &amp; weight multiple times daily without disease or symptom links
              </p>
            </div>
            {onOpenVitalsModal && (
              <button
                type="button"
                onClick={() => onOpenVitalsModal()}
                className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-2xs font-medium flex items-center gap-1 cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Plus className="w-3 h-3" />
                <span>Log Daily Vitals</span>
              </button>
            )}
          </div>

          {sortedVitalLogs.length === 0 ? (
            <p className="text-3xs text-zinc-500">
              No daily vitals logged yet for {activePerson.name}. Click &ldquo;Log Daily Vitals&rdquo; to record BP, blood sugar, or SpO2 anytime.
            </p>
          ) : (
            <div className="divide-y divide-emerald-100 bg-white rounded-lg border border-emerald-200/60 px-3">
              {sortedVitalLogs.map((log) => {
                const sugars = getBloodSugarReadings(log);
                return (
                  <div
                    key={log.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-2xs font-semibold text-emerald-900 tabular-nums">
                          {new Date(log.recorded_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {log.blood_pressure_systolic && log.blood_pressure_diastolic && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-2xs font-medium text-zinc-800">
                            BP {log.blood_pressure_systolic}/{log.blood_pressure_diastolic} mmHg
                          </span>
                        )}
                        {sugars.map((sr) => (
                          <span
                            key={sr.id}
                            className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-2xs font-medium text-zinc-800"
                          >
                            Sugar ({formatBloodSugarContext(sr.context, true)}): {sr.value} mg/dL
                            {sr.time_note ? ` · ${sr.time_note}` : ''}
                          </span>
                        ))}
                        {log.oxygen_spo2 !== undefined && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-2xs font-medium text-zinc-800">
                            SpO2 {log.oxygen_spo2}%
                          </span>
                        )}
                        {log.pulse !== undefined && (
                          <span className="px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-2xs text-zinc-700">
                            Pulse {log.pulse} bpm
                          </span>
                        )}
                        {log.temperature !== undefined && (
                          <span className="px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-2xs text-zinc-700">
                            Temp {log.temperature}°{log.temperature_unit || 'F'}
                          </span>
                        )}
                        {log.weight !== undefined && (
                          <span className="px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-2xs text-zinc-700">
                            Weight {log.weight} {log.weight_unit || 'kg'}
                          </span>
                        )}
                        {log.respiratory_rate !== undefined && (
                          <span className="px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-2xs text-zinc-700">
                            Resp {log.respiratory_rate}/min
                          </span>
                        )}
                      </div>
                      {log.remark && (
                        <p className="text-2xs text-zinc-500 italic">{log.remark}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {onOpenVitalsModal && (
                        <button
                          type="button"
                          onClick={() => onOpenVitalsModal(log)}
                          className="p-1 text-zinc-400 hover:text-emerald-700 rounded cursor-pointer"
                          title="Edit reading"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDeleteVitalLog &&
                        (confirmDeleteVitalId === log.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteVitalLog(log.id);
                                setConfirmDeleteVitalId(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 text-white rounded text-3xs font-medium cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteVitalId(null)}
                              className="px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-100 rounded text-3xs cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteVitalId(log.id)}
                            className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete reading"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chronic Conditions Associated with this Patient */}
        <div className="p-3 rounded-lg bg-emerald-50/30 border border-emerald-200/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-3xs font-semibold text-emerald-900 uppercase tracking-wider">
              Tracked Diseases &amp; Conditions ({conditions.length})
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenAddDisease}
                className="text-3xs text-emerald-700 font-semibold hover:underline cursor-pointer"
              >
                + Log New Disease
              </button>
              <button
                type="button"
                onClick={() => onNavigateToDiseases()}
                className="text-3xs text-zinc-700 font-medium hover:underline cursor-pointer"
              >
                Open Diseases &amp; Symptoms →
              </button>
            </div>
          </div>

          {conditions.length === 0 ? (
            <p className="text-3xs text-zinc-500">
              No diseases linked yet. Click &ldquo;Log New Disease&rdquo; above to add one.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((c) => {
                const count = personSymptoms.filter((s) => s.condition_ids?.includes(c.id)).length;
                const docCount = c.attachments?.length || 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onNavigateToDiseases(c.id)}
                    className="px-2.5 py-1 rounded-md border border-emerald-200 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-2xs text-zinc-700 flex items-center gap-1.5 cursor-pointer transition-colors group"
                    title={`View logs and documents for ${c.name}`}
                  >
                    <span className="font-medium text-zinc-900 group-hover:text-emerald-950">
                      {c.name}
                    </span>
                    <span className="text-3xs text-emerald-700 font-semibold group-hover:underline">
                      ({count} {count === 1 ? 'log' : 'logs'})
                    </span>
                    {docCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-3xs text-zinc-500">
                        <Paperclip className="w-2.5 h-2.5 text-emerald-700" />
                        {docCount}
                      </span>
                    )}
                    <ChevronRight className="w-3 h-3 text-emerald-600/70 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Uploaded Reports, Prescriptions & Documents Across Patient Records */}
        {allUploadedFiles.length > 0 && (
          <div className="p-3 rounded-lg bg-zinc-50/70 border border-emerald-200/60 space-y-1.5">
            <AttachmentBadgeStrip
              attachments={allUploadedFiles}
              onOpenAttachment={setViewingAttachment}
              label="Uploaded Reports, Prescriptions & Documents"
            />
          </div>
        )}

        {/* Emergency Contact */}
        {(activePerson.emergency_contact_name || activePerson.emergency_contact_phone) && (
          <div className="p-2.5 rounded-lg bg-zinc-50/60 border border-zinc-200/60 flex items-center gap-2 text-2xs text-zinc-600">
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              <strong>Emergency Contact:</strong> {activePerson.emergency_contact_name}{' '}
              {activePerson.emergency_contact_phone && `(${activePerson.emergency_contact_phone})`}
            </span>
          </div>
        )}

        {/* Basic Necessary Readings Grid (Bottom of Profile) */}
        <div className="space-y-1.5 pt-2 border-t border-zinc-100">
          <span className="text-2xs font-semibold text-emerald-900 uppercase tracking-wider block">
            Basic Necessary Health Readings
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            <div className="p-3 rounded-lg bg-emerald-50/35 border border-emerald-200/60">
              <span className="text-2xs text-zinc-500 block mb-0.5">Height</span>
              <span className="font-semibold text-zinc-900 text-sm">
                {activePerson.height || '—'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/35 border border-emerald-200/60">
              <span className="text-2xs text-zinc-500 block mb-0.5">Weight</span>
              <span className="font-semibold text-zinc-900 text-sm">
                {activePerson.weight ? `${activePerson.weight} ${activePerson.weight_unit || 'kg'}` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/35 border border-emerald-200/60">
              <span className="text-2xs text-zinc-500 block mb-0.5">Est. BMI</span>
              {bmiData ? (
                <div className="flex items-baseline gap-1">
                  <span className="font-semibold text-zinc-900 text-sm">{bmiData.bmi}</span>
                  <span className="text-2xs text-emerald-700 font-sans">({bmiData.category})</span>
                </div>
              ) : (
                <span className="font-semibold text-zinc-400 text-sm">—</span>
              )}
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/35 border border-emerald-200/60">
              <span className="text-2xs text-zinc-500 block mb-0.5">Blood Group</span>
              <span className="font-semibold text-zinc-900 text-sm">
                {activePerson.blood_type || 'Unknown'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50/35 border border-emerald-200/60">
              <span className="text-2xs text-zinc-500 block mb-0.5">Baseline BP</span>
              <span className="font-semibold text-zinc-900 text-sm">
                {activePerson.baseline_bp || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <AttachmentViewerModal
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
};
