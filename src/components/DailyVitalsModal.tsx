/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Person,
  DailyVitalLog,
  BloodSugarContext,
  BloodSugarReading,
} from '../types/index.ts';
import { X, Plus, Trash2, HeartPulse } from 'lucide-react';

interface DailyVitalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: Partial<DailyVitalLog>, editingId?: string) => Promise<void>;
  editingEntry?: DailyVitalLog | null;
  personId: string;
  people: Person[];
}

const BLOOD_SUGAR_CONTEXT_OPTIONS: { value: BloodSugarContext; label: string }[] = [
  { value: 'fasting', label: 'Fasting (Before Meals)' },
  { value: 'non-fasting', label: 'Non-Fasting' },
  { value: 'random', label: 'Random' },
  { value: 'post-meal', label: 'Post-Meal (PP)' },
  { value: 'bedtime', label: 'Bedtime' },
];

function createEmptySugarRow(context: BloodSugarContext = 'fasting'): {
  id: string;
  value: string;
  context: BloodSugarContext;
  time_note: string;
} {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `bs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    value: '',
    context,
    time_note: '',
  };
}

function toLocalDateInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTimeInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '08:00';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const DailyVitalsModal: React.FC<DailyVitalsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEntry,
  personId,
  people,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState(personId);
  const [dateStr, setDateStr] = useState(toLocalDateInput());
  const [timeStr, setTimeStr] = useState(toLocalTimeInput());

  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [spo2, setSpo2] = useState('');
  const [pulse, setPulse] = useState('');
  const [temperature, setTemperature] = useState('');
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [respRate, setRespRate] = useState('');
  const [sugarRows, setSugarRows] = useState<
    { id: string; value: string; context: BloodSugarContext; time_note: string }[]
  >([createEmptySugarRow('fasting')]);
  const [remark, setRemark] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingEntry) {
      setSelectedPersonId(editingEntry.person_id || personId);
      setDateStr(toLocalDateInput(editingEntry.recorded_at));
      setTimeStr(toLocalTimeInput(editingEntry.recorded_at));
      setBpSystolic(
        editingEntry.blood_pressure_systolic !== undefined
          ? String(editingEntry.blood_pressure_systolic)
          : ''
      );
      setBpDiastolic(
        editingEntry.blood_pressure_diastolic !== undefined
          ? String(editingEntry.blood_pressure_diastolic)
          : ''
      );
      setSpo2(editingEntry.oxygen_spo2 !== undefined ? String(editingEntry.oxygen_spo2) : '');
      setPulse(editingEntry.pulse !== undefined ? String(editingEntry.pulse) : '');
      setTemperature(
        editingEntry.temperature !== undefined ? String(editingEntry.temperature) : ''
      );
      setTempUnit(editingEntry.temperature_unit || 'F');
      setWeight(editingEntry.weight !== undefined ? String(editingEntry.weight) : '');
      setWeightUnit(editingEntry.weight_unit || 'kg');
      setRespRate(
        editingEntry.respiratory_rate !== undefined ? String(editingEntry.respiratory_rate) : ''
      );
      if (editingEntry.blood_sugar_readings && editingEntry.blood_sugar_readings.length > 0) {
        setSugarRows(
          editingEntry.blood_sugar_readings.map((r) => ({
            id: r.id || createEmptySugarRow().id,
            value: String(r.value),
            context: r.context || 'fasting',
            time_note: r.time_note || '',
          }))
        );
      } else if (editingEntry.blood_sugar !== undefined) {
        setSugarRows([
          {
            id: createEmptySugarRow().id,
            value: String(editingEntry.blood_sugar),
            context: editingEntry.blood_sugar_context || 'fasting',
            time_note: '',
          },
        ]);
      } else {
        setSugarRows([createEmptySugarRow('fasting')]);
      }
      setRemark(editingEntry.remark || '');
    } else {
      const nowIso = new Date().toISOString();
      setSelectedPersonId(personId);
      setDateStr(toLocalDateInput(nowIso));
      setTimeStr(toLocalTimeInput(nowIso));
      setBpSystolic('');
      setBpDiastolic('');
      setSpo2('');
      setPulse('');
      setTemperature('');
      setTempUnit('F');
      setWeight('');
      setWeightUnit('kg');
      setRespRate('');
      setSugarRows([createEmptySugarRow('fasting')]);
      setRemark('');
    }
  }, [isOpen, editingEntry, personId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedSugarReadings: BloodSugarReading[] = sugarRows
      .filter((r) => r.value.trim() !== '' && !Number.isNaN(Number(r.value)))
      .map((r) => ({
        id: r.id,
        value: Number(r.value),
        context: r.context,
        time_note: r.time_note.trim() || undefined,
      }));

    const localDt = dateStr
      ? new Date(`${dateStr}T${timeStr || '08:00'}:00`)
      : new Date();
    const recordedAt = Number.isNaN(localDt.getTime())
      ? new Date().toISOString()
      : localDt.toISOString();

    const payload: Partial<DailyVitalLog> = {
      person_id: selectedPersonId || personId,
      recorded_at: recordedAt,
      blood_pressure_systolic: bpSystolic.trim() ? Number(bpSystolic) : undefined,
      blood_pressure_diastolic: bpDiastolic.trim() ? Number(bpDiastolic) : undefined,
      oxygen_spo2: spo2.trim() ? Number(spo2) : undefined,
      pulse: pulse.trim() ? Number(pulse) : undefined,
      temperature: temperature.trim() ? Number(temperature) : undefined,
      temperature_unit: temperature.trim() ? tempUnit : undefined,
      weight: weight.trim() ? Number(weight) : undefined,
      weight_unit: weight.trim() ? weightUnit : undefined,
      respiratory_rate: respRate.trim() ? Number(respRate) : undefined,
      blood_sugar_readings: parsedSugarReadings.length > 0 ? parsedSugarReadings : undefined,
      blood_sugar: parsedSugarReadings[0]?.value,
      blood_sugar_context: parsedSugarReadings[0]?.context,
      remark: remark.trim() || undefined,
    };

    setIsSaving(true);
    try {
      await onSave(payload, editingEntry?.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save daily vital reading.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-emerald-100 bg-emerald-50/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <HeartPulse className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                {editingEntry ? 'Edit Daily Vitals Entry' : 'Log Daily Vitals Reading'}
              </h2>
              <p className="text-3xs text-zinc-500">
                Record BP, blood sugar, SpO2, pulse, temp, or weight anytime — all fields optional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Patient & Date/Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                Patient Profile
              </label>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white focus:outline-hidden focus:border-emerald-600"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.relationship})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">Date</label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">Time</label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          {/* BP & SpO2 & Pulse */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                BP Systolic (Upper)
              </label>
              <input
                type="number"
                min={30}
                max={350}
                placeholder="e.g. 120"
                value={bpSystolic}
                onChange={(e) => setBpSystolic(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                BP Diastolic (Lower)
              </label>
              <input
                type="number"
                min={20}
                max={250}
                placeholder="e.g. 80"
                value={bpDiastolic}
                onChange={(e) => setBpDiastolic(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                SpO2 Oxygen (%)
              </label>
              <input
                type="number"
                min={40}
                max={100}
                placeholder="e.g. 98"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                Pulse Rate (bpm)
              </label>
              <input
                type="number"
                min={20}
                max={260}
                placeholder="e.g. 74"
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Temp, Weight, Resp Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                Body Temperature
              </label>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.1"
                  min={25}
                  max={115}
                  placeholder={tempUnit === 'F' ? '98.6' : '37.0'}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
                />
                <select
                  value={tempUnit}
                  onChange={(e) => setTempUnit(e.target.value as 'F' | 'C')}
                  className="px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white"
                >
                  <option value="F">°F</option>
                  <option value="C">°C</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">Weight</label>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={500}
                  placeholder="e.g. 64"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
                />
                <select
                  value={weightUnit}
                  onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lbs')}
                  className="px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white"
                >
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-2xs font-medium text-zinc-600 mb-1">
                Respiratory Rate (/min)
              </label>
              <input
                type="number"
                min={4}
                max={80}
                placeholder="e.g. 16"
                value={respRate}
                onChange={(e) => setRespRate(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Blood Sugar Multi-Entry Readings */}
          <div className="p-3 rounded-lg bg-emerald-50/40 border border-emerald-200/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-emerald-900">
                Blood Sugar Readings (mg/dL)
              </span>
              <button
                type="button"
                onClick={() =>
                  setSugarRows((prev) => [
                    ...prev,
                    createEmptySugarRow(
                      prev.length === 1 ? 'non-fasting' : prev.length >= 2 ? 'random' : 'fasting'
                    ),
                  ])
                }
                className="text-3xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Sugar Reading</span>
              </button>
            </div>

            <div className="space-y-2">
              {sugarRows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-12 gap-1.5 items-center">
                  <div className="col-span-4">
                    <select
                      aria-label={`Blood Sugar Type ${idx + 1}`}
                      value={row.context}
                      onChange={(e) =>
                        setSugarRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? { ...r, context: e.target.value as BloodSugarContext }
                              : r
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white"
                    >
                      {BLOOD_SUGAR_CONTEXT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      min={10}
                      max={1500}
                      placeholder="mg/dL"
                      value={row.value}
                      onChange={(e) =>
                        setSugarRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r))
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Time / note (e.g. 7:30 AM)"
                      value={row.time_note}
                      onChange={(e) =>
                        setSugarRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, time_note: e.target.value } : r
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {sugarRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSugarRows((prev) => prev.filter((r) => r.id !== row.id))
                        }
                        className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer"
                        title="Remove reading"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remark */}
          <div>
            <label className="block text-2xs font-medium text-zinc-600 mb-1">
              Remark / Daily Note
            </label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="e.g. Checked before morning walk, right arm resting BP, after dinner reading..."
              className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-hidden focus:border-emerald-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : editingEntry ? 'Update Daily Vitals' : 'Save Daily Vitals'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
