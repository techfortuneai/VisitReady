/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Attachment, Condition, DoctorTreatmentPlan, Person } from '../types/index.ts';
import { X, Plus, Trash2, Check, Edit2, Stethoscope } from 'lucide-react';
import { AttachmentSection, AttachmentBadgeStrip } from './AttachmentSection.tsx';
import { AttachmentViewerModal } from './AttachmentViewerModal.tsx';

interface ConditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePerson: Person;
  people?: Person[];
  conditions: Condition[];
  initialAdding?: boolean;
  initialEditingCondition?: Condition | null;
  onAddCondition: (cond: Partial<Condition>) => Promise<Condition | void>;
  onUpdateCondition: (id: string, cond: Partial<Condition>) => Promise<void>;
  onDeleteCondition: (id: string) => Promise<void>;
  onConditionCreated?: (created: Condition) => void;
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDoctorPlan(): DoctorTreatmentPlan {
  return {
    id: generateClientId(),
    doctor_name: '',
    specialty_or_clinic: '',
    treatments: [
      {
        id: generateClientId(),
        name: '',
        notes: '',
      },
    ],
  };
}

export const ConditionModal: React.FC<ConditionModalProps> = ({
  isOpen,
  onClose,
  activePerson,
  people = [],
  conditions,
  initialAdding = false,
  initialEditingCondition = null,
  onAddCondition,
  onUpdateCondition,
  onDeleteCondition,
  onConditionCreated,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState(activePerson.id);
  const [isAdding, setIsAdding] = useState(initialAdding);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Condition['status']>('active');
  const [diagnosedDate, setDiagnosedDate] = useState('');
  const [doctorPlans, setDoctorPlans] = useState<DoctorTreatmentPlan[]>(() => [
    createEmptyDoctorPlan(),
  ]);
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSavedNotice('');
    if (initialEditingCondition) {
      setSelectedPersonId(initialEditingCondition.person_id || activePerson.id);
      loadConditionForEdit(initialEditingCondition);
    } else {
      setSelectedPersonId(activePerson.id);
      setIsAdding(initialAdding);
      setEditingId(null);
      setName('');
      setStatus('active');
      setDiagnosedDate('');
      setDoctorPlans([createEmptyDoctorPlan()]);
      setNotes('');
      setAttachments([]);
    }
  }, [isOpen, initialAdding, initialEditingCondition, activePerson.id]);

  if (!isOpen) return null;

  const currentModalPerson =
    people.find((p) => p.id === selectedPersonId) || activePerson;
  const personConditions = conditions.filter(
    (c) => c.person_id === currentModalPerson.id
  );

  function loadConditionForEdit(c: Condition) {
    setError('');
    setSavedNotice('');
    setSelectedPersonId(c.person_id || activePerson.id);
    setEditingId(c.id);
    setName(c.name);
    setStatus(c.status);
    setDiagnosedDate(c.diagnosed_date || '');
    if (c.doctor_treatments && c.doctor_treatments.length > 0) {
      setDoctorPlans(
        c.doctor_treatments.map((plan) => ({
          id: plan.id || generateClientId(),
          doctor_name: plan.doctor_name,
          specialty_or_clinic: plan.specialty_or_clinic || '',
          treatments:
            plan.treatments && plan.treatments.length > 0
              ? plan.treatments.map((t) => ({
                  id: t.id || generateClientId(),
                  name: t.name,
                  notes: t.notes || '',
                }))
              : [{ id: generateClientId(), name: '', notes: '' }],
        }))
      );
    } else if (c.treating_clinician) {
      setDoctorPlans([
        {
          id: generateClientId(),
          doctor_name: c.treating_clinician,
          specialty_or_clinic: '',
          treatments: [{ id: generateClientId(), name: '', notes: '' }],
        },
      ]);
    } else {
      setDoctorPlans([createEmptyDoctorPlan()]);
    }
    setNotes(c.notes || '');
    setAttachments(c.attachments || []);
    setIsAdding(true);
  }

  const resetForm = () => {
    setName('');
    setStatus('active');
    setDiagnosedDate('');
    setDoctorPlans([createEmptyDoctorPlan()]);
    setNotes('');
    setAttachments([]);
    setEditingId(null);
    setIsAdding(false);
    setError('');
  };

  // Doctor & Treatment Plan Handlers
  const addDoctorPlan = () => {
    setDoctorPlans((prev) => [...prev, createEmptyDoctorPlan()]);
  };

  const removeDoctorPlan = (planId: string) => {
    setDoctorPlans((prev) => {
      const filtered = prev.filter((p) => p.id !== planId);
      return filtered.length > 0 ? filtered : [createEmptyDoctorPlan()];
    });
  };

  const updateDoctorField = (
    planId: string,
    field: 'doctor_name' | 'specialty_or_clinic',
    value: string
  ) => {
    setDoctorPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, [field]: value } : p))
    );
  };

  const addTreatmentToDoctor = (planId: string) => {
    setDoctorPlans((prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
              ...p,
              treatments: [
                ...p.treatments,
                { id: generateClientId(), name: '', notes: '' },
              ],
            }
          : p
      )
    );
  };

  const updateTreatmentField = (
    planId: string,
    treatmentId: string,
    field: 'name' | 'notes',
    value: string
  ) => {
    setDoctorPlans((prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
              ...p,
              treatments: p.treatments.map((t) =>
                t.id === treatmentId ? { ...t, [field]: value } : t
              ),
            }
          : p
      )
    );
  };

  const removeTreatmentFromDoctor = (planId: string, treatmentId: string) => {
    setDoctorPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        const remaining = p.treatments.filter((t) => t.id !== treatmentId);
        return {
          ...p,
          treatments:
            remaining.length > 0
              ? remaining
              : [{ id: generateClientId(), name: '', notes: '' }],
        };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavedNotice('');

    if (!name.trim()) {
      setError('Please enter a disease or condition name.');
      return;
    }

    const targetPersonId = selectedPersonId || activePerson.id;
    if (!targetPersonId) {
      setError('Please select a patient profile first.');
      return;
    }

    setIsSaving(true);
    try {
      const cleanedPlans: DoctorTreatmentPlan[] = doctorPlans
        .map((p) => ({
          id: p.id,
          doctor_name: p.doctor_name.trim(),
          specialty_or_clinic: p.specialty_or_clinic?.trim() || undefined,
          treatments: p.treatments
            .map((t) => ({
              id: t.id,
              name: t.name.trim(),
              notes: t.notes?.trim() || undefined,
            }))
            .filter((t) => t.name.length > 0),
        }))
        .filter((p) => p.doctor_name.length > 0 || p.treatments.length > 0);

      const doctorSummary = cleanedPlans
        .map((p) => p.doctor_name)
        .filter(Boolean)
        .join(', ');

      const payload: Partial<Condition> = {
        name: name.trim(),
        status,
        diagnosed_date: diagnosedDate || undefined,
        treating_clinician: doctorSummary || undefined,
        doctor_treatments: cleanedPlans.length > 0 ? cleanedPlans : undefined,
        notes: notes.trim() || undefined,
        attachments,
      };

      let createdCondition: Condition | void;
      if (editingId) {
        await onUpdateCondition(editingId, payload);
      } else {
        createdCondition = await onAddCondition({
          person_id: targetPersonId,
          ...payload,
        });
      }

      const savedName = name.trim();
      const wasEditing = Boolean(editingId);
      resetForm();

      if (!wasEditing && createdCondition && onConditionCreated) {
        onClose();
        onConditionCreated(createdCondition);
      } else if (initialAdding || initialEditingCondition) {
        onClose();
      } else {
        setSavedNotice(`Saved "${savedName}" for ${currentModalPerson.name}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save disease. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (s: Condition['status']) => {
    switch (s) {
      case 'active':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'monitoring':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'managed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'resolved':
        return 'bg-zinc-100 text-zinc-600 border-zinc-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200/80 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/40 shrink-0">
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              {isAdding
                ? editingId
                  ? 'Edit Disease & Treatment Plans'
                  : 'Log New Disease'
                : 'Diseases & Tracked Conditions'}
            </h2>
            <p className="text-xs text-zinc-500">
              Patient profile:{' '}
              <span className="font-semibold text-zinc-800">
                {currentModalPerson.name}
              </span>
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

        {isAdding ? (
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                  {error}
                </div>
              )}

              <div className="p-4 bg-emerald-50/35 border border-emerald-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800">
                    {editingId ? 'Update Condition Details' : 'Disease & Simultaneous Treatments'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (initialAdding || initialEditingCondition) {
                        onClose();
                      } else {
                        resetForm();
                      }
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

              {people.length > 0 && !editingId && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Patient Profile
                  </label>
                  <select
                    value={selectedPersonId}
                    onChange={(e) => setSelectedPersonId(e.target.value)}
                    className="w-full px-3 py-2 border border-emerald-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700 font-medium text-zinc-900"
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
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Disease / Condition Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Enter disease or condition name"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Current Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Condition['status'])}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:border-emerald-700"
                  >
                    <option value="active">Active</option>
                    <option value="monitoring">Monitoring</option>
                    <option value="managed">Managed</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Diagnosed Date
                  </label>
                  <input
                    type="date"
                    value={diagnosedDate}
                    onChange={(e) => setDiagnosedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* Multiple Doctors & Respective Treatments Section */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-800">
                      Treating Doctors &amp; Simultaneous Treatments
                    </label>
                    <p className="text-2xs text-zinc-500">
                      Add multiple doctors if parallel treatments are going on together.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addDoctorPlan}
                    className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-2xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Doctor
                  </button>
                </div>

                <div className="space-y-3">
                  {doctorPlans.map((plan, dIdx) => (
                    <div
                      key={plan.id}
                      className="p-3.5 bg-white border border-emerald-200/80 rounded-xl space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-emerald-800">
                          <Stethoscope className="w-3.5 h-3.5" />
                          Doctor {dIdx + 1}
                        </span>
                        {doctorPlans.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDoctorPlan(plan.id)}
                            className="text-2xs text-zinc-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove Doctor
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-2xs font-medium text-zinc-600 mb-1">
                            Doctor Name
                          </label>
                          <input
                            type="text"
                            value={plan.doctor_name}
                            onChange={(e) =>
                              updateDoctorField(plan.id, 'doctor_name', e.target.value)
                            }
                            placeholder="e.g. Dr. Ananya Kulkarni"
                            className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
                          />
                        </div>
                        <div>
                          <label className="block text-2xs font-medium text-zinc-600 mb-1">
                            Specialty / Clinic (Optional)
                          </label>
                          <input
                            type="text"
                            value={plan.specialty_or_clinic || ''}
                            onChange={(e) =>
                              updateDoctorField(plan.id, 'specialty_or_clinic', e.target.value)
                            }
                            placeholder="e.g. Neurology · Apollo Clinic"
                            className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
                          />
                        </div>
                      </div>

                      {/* Treatments under this respective doctor */}
                      <div className="space-y-2 pt-1 border-t border-zinc-100">
                        <div className="flex items-center justify-between">
                          <span className="text-2xs font-semibold text-zinc-700">
                            Treatments under {plan.doctor_name.trim() || `Doctor ${dIdx + 1}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => addTreatmentToDoctor(plan.id)}
                            className="text-2xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Add Treatment
                          </button>
                        </div>

                        <div className="space-y-2">
                          {plan.treatments.map((tr) => (
                            <div
                              key={tr.id}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                            >
                              <input
                                type="text"
                                value={tr.name}
                                onChange={(e) =>
                                  updateTreatmentField(plan.id, tr.id, 'name', e.target.value)
                                }
                                placeholder="Medicine / Therapy (e.g. Telma 40mg)"
                                className="sm:col-span-6 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
                              />
                              <input
                                type="text"
                                value={tr.notes || ''}
                                onChange={(e) =>
                                  updateTreatmentField(plan.id, tr.id, 'notes', e.target.value)
                                }
                                placeholder="Schedule / Dosage notes"
                                className="sm:col-span-5 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
                              />
                              <div className="sm:col-span-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeTreatmentFromDoctor(plan.id, tr.id)}
                                  className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                                  title="Remove treatment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Clinical Notes &amp; Overall Plan
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="OPD checkup intervals, test targets, precautions..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>

              <AttachmentSection
                attachments={attachments}
                onChange={setAttachments}
                title="Reports, Prescriptions & Disease Documents (Images / PDF)"
                onError={setError}
                onLoadingChange={setIsReadingFiles}
                onPreview={setViewingAttachment}
              />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-zinc-50 border-t border-emerald-100 space-y-2 shrink-0">
              {error && (
                <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                  {error}
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (initialAdding || initialEditingCondition) {
                      onClose();
                    } else {
                      resetForm();
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isReadingFiles}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {isReadingFiles
                    ? 'Reading files...'
                    : isSaving
                    ? 'Saving...'
                    : editingId
                    ? 'Save Changes'
                    : 'Save Disease & Add Symptoms'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                {error}
              </div>
            )}

            {savedNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
                {savedNotice}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="w-full py-3 border-2 border-dashed border-emerald-300 rounded-xl text-xs font-semibold text-emerald-800 hover:border-emerald-600 hover:bg-emerald-50/60 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Log New Disease / Condition
            </button>

            {/* Recorded Diseases List */}
            {!initialEditingCondition && (
              <div className="space-y-2.5 pt-2">
                <h3 className="text-2xs font-bold uppercase tracking-wider text-zinc-400">
                  Recorded Diseases ({personConditions.length})
                </h3>
                {personConditions.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-6 bg-zinc-50 rounded-xl border border-zinc-100">
                    No diseases or chronic conditions added for {currentModalPerson.name}.
                  </p>
                ) : (
                  personConditions.map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 bg-white border border-zinc-200/90 rounded-xl flex items-start justify-between gap-3 hover:border-emerald-200 transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-zinc-900">{c.name}</span>
                          <span
                            className={`text-2xs font-semibold px-2 py-0.5 rounded border capitalize ${getStatusBadge(
                              c.status
                            )}`}
                          >
                            {c.status}
                          </span>
                        </div>

                        {c.doctor_treatments && c.doctor_treatments.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {c.doctor_treatments.map((plan) => (
                              <div
                                key={plan.id}
                                className="p-2 rounded-lg bg-emerald-50/40 border border-emerald-100 text-2xs"
                              >
                                <div className="font-semibold text-emerald-900">
                                  {plan.doctor_name}
                                  {plan.specialty_or_clinic && (
                                    <span className="font-normal text-zinc-500">
                                      {' '}
                                      · {plan.specialty_or_clinic}
                                    </span>
                                  )}
                                </div>
                                {plan.treatments.length > 0 && (
                                  <ul className="mt-1 space-y-0.5 text-zinc-700">
                                    {plan.treatments.map((t) => (
                                      <li key={t.id}>
                                        · {t.name}
                                        {t.notes ? (
                                          <span className="text-zinc-500"> ({t.notes})</span>
                                        ) : (
                                          ''
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          c.treating_clinician && (
                            <p className="text-xs text-emerald-800 font-medium">
                              Doctor: {c.treating_clinician}
                            </p>
                          )
                        )}

                        {c.notes && <p className="text-xs text-zinc-600">{c.notes}</p>}
                        {c.diagnosed_date && (
                          <p className="text-2xs text-zinc-400">
                            Diagnosed: {new Date(c.diagnosed_date).toLocaleDateString('en-IN')}
                          </p>
                        )}
                        <AttachmentBadgeStrip
                          attachments={c.attachments}
                          onOpenAttachment={setViewingAttachment}
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadConditionForEdit(c)}
                          className="p-1.5 text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              setError('');
                              await onDeleteCondition(c.id);
                            } catch (err: any) {
                              setError(err?.message || 'Failed to delete disease.');
                            }
                          }}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <AttachmentViewerModal
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
};
