/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  SymptomEntry,
  Attachment,
  Condition,
  Person,
  BloodSugarContext,
  BloodSugarReading,
} from '../types/index.ts';
import { getSeverityLabel, containsEmergencyKeyword } from '../utils/safety.ts';
import { BLOOD_SUGAR_CONTEXT_OPTIONS, getBloodSugarReadings } from '../utils/vitals.ts';
import { X, Trash2, HeartPulse, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { EmergencyBanner } from './EmergencyBanner.tsx';
import { AttachmentSection } from './AttachmentSection.tsx';
import { AttachmentViewerModal } from './AttachmentViewerModal.tsx';

interface SymptomEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entries: Partial<SymptomEntry>[]) => Promise<void>;
  editingEntry?: SymptomEntry | null;
  personId: string;
  people?: Person[];
  conditions: Condition[];
  preselectedConditionId?: string;
}

interface SugarReadingDraft {
  id: string;
  value: string;
  context: BloodSugarContext;
  timeNote: string;
}

interface SymptomDraft {
  id: string;
  symptomText: string;
  severity: number;
  startDatetime: string;
  ongoing: boolean;
  endDatetime: string;
  durationText: string;
  bodyLocation: string;
  dailyImpact: string;
  description: string;
  possibleTriggers: string;
  betterOrWorseNotes: string;
  tagsInput: string;
  showVitals: boolean;
  bpSystolic: string;
  bpDiastolic: string;
  temp: string;
  tempUnit: 'F' | 'C';
  pulse: string;
  sugarReadings: SugarReadingDraft[];
  spo2: string;
  weight: string;
  weightUnit: 'lbs' | 'kg';
  attachments: Attachment[];
  isExpanded: boolean;
}

function generateDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLocalDatetimeString(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
}

function createEmptyDraft(defaultWeightUnit: 'lbs' | 'kg' = 'kg'): SymptomDraft {
  return {
    id: generateDraftId(),
    symptomText: '',
    severity: 5,
    startDatetime: getLocalDatetimeString(),
    ongoing: true,
    endDatetime: '',
    durationText: '',
    bodyLocation: '',
    dailyImpact: '',
    description: '',
    possibleTriggers: '',
    betterOrWorseNotes: '',
    tagsInput: '',
    showVitals: false,
    bpSystolic: '',
    bpDiastolic: '',
    temp: '',
    tempUnit: 'F',
    pulse: '',
    sugarReadings: [{ id: generateDraftId(), value: '', context: 'fasting', timeNote: '' }],
    spo2: '',
    weight: '',
    weightUnit: defaultWeightUnit,
    attachments: [],
    isExpanded: true,
  };
}

function createDraftFromEntry(
  entry: SymptomEntry,
  fallbackWeightUnit: 'lbs' | 'kg' = 'kg'
): SymptomDraft {
  const v = entry.vitals;
  const hasVitals = Boolean(v && Object.keys(v).length > 0);
  const existingSugars = getBloodSugarReadings(v);
  const sugarDrafts: SugarReadingDraft[] =
    existingSugars.length > 0
      ? existingSugars.map((r) => ({
          id: r.id || generateDraftId(),
          value: String(r.value),
          context: r.context || 'fasting',
          timeNote: r.time_note || '',
        }))
      : [{ id: generateDraftId(), value: '', context: 'fasting', timeNote: '' }];

  return {
    id: entry.id,
    symptomText: entry.symptom_name || '',
    severity: entry.severity_0_to_10 ?? 5,
    startDatetime: entry.start_datetime ? entry.start_datetime.slice(0, 16) : getLocalDatetimeString(),
    ongoing: entry.ongoing,
    endDatetime: entry.end_datetime ? entry.end_datetime.slice(0, 16) : '',
    durationText: entry.duration_text || '',
    bodyLocation: entry.body_location || '',
    dailyImpact: entry.daily_impact || '',
    description: entry.description || '',
    possibleTriggers: entry.possible_triggers || '',
    betterOrWorseNotes: entry.better_or_worse_notes || '',
    tagsInput: entry.tags?.join(', ') || '',
    showVitals: hasVitals,
    bpSystolic: v?.blood_pressure_systolic ? String(v.blood_pressure_systolic) : '',
    bpDiastolic: v?.blood_pressure_diastolic ? String(v.blood_pressure_diastolic) : '',
    temp: v?.temperature ? String(v.temperature) : '',
    tempUnit: v?.temperature_unit || 'F',
    pulse: v?.pulse ? String(v.pulse) : '',
    sugarReadings: sugarDrafts,
    spo2: v?.oxygen_spo2 ? String(v.oxygen_spo2) : '',
    weight: v?.weight ? String(v.weight) : '',
    weightUnit: v?.weight_unit || fallbackWeightUnit,
    attachments: entry.attachments || [],
    isExpanded: true,
  };
}

export const SymptomEntryModal: React.FC<SymptomEntryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEntry,
  personId,
  people = [],
  conditions,
  preselectedConditionId,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState(personId);
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<SymptomDraft[]>(() => [createEmptyDraft('kg')]);
  const [readingFilesCount, setReadingFilesCount] = useState(0);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const personConditions = conditions.filter((c) => c.person_id === selectedPersonId);
  const currentModalPerson = people.find((p) => p.id === selectedPersonId);

  useEffect(() => {
    if (!isOpen) return;
    if (editingEntry) {
      setSelectedPersonId(editingEntry.person_id);
      setSelectedConditionIds(editingEntry.condition_ids || []);
      const targetPerson = people.find((p) => p.id === editingEntry.person_id);
      setDrafts([createDraftFromEntry(editingEntry, targetPerson?.weight_unit || 'kg')]);
    } else {
      setSelectedPersonId(personId);
      setSelectedConditionIds(preselectedConditionId ? [preselectedConditionId] : []);
      const targetPerson = people.find((p) => p.id === personId);
      setDrafts([createEmptyDraft(targetPerson?.weight_unit || 'kg')]);
    }
    setReadingFilesCount(0);
    setError('');
  }, [isOpen, editingEntry, personId, preselectedConditionId]);

  if (!isOpen) return null;

  const combinedTextForEmergency = drafts
    .map((d) => `${d.symptomText} ${d.description}`)
    .join(' ');
  const isEmergencyInput = containsEmergencyKeyword(combinedTextForEmergency);
  const preselectedCondition = preselectedConditionId
    ? conditions.find((c) => c.id === preselectedConditionId)
    : undefined;

  const handlePersonSwitch = (newPersonId: string) => {
    setSelectedPersonId(newPersonId);
    setSelectedConditionIds([]);
    const p = people.find((item) => item.id === newPersonId);
    if (p?.weight_unit) {
      setDrafts((prev) => prev.map((d) => ({ ...d, weightUnit: p.weight_unit! })));
    }
  };

  const toggleCondition = (cid: string) => {
    setSelectedConditionIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const updateDraft = <K extends keyof SymptomDraft>(
    draftId: string,
    field: K,
    value: SymptomDraft[K]
  ) => {
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, [field]: value } : d)));
    if (error) setError('');
  };

  const addAnotherSymptomProfile = () => {
    const unit = currentModalPerson?.weight_unit || 'kg';
    setDrafts((prev) => [
      ...prev.map((d) => ({ ...d, isExpanded: false })),
      createEmptyDraft(unit),
    ]);
  };

  const removeDraft = (draftId: string) => {
    setDrafts((prev) => {
      const filtered = prev.filter((d) => d.id !== draftId);
      if (filtered.length === 0) {
        return [createEmptyDraft(currentModalPerson?.weight_unit || 'kg')];
      }
      if (!filtered.some((d) => d.isExpanded)) {
        filtered[filtered.length - 1] = { ...filtered[filtered.length - 1], isExpanded: true };
      }
      return filtered;
    });
  };

  const toggleExpandDraft = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, isExpanded: !d.isExpanded } : d))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readingFilesCount > 0) {
      setError('Please wait a moment while uploaded files finish loading.');
      return;
    }

    const targetPersonId = selectedPersonId || personId || people[0]?.id;
    if (!targetPersonId) {
      setError('Please select a patient profile first.');
      return;
    }

    const toOptionalNum = (val: string) => {
      if (!val.trim()) return undefined;
      const n = Number(val);
      return Number.isFinite(n) ? n : undefined;
    };

    const payloads: Partial<SymptomEntry>[] = [];

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const prefix = drafts.length > 1 ? `Symptom ${i + 1}: ` : '';
      const trimmedSymptom = d.symptomText.trim();
      if (!trimmedSymptom) {
        setDrafts((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, isExpanded: true } : item))
        );
        setError(`${prefix}Please describe the symptom or health concern.`);
        return;
      }

      const parsedStart = d.startDatetime ? new Date(d.startDatetime) : new Date();
      if (Number.isNaN(parsedStart.getTime())) {
        setDrafts((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, isExpanded: true } : item))
        );
        setError(`${prefix}Please enter a valid started date and time.`);
        return;
      }

      let parsedEndIso: string | undefined = undefined;
      if (!d.ongoing && d.endDatetime) {
        const parsedEnd = new Date(d.endDatetime);
        if (Number.isNaN(parsedEnd.getTime())) {
          setDrafts((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, isExpanded: true } : item))
          );
          setError(`${prefix}Please enter a valid end date and time.`);
          return;
        }
        parsedEndIso = parsedEnd.toISOString();
      }

      const cleanedSugarReadings: BloodSugarReading[] = d.sugarReadings
        .map((r) => {
          const val = toOptionalNum(r.value);
          if (val === undefined || val <= 0) return null;
          return {
            id: r.id || generateDraftId(),
            value: val,
            context: r.context,
            time_note: r.timeNote.trim() || undefined,
          } as BloodSugarReading;
        })
        .filter(Boolean) as BloodSugarReading[];

      const vitalsObj =
        d.showVitals &&
        (d.bpSystolic ||
          d.bpDiastolic ||
          d.temp ||
          d.pulse ||
          cleanedSugarReadings.length > 0 ||
          d.spo2 ||
          d.weight)
          ? {
              blood_pressure_systolic: toOptionalNum(d.bpSystolic),
              blood_pressure_diastolic: toOptionalNum(d.bpDiastolic),
              temperature: toOptionalNum(d.temp),
              temperature_unit: d.tempUnit,
              pulse: toOptionalNum(d.pulse),
              blood_sugar: cleanedSugarReadings[0]?.value,
              blood_sugar_context: cleanedSugarReadings[0]?.context,
              blood_sugar_readings:
                cleanedSugarReadings.length > 0 ? cleanedSugarReadings : undefined,
              oxygen_spo2: toOptionalNum(d.spo2),
              weight: toOptionalNum(d.weight),
              weight_unit: d.weightUnit,
            }
          : undefined;

      const parsedTags = d.tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      payloads.push({
        person_id: targetPersonId,
        condition_ids: selectedConditionIds,
        symptom_name: trimmedSymptom,
        symptoms_list: [trimmedSymptom],
        start_datetime: parsedStart.toISOString(),
        ongoing: d.ongoing,
        end_datetime: parsedEndIso,
        severity_0_to_10: d.severity,
        duration_text: d.durationText.trim() || undefined,
        body_location: d.bodyLocation.trim() || undefined,
        description: d.description.trim(),
        possible_triggers: d.possibleTriggers.trim() || undefined,
        better_or_worse_notes: d.betterOrWorseNotes.trim() || undefined,
        daily_impact: d.dailyImpact.trim() || undefined,
        tags: parsedTags,
        vitals: vitalsObj,
        attachments: d.attachments,
      });
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave(payloads);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save symptom log.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/40 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              {editingEntry ? 'Edit Symptom Entry' : 'Record Symptom'}
            </h2>
            <p className="text-xs text-zinc-500">
              Fill the full detailed profile for each symptom log (severity, timing, vitals, and documents).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-emerald-100/50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form wrapping scrollable body & sticky footer */}
        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="overflow-y-auto p-6 space-y-5 flex-1">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                {error}
              </div>
            )}

            {preselectedCondition && !editingEntry && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
                Disease saved. Add detailed symptom profile(s) below for{' '}
                <span className="font-bold">{preselectedCondition.name}</span>.
              </div>
            )}

            {isEmergencyInput && <EmergencyBanner urgentKeywordDetected={true} />}

            {/* Patient & Disease Selectors */}
            <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/70 space-y-3">
              {people.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Patient Profile
                  </label>
                  <select
                    value={selectedPersonId}
                    onChange={(e) => handlePersonSwitch(e.target.value)}
                    className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 font-medium text-zinc-900"
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.relationship})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Link to Tracked Disease / Condition
                </label>
                {personConditions.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No diseases recorded for {currentModalPerson?.name || 'this patient'} yet. You can add them from Diseases &amp; Symptoms.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {personConditions.map((c) => {
                      const selected = selectedConditionIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCondition(c.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-zinc-700 border-emerald-200 hover:bg-emerald-50'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Individual Detailed Symptom Profile Cards */}
            <div className="space-y-4">
              {drafts.map((draft, idx) => (
                <div
                  key={draft.id}
                  className="rounded-xl border border-emerald-200 bg-white shadow-2xs overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="px-4 py-2.5 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpandDraft(draft.id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="px-2 py-0.5 rounded bg-emerald-700 text-white text-2xs font-bold shrink-0">
                        Symptom {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-zinc-800 truncate">
                        {draft.symptomText.trim() || 'Enter symptom & full details'}
                      </span>
                      {!draft.isExpanded && (
                        <span className="text-2xs text-emerald-700 shrink-0">
                          · Severity {draft.severity}/10
                          {draft.attachments.length > 0
                            ? ` · ${draft.attachments.length} file${draft.attachments.length > 1 ? 's' : ''}`
                            : ''}
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!editingEntry && drafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDraft(draft.id)}
                          className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                          title={`Remove Symptom ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {drafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleExpandDraft(draft.id)}
                          className="p-1 text-zinc-500 hover:text-emerald-800 rounded cursor-pointer"
                          title={draft.isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {draft.isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Detailed Profile Body */}
                  {draft.isExpanded && (
                    <div className="p-4 space-y-4">
                      {/* Symptom 3-line space */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1">
                          Symptom / Health Concern *
                        </label>
                        <textarea
                          rows={3}
                          value={draft.symptomText}
                          onChange={(e) => updateDraft(draft.id, 'symptomText', e.target.value)}
                          placeholder={`Describe symptom ${idx + 1} clearly...`}
                          className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 resize-y"
                        />
                      </div>

                      {/* Severity Slider */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-zinc-700">
                            Self-Reported Severity ({draft.severity}/10)
                          </label>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              draft.severity >= 7
                                ? 'bg-rose-50 text-rose-700'
                                : draft.severity >= 4
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {getSeverityLabel(draft.severity)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={draft.severity}
                          onChange={(e) =>
                            updateDraft(draft.id, 'severity', Number(e.target.value))
                          }
                          className="w-full accent-emerald-700 cursor-pointer"
                        />
                        <div className="flex justify-between text-2xs text-zinc-400 mt-1">
                          <span>0 None</span>
                          <span>5 Moderate</span>
                          <span>10 Severe</span>
                        </div>
                      </div>

                      {/* Dates & Ongoing */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Started Date &amp; Time *
                          </label>
                          <input
                            type="datetime-local"
                            value={draft.startDatetime}
                            onChange={(e) =>
                              updateDraft(draft.id, 'startDatetime', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-zinc-700">Status</label>
                            <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draft.ongoing}
                                onChange={(e) =>
                                  updateDraft(draft.id, 'ongoing', e.target.checked)
                                }
                                className="rounded accent-emerald-700"
                              />
                              Currently ongoing
                            </label>
                          </div>
                          {!draft.ongoing ? (
                            <input
                              type="datetime-local"
                              value={draft.endDatetime}
                              onChange={(e) =>
                                updateDraft(draft.id, 'endDatetime', e.target.value)
                              }
                              className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                            />
                          ) : (
                            <input
                              type="text"
                              value={draft.durationText}
                              onChange={(e) =>
                                updateDraft(draft.id, 'durationText', e.target.value)
                              }
                              placeholder="Approx duration (e.g., 2 hours, since yesterday)"
                              className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                            />
                          )}
                        </div>
                      </div>

                      {/* Body Location & Impact */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Body Location
                          </label>
                          <input
                            type="text"
                            value={draft.bodyLocation}
                            onChange={(e) =>
                              updateDraft(draft.id, 'bodyLocation', e.target.value)
                            }
                            placeholder="e.g. Forehead, Upper abdomen, Lower back"
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Daily Activity Impact
                          </label>
                          <input
                            type="text"
                            value={draft.dailyImpact}
                            onChange={(e) =>
                              updateDraft(draft.id, 'dailyImpact', e.target.value)
                            }
                            placeholder="e.g. Disturbed sleep, couldn't walk upstairs"
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                          />
                        </div>
                      </div>

                      {/* Detailed Notes */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1">
                          Detailed Notes &amp; Observations
                        </label>
                        <textarea
                          rows={2}
                          value={draft.description}
                          onChange={(e) => updateDraft(draft.id, 'description', e.target.value)}
                          placeholder="What happened before it started, what makes it better or worse, medicines taken at home..."
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 resize-y"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Possible Triggers / Meals / Weather
                          </label>
                          <input
                            type="text"
                            value={draft.possibleTriggers}
                            onChange={(e) =>
                              updateDraft(draft.id, 'possibleTriggers', e.target.value)
                            }
                            placeholder="e.g. Skipped lunch, spicy meal, heat/humidity"
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            What Helped or Worsened It
                          </label>
                          <input
                            type="text"
                            value={draft.betterOrWorseNotes}
                            onChange={(e) =>
                              updateDraft(draft.id, 'betterOrWorseNotes', e.target.value)
                            }
                            placeholder="e.g. Resting helped, bright light worsened"
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                          />
                        </div>
                      </div>

                      {/* Home Vitals Toggle & Panel */}
                      <div className="border border-emerald-200/80 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateDraft(draft.id, 'showVitals', !draft.showVitals)}
                          className="w-full px-4 py-2.5 bg-emerald-50/50 hover:bg-emerald-50 flex items-center justify-between text-xs font-semibold text-emerald-900 cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <HeartPulse className="w-4 h-4 text-emerald-700" />
                            Record Home Vitals (BP, Sugar, Temp, SpO2, Weight)
                          </span>
                          <span className="text-emerald-700">
                            {draft.showVitals ? 'Hide' : '+ Add Readings'}
                          </span>
                        </button>

                        {draft.showVitals && (
                          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white border-t border-emerald-100">
                            <div>
                              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                                BP Systolic (mmHg)
                              </label>
                              <input
                                type="number"
                                value={draft.bpSystolic}
                                onChange={(e) =>
                                  updateDraft(draft.id, 'bpSystolic', e.target.value)
                                }
                                placeholder="e.g. 122"
                                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                              />
                            </div>
                            <div>
                              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                                BP Diastolic (mmHg)
                              </label>
                              <input
                                type="number"
                                value={draft.bpDiastolic}
                                onChange={(e) =>
                                  updateDraft(draft.id, 'bpDiastolic', e.target.value)
                                }
                                placeholder="e.g. 80"
                                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                              />
                            </div>
                            <div>
                              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                                Pulse (bpm)
                              </label>
                              <input
                                type="number"
                                value={draft.pulse}
                                onChange={(e) => updateDraft(draft.id, 'pulse', e.target.value)}
                                placeholder="e.g. 76"
                                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                              />
                            </div>
                            <div>
                              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                                Temperature (°{draft.tempUnit})
                              </label>
                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={draft.temp}
                                  onChange={(e) => updateDraft(draft.id, 'temp', e.target.value)}
                                  placeholder={draft.tempUnit === 'F' ? '98.6' : '37.0'}
                                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                                />
                                <select
                                  value={draft.tempUnit}
                                  onChange={(e) =>
                                    updateDraft(draft.id, 'tempUnit', e.target.value as 'F' | 'C')
                                  }
                                  className="px-2 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white"
                                >
                                  <option value="F">°F</option>
                                  <option value="C">°C</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                                SpO2 (%)
                              </label>
                              <input
                                type="number"
                                value={draft.spo2}
                                onChange={(e) => updateDraft(draft.id, 'spo2', e.target.value)}
                                placeholder="e.g. 98"
                                className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                              />
                            </div>
                            <div>
                              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                                Weight ({draft.weightUnit})
                              </label>
                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={draft.weight}
                                  onChange={(e) => updateDraft(draft.id, 'weight', e.target.value)}
                                  placeholder={draft.weightUnit === 'kg' ? 'e.g. 64' : 'e.g. 140'}
                                  className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                                />
                                <select
                                  value={draft.weightUnit}
                                  onChange={(e) =>
                                    updateDraft(
                                      draft.id,
                                      'weightUnit',
                                      e.target.value as 'kg' | 'lbs'
                                    )
                                  }
                                  className="px-2 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white"
                                >
                                  <option value="kg">kg</option>
                                  <option value="lbs">lbs</option>
                                </select>
                              </div>
                            </div>
                            <div className="col-span-2 sm:col-span-3 pt-2 border-t border-emerald-100 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="text-2xs font-semibold text-zinc-700">
                                  Blood Sugar Readings (mg/dL) — Add Fasting, Non-Fasting, Random, PP
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextContexts: BloodSugarContext[] = [
                                      'fasting',
                                      'non-fasting',
                                      'random',
                                      'post-meal',
                                      'bedtime',
                                    ];
                                    const used = new Set(draft.sugarReadings.map((r) => r.context));
                                    const nextCtx =
                                      nextContexts.find((c) => !used.has(c)) || 'random';
                                    updateDraft(draft.id, 'sugarReadings', [
                                      ...draft.sugarReadings,
                                      {
                                        id: generateDraftId(),
                                        value: '',
                                        context: nextCtx,
                                        timeNote: '',
                                      },
                                    ]);
                                  }}
                                  className="px-2 py-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-2xs font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  Add Sugar Reading
                                </button>
                              </div>

                              <div className="space-y-2">
                                {draft.sugarReadings.map((sr, srIdx) => (
                                  <div
                                    key={sr.id}
                                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-emerald-50/30 p-2 rounded-lg border border-emerald-100"
                                  >
                                    <div className="sm:col-span-4">
                                      <select
                                        aria-label={`Blood Sugar Reading ${srIdx + 1} Type`}
                                        value={sr.context}
                                        onChange={(e) => {
                                          const next = draft.sugarReadings.map((item) =>
                                            item.id === sr.id
                                              ? {
                                                  ...item,
                                                  context: e.target.value as BloodSugarContext,
                                                }
                                              : item
                                          );
                                          updateDraft(draft.id, 'sugarReadings', next);
                                        }}
                                        className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white font-medium text-zinc-800"
                                      >
                                        {BLOOD_SUGAR_CONTEXT_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="sm:col-span-3">
                                      <input
                                        type="number"
                                        aria-label={`Blood Sugar Reading ${srIdx + 1} Value`}
                                        value={sr.value}
                                        onChange={(e) => {
                                          const next = draft.sugarReadings.map((item) =>
                                            item.id === sr.id
                                              ? { ...item, value: e.target.value }
                                              : item
                                          );
                                          updateDraft(draft.id, 'sugarReadings', next);
                                        }}
                                        placeholder="mg/dL (e.g. 112)"
                                        className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                                      />
                                    </div>
                                    <div className="sm:col-span-4">
                                      <input
                                        type="text"
                                        aria-label={`Blood Sugar Reading ${srIdx + 1} Note`}
                                        value={sr.timeNote}
                                        onChange={(e) => {
                                          const next = draft.sugarReadings.map((item) =>
                                            item.id === sr.id
                                              ? { ...item, timeNote: e.target.value }
                                              : item
                                          );
                                          updateDraft(draft.id, 'sugarReadings', next);
                                        }}
                                        placeholder="Time / note (e.g. 7:30 AM)"
                                        className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-700"
                                      />
                                    </div>
                                    <div className="sm:col-span-1 flex justify-end">
                                      {draft.sugarReadings.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = draft.sugarReadings.filter(
                                              (item) => item.id !== sr.id
                                            );
                                            updateDraft(draft.id, 'sugarReadings', next);
                                          }}
                                          className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                                          title="Remove sugar reading"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Reports, Prescriptions & Photos Upload */}
                      <AttachmentSection
                        attachments={draft.attachments}
                        onChange={(next) => updateDraft(draft.id, 'attachments', next)}
                        title="Attach Lab Reports, Prescriptions or Photos (Optional)"
                        onError={setError}
                        onLoadingChange={(reading) =>
                          setReadingFilesCount((c) => Math.max(0, c + (reading ? 1 : -1)))
                        }
                        onPreview={setViewingAttachment}
                      />

                      {/* Tags */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1">
                          Tags (Comma separated)
                        </label>
                        <input
                          type="text"
                          value={draft.tagsInput}
                          onChange={(e) => updateDraft(draft.id, 'tagsInput', e.target.value)}
                          placeholder="e.g. morning, fasting, work-stress"
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add Another Symptom with Full Details Button */}
              {!editingEntry && (
                <button
                  type="button"
                  onClick={addAnotherSymptomProfile}
                  className="w-full py-3 border-2 border-dashed border-emerald-300 rounded-xl text-xs font-semibold text-emerald-800 hover:border-emerald-600 hover:bg-emerald-50/60 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Symptom {drafts.length + 1} (with full details, severity &amp; vitals)
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-zinc-50 border-t border-emerald-100 space-y-2 shrink-0">
            {error && (
              <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || readingFilesCount > 0}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {readingFilesCount > 0
                  ? 'Reading files...'
                  : isSaving
                  ? 'Saving...'
                  : editingEntry
                  ? 'Save Changes'
                  : drafts.length > 1
                  ? `Save ${drafts.length} Symptom Logs`
                  : 'Save Symptom Entry'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <AttachmentViewerModal
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
};
