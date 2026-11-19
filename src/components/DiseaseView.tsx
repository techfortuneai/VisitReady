/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Attachment,
  Condition,
  Person,
  SymptomEntry,
} from '../types/index.ts';
import {
  Plus,
  Search,
  Trash2,
  Edit2,
  Stethoscope,
} from 'lucide-react';
import { AttachmentBadgeStrip } from './AttachmentSection.tsx';
import { AttachmentViewerModal } from './AttachmentViewerModal.tsx';
import { getBloodSugarReadings, formatBloodSugarContext } from '../utils/vitals.ts';

interface DiseaseViewProps {
  activePerson: Person;
  conditions: Condition[];
  symptoms: SymptomEntry[];
  initialConditionId?: string;
  onOpenLogModal: (entry?: SymptomEntry, preselectedConditionId?: string) => void;
  onOpenConditionsModal: () => void;
  onEditCondition?: (condition: Condition) => void;
  onDeleteSymptom: (id: string) => Promise<void>;
  onDeleteCondition: (id: string) => Promise<void>;
}

export const DiseaseView: React.FC<DiseaseViewProps> = ({
  activePerson,
  conditions,
  symptoms,
  initialConditionId,
  onOpenLogModal,
  onOpenConditionsModal,
  onEditCondition,
  onDeleteSymptom,
  onDeleteCondition,
}) => {
  const [selectedConditionId, setSelectedConditionId] = useState<string>(
    initialConditionId || 'all'
  );
  const [selectedDoctorKey, setSelectedDoctorKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const [confirmDeleteConditionId, setConfirmDeleteConditionId] = useState<string | null>(null);
  const [confirmDeleteSymptomId, setConfirmDeleteSymptomId] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialConditionId) {
      setSelectedConditionId(initialConditionId);
    } else if (initialConditionId === undefined) {
      setSelectedConditionId('all');
    }
  }, [initialConditionId]);

  const activeCondition = useMemo(() => {
    if (selectedConditionId === 'all') return null;
    return conditions.find((c) => c.id === selectedConditionId) || null;
  }, [conditions, selectedConditionId]);

  React.useEffect(() => {
    if (selectedConditionId !== 'all' && !conditions.some((c) => c.id === selectedConditionId)) {
      setSelectedConditionId('all');
    }
  }, [conditions, selectedConditionId]);

  React.useEffect(() => {
    setSelectedDoctorKey('all');
  }, [activePerson.id, selectedConditionId]);

  const doctorDirectory = useMemo(() => {
    const scopeConditions = activeCondition ? [activeCondition] : conditions;
    const map = new Map<
      string,
      {
        key: string;
        doctor_name: string;
        specialties: string[];
        treatmentCount: number;
      }
    >();

    scopeConditions.forEach((cond) => {
      (cond.doctor_treatments || []).forEach((plan) => {
        const key = plan.doctor_name.trim().toLowerCase();
        if (!key) return;
        const existing = map.get(key);
        if (existing) {
          if (
            plan.specialty_or_clinic &&
            !existing.specialties.includes(plan.specialty_or_clinic)
          ) {
            existing.specialties.push(plan.specialty_or_clinic);
          }
          existing.treatmentCount += plan.treatments.length;
        } else {
          map.set(key, {
            key,
            doctor_name: plan.doctor_name.trim(),
            specialties: plan.specialty_or_clinic ? [plan.specialty_or_clinic] : [],
            treatmentCount: plan.treatments.length,
          });
        }
      });
    });

    return Array.from(map.values());
  }, [activeCondition, conditions]);

  const selectedDoctorInfo = useMemo(
    () => doctorDirectory.find((d) => d.key === selectedDoctorKey) || null,
    [doctorDirectory, selectedDoctorKey]
  );

  const selectedDoctorPlansAcrossConditions = useMemo(() => {
    if (selectedDoctorKey === 'all') return [];
    const scope = activeCondition ? [activeCondition] : conditions;
    return scope
      .map((cond) => {
        const matchingPlans = (cond.doctor_treatments || []).filter(
          (p) => p.doctor_name.trim().toLowerCase() === selectedDoctorKey
        );
        if (matchingPlans.length === 0) return null;
        return { condition: cond, plans: matchingPlans };
      })
      .filter(Boolean) as {
      condition: Condition;
      plans: NonNullable<Condition['doctor_treatments']>;
    }[];
  }, [selectedDoctorKey, activeCondition, conditions]);

  const matchingConditionIdsForDoctor = useMemo(() => {
    if (selectedDoctorKey === 'all') return null;
    return new Set(selectedDoctorPlansAcrossConditions.map((item) => item.condition.id));
  }, [selectedDoctorKey, selectedDoctorPlansAcrossConditions]);

  const diseaseSymptoms = useMemo(() => {
    return symptoms.filter((s) => {
      if (selectedConditionId !== 'all') {
        if (!s.condition_ids?.includes(selectedConditionId)) return false;
      } else if (matchingConditionIdsForDoctor) {
        const hasMatchingCond = s.condition_ids?.some((cid) =>
          matchingConditionIdsForDoctor.has(cid)
        );
        if (!hasMatchingCond) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          s.symptom_name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.context?.toLowerCase().includes(q) ||
          s.possible_triggers?.toLowerCase().includes(q) ||
          s.body_location?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (severityFilter === 'mild' && (s.severity_0_to_10 < 1 || s.severity_0_to_10 > 3)) return false;
      if (severityFilter === 'moderate' && (s.severity_0_to_10 < 4 || s.severity_0_to_10 > 6)) return false;
      if (severityFilter === 'severe' && s.severity_0_to_10 < 7) return false;

      return true;
    });
  }, [
    symptoms,
    selectedConditionId,
    matchingConditionIdsForDoctor,
    searchQuery,
    severityFilter,
  ]);

  const symptomCountByCondition = useMemo(() => {
    const map = new Map<string, number>();
    conditions.forEach((c) => map.set(c.id, 0));
    symptoms.forEach((s) => {
      s.condition_ids?.forEach((cId) => {
        map.set(cId, (map.get(cId) || 0) + 1);
      });
    });
    return map;
  }, [conditions, symptoms]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-14 text-zinc-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-900">
            Diseases &amp; Symptoms
          </h1>
          <p className="text-3xs text-zinc-500 mt-0.5">
            Organize conditions for {activePerson.name} and view symptom logs per disease
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenConditionsModal}
            className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log New Disease</span>
          </button>
        </div>
      </div>

      {/* Disease Tabs Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-emerald-200/60 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedConditionId('all')}
          className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            selectedConditionId === 'all'
              ? 'bg-emerald-700 text-white'
              : 'bg-white border border-emerald-200/80 text-zinc-700 hover:bg-emerald-50/40'
          }`}
        >
          <span>All Diseases</span>
          <span
            className={`text-3xs px-1.5 py-0.2 rounded ${
              selectedConditionId === 'all' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {symptoms.length}
          </span>
        </button>

        {conditions.map((c) => {
          const isSelected = selectedConditionId === c.id;
          const count = symptomCountByCondition.get(c.id) || 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedConditionId(c.id)}
              className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white border border-emerald-200/80 text-zinc-700 hover:bg-emerald-50/40'
              }`}
            >
              <span>{c.name}</span>
              <span
                className={`text-3xs px-1.5 py-0.2 rounded ${
                  isSelected ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenConditionsModal}
          className="px-2.5 py-1.5 rounded-md text-2xs font-medium border border-dashed border-emerald-300 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50/40 bg-white cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          <span>New Disease</span>
        </button>
      </div>

      {/* Dynamic Selective Doctor Filter Bar */}
      {doctorDirectory.length > 0 && (
        <div className="bg-white rounded-xl px-3.5 py-2.5 border border-emerald-200/70 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-wider text-emerald-800 mr-1">
              <Stethoscope className="w-3.5 h-3.5 text-emerald-700" />
              <span>Filter by Doctor:</span>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDoctorKey('all')}
              className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors cursor-pointer ${
                selectedDoctorKey === 'all'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50/50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
              }`}
            >
              All Doctors ({doctorDirectory.length})
            </button>
            {doctorDirectory.map((doc) => {
              const isActiveDoc = selectedDoctorKey === doc.key;
              return (
                <button
                  key={doc.key}
                  type="button"
                  onClick={() => setSelectedDoctorKey(isActiveDoc ? 'all' : doc.key)}
                  className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    isActiveDoc
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-400 underline-offset-2 hover:underline'
                  }`}
                >
                  <span>{doc.doctor_name}</span>
                  {doc.specialties.length > 0 && (
                    <span className={isActiveDoc ? 'text-emerald-100' : 'text-zinc-400'}>
                      · {doc.specialties[0]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedDoctorInfo && (
            <button
              type="button"
              onClick={() => setSelectedDoctorKey('all')}
              className="text-3xs font-medium text-emerald-700 hover:text-emerald-900 underline cursor-pointer shrink-0"
            >
              Show all doctors
            </button>
          )}
        </div>
      )}

      {/* Selective Treatment Panel Across All Conditions when All Diseases + a Doctor is Active */}
      {!activeCondition && selectedDoctorInfo && (
        <div className="bg-white rounded-xl p-3.5 border border-emerald-300 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-3xs font-semibold uppercase tracking-wider text-emerald-700 block">
                Selective Doctor Treatment View
              </span>
              <h2 className="text-xs font-semibold text-zinc-900">
                Treatments under {selectedDoctorInfo.doctor_name}
                {selectedDoctorInfo.specialties.length > 0
                  ? ` · ${selectedDoctorInfo.specialties.join(', ')}`
                  : ''}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDoctorKey('all')}
              className="text-2xs font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              View All Doctors
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {selectedDoctorPlansAcrossConditions.map(({ condition, plans }) => (
              <div
                key={condition.id}
                className="p-2.5 rounded-lg bg-emerald-50/40 border border-emerald-200/80 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConditionId(condition.id)}
                    className="font-semibold text-emerald-900 hover:underline cursor-pointer text-left"
                  >
                    {condition.name}
                  </button>
                  <span className="text-3xs uppercase px-1.5 py-0.2 rounded bg-white border border-emerald-200 text-emerald-800 font-medium">
                    {condition.status}
                  </span>
                </div>
                {plans.map((plan) => (
                  <div key={plan.id}>
                    {plan.treatments.length > 0 ? (
                      <ul className="space-y-0.5 text-2xs text-zinc-700">
                        {plan.treatments.map((t) => (
                          <li key={t.id}>
                            · <span className="font-medium text-zinc-800">{t.name}</span>
                            {t.notes ? <span className="text-zinc-500"> — {t.notes}</span> : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-2xs text-zinc-400">No treatments listed yet.</p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disease Detail Summary Card */}
      {activeCondition && (
        <div className="bg-white rounded-xl p-3.5 border border-emerald-200/70 shadow-2xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-semibold text-zinc-900">{activeCondition.name}</h2>
                <span className="text-3xs uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-medium">
                  {activeCondition.status}
                </span>
                {activeCondition.diagnosed_date && (
                  <span className="text-3xs text-zinc-400">
                    · Diagnosed {new Date(activeCondition.diagnosed_date).toLocaleDateString('en-IN')}
                  </span>
                )}
              </div>
              {activeCondition.notes && (
                <p className="text-2xs text-zinc-500 mt-1 line-clamp-2">
                  {activeCondition.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => onOpenLogModal(undefined, activeCondition.id)}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Symptoms</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onEditCondition ? onEditCondition(activeCondition) : onOpenConditionsModal()
                }
                className="p-1 text-zinc-400 hover:text-emerald-700 rounded cursor-pointer"
                title="Edit disease & doctors"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              {confirmDeleteConditionId === activeCondition.id ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await onDeleteCondition(activeCondition.id);
                      setConfirmDeleteConditionId(null);
                    }}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-3xs font-medium cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteConditionId(null)}
                    className="px-2 py-0.5 rounded text-3xs text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteConditionId(activeCondition.id)}
                  className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                  title="Delete disease"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Simultaneous Doctors & Respective Treatments (clickable active links) */}
          {activeCondition.doctor_treatments && activeCondition.doctor_treatments.length > 0 && (
            <div className="pt-2 border-t border-emerald-100">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-3xs font-semibold uppercase tracking-wider text-emerald-800">
                  {selectedDoctorInfo
                    ? `Treatment Under ${selectedDoctorInfo.doctor_name} Only`
                    : `Doctors & Simultaneous Treatments (${activeCondition.doctor_treatments.length})`}
                </div>
                {selectedDoctorInfo && (
                  <button
                    type="button"
                    onClick={() => setSelectedDoctorKey('all')}
                    className="text-3xs font-medium text-emerald-700 hover:underline cursor-pointer"
                  >
                    Show all doctors
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeCondition.doctor_treatments
                  .filter(
                    (plan) =>
                      selectedDoctorKey === 'all' ||
                      plan.doctor_name.trim().toLowerCase() === selectedDoctorKey
                  )
                  .map((plan) => {
                    const docKey = plan.doctor_name.trim().toLowerCase();
                    const isFocused = selectedDoctorKey === docKey;
                    return (
                      <div
                        key={plan.id}
                        className={`p-2.5 rounded-lg border text-xs transition-colors ${
                          isFocused
                            ? 'bg-emerald-50/80 border-emerald-400'
                            : 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDoctorKey(isFocused ? 'all' : docKey)}
                            className="font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 cursor-pointer text-left"
                          >
                            {plan.doctor_name}
                          </button>
                          {plan.specialty_or_clinic && (
                            <span className="font-normal text-zinc-500 text-2xs shrink-0">
                              {plan.specialty_or_clinic}
                            </span>
                          )}
                        </div>
                        {plan.treatments.length > 0 ? (
                          <ul className="mt-1.5 space-y-0.5 text-2xs text-zinc-700">
                            {plan.treatments.map((t) => (
                              <li key={t.id}>
                                · <span className="font-medium text-zinc-800">{t.name}</span>
                                {t.notes ? <span className="text-zinc-500"> — {t.notes}</span> : ''}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-2xs text-zinc-400 mt-1">No treatments listed yet.</p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {/* Disease Reports, Prescriptions & Uploaded Documents */}
          {activeCondition.attachments && activeCondition.attachments.length > 0 && (
            <div className="pt-2 border-t border-emerald-100">
              <AttachmentBadgeStrip
                attachments={activeCondition.attachments}
                onOpenAttachment={setViewingAttachment}
                label="Uploaded Reports, Prescriptions & Documents"
              />
            </div>
          )}
        </div>
      )}

      {!activeCondition &&
        conditions.some((c) => c.attachments && c.attachments.length > 0) && (
          <div className="bg-white rounded-xl p-3.5 border border-emerald-200/70 shadow-2xs space-y-2">
            <span className="text-3xs font-semibold uppercase tracking-wider text-emerald-800 block">
              Disease Reports &amp; Prescriptions
            </span>
            <div className="space-y-2">
              {conditions
                .filter((c) => c.attachments && c.attachments.length > 0)
                .map((c) => (
                  <div key={c.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedConditionId(c.id)}
                      className="text-xs font-semibold text-zinc-900 hover:text-emerald-800 hover:underline cursor-pointer"
                    >
                      {c.name}
                    </button>
                    <AttachmentBadgeStrip
                      attachments={c.attachments}
                      onOpenAttachment={setViewingAttachment}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

      {/* Disease Symptom Log Strip Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-900">
            {activeCondition ? `Symptom Log: ${activeCondition.name}` : 'All Disease Symptom Logs'}
          </span>
          <span className="text-3xs text-zinc-400">
            ({diseaseSymptoms.length} entries)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in disease log..."
              className="pl-7 pr-2.5 py-1 text-2xs rounded-md border border-zinc-200 bg-white text-zinc-800 focus:outline-hidden focus:border-emerald-500 w-44 sm:w-56"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2 py-1 rounded-md border border-zinc-200 bg-white text-zinc-700 text-3xs font-medium"
          >
            <option value="all">All Severities</option>
            <option value="mild">Mild (1-3)</option>
            <option value="moderate">Moderate (4-6)</option>
            <option value="severe">Severe (7-10)</option>
          </select>

          <button
            type="button"
            onClick={() => onOpenLogModal(undefined, activeCondition?.id)}
            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3 text-emerald-700" />
            <span>Log</span>
          </button>
        </div>
      </div>

      {/* Sleek Symptom Log List for the Disease */}
      <div className="bg-white rounded-xl border border-emerald-200/70 divide-y divide-zinc-100 shadow-2xs">
        {diseaseSymptoms.length === 0 ? (
          <div className="text-center py-10 px-4 space-y-2">
            <p className="text-2xs text-zinc-400">
              {activeCondition
                ? `No symptoms recorded for "${activeCondition.name}" yet.`
                : 'No symptoms recorded for any disease.'}
            </p>
            <button
              type="button"
              onClick={() => onOpenLogModal(undefined, activeCondition?.id)}
              className="text-2xs font-medium text-emerald-700 underline cursor-pointer"
            >
              + Record first symptom {activeCondition ? `for ${activeCondition.name}` : ''}
            </button>
          </div>
        ) : (
          diseaseSymptoms.map((entry) => {
            const matchedConds = conditions.filter((c) => entry.condition_ids?.includes(c.id));
            return (
              <div
                key={entry.id}
                className="p-3.5 hover:bg-emerald-50/30 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 group"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-zinc-900">
                      {entry.symptoms_list && entry.symptoms_list.length > 1
                        ? `${entry.symptoms_list.length} Symptoms Logged`
                        : entry.symptom_name}
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span className="text-2xs font-medium text-emerald-800">
                      Severity {entry.severity_0_to_10}/10
                    </span>
                    {entry.ongoing && (
                      <>
                        <span className="text-zinc-300">·</span>
                        <span className="text-2xs font-medium px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800">
                          Ongoing
                        </span>
                      </>
                    )}
                    {matchedConds.map((c) => (
                      <span
                        key={c.id}
                        className="text-2xs px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 font-medium"
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>

                  {entry.symptoms_list && entry.symptoms_list.length > 1 && (
                    <ul className="pl-3.5 list-disc space-y-0.5 text-xs text-zinc-800 font-medium pt-0.5">
                      {entry.symptoms_list.map((symItem, symIdx) => (
                        <li key={symIdx}>{symItem}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-2xs text-zinc-500">
                    <span>
                      {new Date(entry.start_datetime).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {entry.duration_text && <span>· Dur: {entry.duration_text}</span>}
                    {entry.body_location && <span>· Loc: {entry.body_location}</span>}
                  </div>

                  {entry.description && (
                    <p className="text-xs text-zinc-600 leading-relaxed pt-0.5">
                      {entry.description}
                    </p>
                  )}

                  {(entry.context || entry.possible_triggers || entry.better_or_worse_notes) && (
                    <div className="text-2xs text-zinc-500 pt-0.5 space-y-0.5">
                      {entry.context && <div>Context: {entry.context}</div>}
                      {entry.possible_triggers && (
                        <div>Observation/Trigger: {entry.possible_triggers}</div>
                      )}
                      {entry.better_or_worse_notes && (
                        <div>Relief / Aggravation: {entry.better_or_worse_notes}</div>
                      )}
                    </div>
                  )}

                  {entry.vitals && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-emerald-900 pt-1 border-t border-zinc-100">
                      {entry.vitals.blood_pressure_systolic && entry.vitals.blood_pressure_diastolic && (
                        <span>BP {entry.vitals.blood_pressure_systolic}/{entry.vitals.blood_pressure_diastolic}</span>
                      )}
                      {entry.vitals.pulse && <span>Pulse {entry.vitals.pulse} bpm</span>}
                      {entry.vitals.temperature && (
                        <span>Temp {entry.vitals.temperature}°{entry.vitals.temperature_unit || 'F'}</span>
                      )}
                      {entry.vitals.oxygen_spo2 && <span>SpO2 {entry.vitals.oxygen_spo2}%</span>}
                      {getBloodSugarReadings(entry.vitals).map((sr) => (
                        <span key={sr.id}>
                          Sugar ({formatBloodSugarContext(sr.context, true)}): {sr.value} mg/dL
                          {sr.time_note ? ` @ ${sr.time_note}` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                  {entry.attachments && entry.attachments.length > 0 && (
                    <AttachmentBadgeStrip
                      attachments={entry.attachments}
                      onOpenAttachment={setViewingAttachment}
                      label="Attached Reports / Photos"
                    />
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0 self-end sm:self-start opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onOpenLogModal(entry)}
                    className="p-1 text-zinc-400 hover:text-emerald-700 rounded cursor-pointer"
                    title="Edit entry"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {confirmDeleteSymptomId === entry.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteSymptom(entry.id);
                          setConfirmDeleteSymptomId(null);
                        }}
                        className="px-2 py-0.5 rounded bg-rose-600 text-white text-3xs font-medium cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSymptomId(null)}
                        className="px-1.5 py-0.5 rounded text-3xs text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSymptomId(entry.id)}
                      className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AttachmentViewerModal
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
};
