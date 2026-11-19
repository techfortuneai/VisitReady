/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Person, RelationshipType } from '../types/index.ts';
import { X, Check, UserPlus, Trash2, Edit2 } from 'lucide-react';

interface PersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  activePersonId: string;
  initialMode?: 'list' | 'create' | 'edit';
  editingTarget?: Person | null;
  onSelectPerson: (id: string) => void;
  onCreatePerson: (p: Partial<Person>) => Promise<void>;
  onUpdatePerson: (id: string, p: Partial<Person>) => Promise<void>;
  onDeletePerson: (id: string) => Promise<void>;
}

const RELATIONSHIPS: RelationshipType[] = [
  'Self',
  'Parent',
  'Spouse',
  'Child',
  'Partner',
  'Relative',
  'Friend',
  'Other',
];

const BLOOD_TYPES = ['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'];

export const PersonModal: React.FC<PersonModalProps> = ({
  isOpen,
  onClose,
  people,
  activePersonId,
  initialMode = 'list',
  editingTarget = null,
  onSelectPerson,
  onCreatePerson,
  onUpdatePerson,
  onDeletePerson,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipType>('Parent');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>('cm');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [bloodType, setBloodType] = useState('');
  const [baselineBp, setBaselineBp] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [currentMedications, setCurrentMedications] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialMode === 'create') {
      startCreate();
    } else if (initialMode === 'edit' && editingTarget) {
      startEdit(editingTarget);
    } else {
      resetForm();
    }
  }, [isOpen, initialMode, editingTarget]);

  if (!isOpen) return null;

  const resetForm = () => {
    setShowForm(false);
    setEditingPerson(null);
    setName('');
    setRelationship('Parent');
    setBirthDate('');
    setHeight('');
    setHeightUnit('cm');
    setWeight('');
    setWeightUnit('kg');
    setBloodType('');
    setBaselineBp('');
    setAllergies('');
    setMedicalHistory('');
    setCurrentMedications('');
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setNotes('');
    setError('');
  };

  const startCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (p: Person) => {
    setEditingPerson(p);
    setName(p.name);
    setRelationship(p.relationship);
    setBirthDate(p.birth_date || '');
    setHeight(p.height || '');
    setHeightUnit(p.height_unit || 'cm');
    setWeight(p.weight !== undefined ? String(p.weight) : '');
    setWeightUnit(p.weight_unit || 'kg');
    setBloodType(p.blood_type || '');
    setBaselineBp(p.baseline_bp || '');
    setAllergies(p.allergies || '');
    setMedicalHistory(p.medical_history || '');
    setCurrentMedications(p.current_medications || '');
    setEmergencyContactName(p.emergency_contact_name || '');
    setEmergencyContactPhone(p.emergency_contact_phone || '');
    setNotes(p.notes || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a full name for the patient profile.');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      const payload: Partial<Person> = {
        name: name.trim(),
        relationship,
        birth_date: birthDate || undefined,
        height: height.trim() || undefined,
        height_unit: heightUnit,
        weight: weight.trim() ? Number(weight) : undefined,
        weight_unit: weightUnit,
        blood_type: bloodType || undefined,
        baseline_bp: baselineBp.trim() || undefined,
        allergies: allergies.trim() || undefined,
        medical_history: medicalHistory.trim() || undefined,
        current_medications: currentMedications.trim() || undefined,
        emergency_contact_name: emergencyContactName.trim() || undefined,
        emergency_contact_phone: emergencyContactPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (editingPerson) {
        await onUpdatePerson(editingPerson.id, payload);
      } else {
        await onCreatePerson(payload);
      }
      resetForm();
      if (initialMode === 'create' || initialMode === 'edit') {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save patient profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200/80 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/40">
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              {showForm
                ? editingPerson
                  ? `Edit Profile — ${editingPerson.name}`
                  : 'Create Patient Profile'
                : 'Patient Profiles'}
            </h2>
            <p className="text-xs text-zinc-500">
              Keep records for yourself and family members separately.
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

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                  {error}
                </div>
              )}
              {/* Basic Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Relationship
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value as RelationshipType)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Blood Group
                  </label>
                  <select
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  >
                    {BLOOD_TYPES.map((bt) => (
                      <option key={bt || 'none'} value={bt}>
                        {bt || 'Select blood group'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Baseline Measurements */}
              <div className="p-3.5 bg-emerald-50/40 rounded-xl border border-emerald-200/70 space-y-3">
                <span className="block text-xs font-semibold text-emerald-900">
                  Baseline Readings
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-2xs font-medium text-zinc-600 mb-1">
                      Height
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        placeholder="e.g. 164 cm or 5 ft 5 in"
                        className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-2xs font-medium text-zinc-600 mb-1">
                      Weight
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder={weightUnit === 'kg' ? '62' : '136'}
                        className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                      />
                      <select
                        value={weightUnit}
                        onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lbs')}
                        className="px-2 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white"
                      >
                        <option value="kg">kg</option>
                        <option value="lbs">lbs</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-2xs font-medium text-zinc-600 mb-1">
                      Usual BP (mmHg)
                    </label>
                    <input
                      type="text"
                      value={baselineBp}
                      onChange={(e) => setBaselineBp(e.target.value)}
                      placeholder="e.g. 120/80"
                      className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                    />
                  </div>
                </div>
              </div>

              {/* Clinical History */}
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Known Allergies
                </label>
                <input
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. Sulfa drugs, Penicillin, Peanuts, or None known"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Current Medications & Supplements
                </label>
                <textarea
                  rows={2}
                  value={currentMedications}
                  onChange={(e) => setCurrentMedications(e.target.value)}
                  placeholder="e.g. Thyronorm 50mcg morning, Vitamin D3 weekly"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Past Medical History / Surgeries / Family History
                </label>
                <textarea
                  rows={2}
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  placeholder="e.g. Appendectomy 2016, family history of diabetes"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder="e.g. Aarav Sharma (Spouse)"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="text"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    placeholder="e.g. +91 98450 12345"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Care & OPD Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Prefers morning OPD appointments"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-100">
                <button
                  type="button"
                  onClick={() => {
                    if (initialMode === 'create' || initialMode === 'edit') {
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
                  disabled={isSaving}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving...' : editingPerson ? 'Save Profile' : 'Create Profile'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="space-y-2">
                {people.map((p) => {
                  const isActive = p.id === activePersonId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        onSelectPerson(p.id);
                        onClose();
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-emerald-50/70 border-emerald-400'
                          : 'bg-white border-zinc-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-900">{p.name}</span>
                          <span className="text-2xs px-2 py-0.5 bg-white border border-emerald-200 rounded text-emerald-800 font-medium">
                            {p.relationship}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                          {[
                            p.blood_type ? `Blood ${p.blood_type}` : '',
                            p.height || '',
                            p.weight ? `${p.weight} ${p.weight_unit || 'kg'}` : '',
                            p.allergies ? `Allergies: ${p.allergies}` : '',
                          ]
                            .filter(Boolean)
                            .join(' • ') || 'Tap to view health record'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="p-1.5 text-zinc-400 hover:text-emerald-700 hover:bg-emerald-100/50 rounded-lg cursor-pointer"
                          title="Edit Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {people.length > 1 && (
                          confirmDeleteId === p.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await onDeletePerson(p.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 text-2xs font-medium bg-rose-600 text-white rounded cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-2xs font-medium text-zinc-600 hover:bg-zinc-100 rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Delete Profile"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={startCreate}
                className="w-full py-2.5 border border-dashed border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Add Family Member / Patient
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
