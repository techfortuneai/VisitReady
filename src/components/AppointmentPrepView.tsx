/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  AppointmentSummary,
  DailyVitalLog,
} from '../types/index.ts';
import {
  generateAppointmentSummaryPdf,
  PrintContentOptions,
  DEFAULT_PRINT_OPTIONS,
} from '../utils/pdfExport.ts';
import {
  Calendar,
  FileDown,
  Plus,
  Trash2,
  Printer,
  Check,
  Clock,
  MapPin,
  FileText,
  X,
} from 'lucide-react';
import { ClinicalDocumentModal } from './ClinicalDocumentModal.tsx';

interface AppointmentPrepViewProps {
  activePerson: Person;
  conditions: Condition[];
  symptoms: SymptomEntry[];
  vitalLogs?: DailyVitalLog[];
  appointments: Appointment[];
  summaries: AppointmentSummary[];
  onCreateAppointment: (appt: Partial<Appointment>) => Promise<void>;
  onDeleteAppointment: (id: string) => Promise<void>;
  onCreateSummary: (summary: Partial<AppointmentSummary>) => Promise<void>;
  onDeleteSummary: (id: string) => Promise<void>;
}

const DOCTOR_QUESTION_PROMPT_CATEGORIES = [
  {
    category: 'Symptoms & Causes',
    prompts: [
      'Could these symptoms be related to my existing condition or medicines?',
      'What could be causing these symptom flare-ups recently?',
      'Which red-flag symptoms mean I should visit hospital casualty immediately?',
    ],
  },
  {
    category: 'Tests & Diagnosis',
    prompts: [
      'Do I need any blood tests, thyroid panel, or scans before my next follow-up?',
      'Should I repeat HbA1c, lipid profile, or fasting sugar tests?',
      'Are my recent home BP / sugar readings within my target range?',
    ],
  },
  {
    category: 'Medicines & Dosage',
    prompts: [
      'Should any medicine dosage or timing be changed right now?',
      'Are there side effects from my current tablets I should watch out for?',
      'Should my tablets be taken before or after meals?',
    ],
  },
  {
    category: 'Diet & Follow-Up',
    prompts: [
      'What Indian home-diet, hydration, or sleep changes would help most?',
      'What physical exercises or stretches are safe for me right now?',
      'When should I book my next OPD follow-up visit?',
    ],
  },
];

export const AppointmentPrepView: React.FC<AppointmentPrepViewProps> = ({
  activePerson,
  conditions,
  symptoms,
  vitalLogs = [],
  appointments,
  summaries,
  onCreateAppointment,
  onDeleteAppointment,
  onCreateSummary,
  onDeleteSummary,
}) => {
  const [selectedApptId, setSelectedApptId] = useState<string>('');
  const [selectedDiseaseId, setSelectedDiseaseId] = useState<string>(
    conditions[0]?.id || 'general'
  );
  const [printOptions, setPrintOptions] = useState<PrintContentOptions>(DEFAULT_PRINT_OPTIONS);
  const [dateRangeDays, setDateRangeDays] = useState<number>(30);
  const [selectedSymptomIds, setSelectedSymptomIds] = useState<string[]>([]);
  const [customQuestions, setCustomQuestions] = useState<string[]>([
    'What could be contributing to the frequency or pattern of these symptoms?',
    'Are there any lab tests or blood panels recommended at this visit?',
  ]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [summaryTitle, setSummaryTitle] = useState(`OPD Visit Summary - ${activePerson.name}`);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  // Appointment Form Modal State
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptClinic, setApptClinic] = useState('');
  const [apptDatetime, setApptDatetime] = useState('');
  const [apptType, setApptType] = useState<Appointment['appointment_type']>('Routine Follow-up');
  const [apptLocation, setApptLocation] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptError, setApptError] = useState('');
  const [isSavingAppt, setIsSavingAppt] = useState(false);

  // Reset disease choice & title when patient or condition list changes
  useEffect(() => {
    setSummaryTitle(`OPD Visit Summary - ${activePerson.name}`);
    if (conditions.length > 0) {
      if (
        selectedDiseaseId !== 'all' &&
        selectedDiseaseId !== 'general' &&
        !conditions.some((c) => c.id === selectedDiseaseId)
      ) {
        setSelectedDiseaseId(conditions[0].id);
      }
    } else if (selectedDiseaseId !== 'all') {
      setSelectedDiseaseId('general');
    }
  }, [activePerson.id, activePerson.name, conditions]);

  const unlinkedSymptomsCount = useMemo(
    () => symptoms.filter((s) => !s.condition_ids || s.condition_ids.length === 0).length,
    [symptoms]
  );

  const selectedCondition = useMemo(
    () =>
      selectedDiseaseId === 'general' || selectedDiseaseId === 'all'
        ? null
        : conditions.find((c) => c.id === selectedDiseaseId) || null,
    [conditions, selectedDiseaseId]
  );

  const diseaseMatchingSymptoms = useMemo(() => {
    if (selectedDiseaseId === 'all') {
      return symptoms;
    }
    if (selectedDiseaseId === 'general') {
      return symptoms.filter((s) => !s.condition_ids || s.condition_ids.length === 0);
    }
    return symptoms.filter((s) => s.condition_ids?.includes(selectedDiseaseId));
  }, [symptoms, selectedDiseaseId]);

  const filteredSymptoms = useMemo(() => {
    const cutoff = Date.now() - dateRangeDays * 86400000;
    return diseaseMatchingSymptoms.filter(
      (s) => new Date(s.start_datetime).getTime() >= cutoff
    );
  }, [diseaseMatchingSymptoms, dateRangeDays]);

  // Auto-select matching symptom entries when disease or timeframe changes
  useEffect(() => {
    setSelectedSymptomIds(filteredSymptoms.slice(0, 50).map((s) => s.id));
  }, [selectedDiseaseId, dateRangeDays, activePerson.id, symptoms.length]);

  const activeSelectedSymptoms = useMemo(() => {
    return diseaseMatchingSymptoms.filter((s) => selectedSymptomIds.includes(s.id));
  }, [diseaseMatchingSymptoms, selectedSymptomIds]);

  const selectedAppointment = appointments.find((a) => a.id === selectedApptId);

  const toggleSymptomSelection = (id: string) => {
    setSelectedSymptomIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    setSelectedSymptomIds(filteredSymptoms.map((s) => s.id));
  };

  const togglePrintOption = (key: keyof PrintContentOptions) => {
    setPrintOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddQuestion = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!customQuestions.includes(trimmed)) {
      setCustomQuestions((prev) => [...prev, trimmed]);
    }
    setNewQuestionText('');
  };

  const handleRemoveQuestion = (index: number) => {
    setCustomQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownloadPdf = () => {
    const start =
      activeSelectedSymptoms.length > 0
        ? activeSelectedSymptoms[activeSelectedSymptoms.length - 1].start_datetime
        : new Date(Date.now() - dateRangeDays * 86400000).toISOString();
    const end =
      activeSelectedSymptoms.length > 0
        ? activeSelectedSymptoms[0].start_datetime
        : new Date().toISOString();

    const diseaseSlug =
      selectedDiseaseId === 'all'
        ? 'All-Diseases-Health-History'
        : selectedCondition
        ? selectedCondition.name.replace(/\s+/g, '-')
        : 'General-Report';

    const reportConditions =
      selectedDiseaseId === 'all'
        ? conditions
        : selectedCondition
        ? [selectedCondition]
        : [];

    const doc = generateAppointmentSummaryPdf({
      patient: activePerson,
      conditions: reportConditions,
      selectedCondition,
      appointment: selectedAppointment,
      title:
        selectedDiseaseId === 'all'
          ? `Entire Health History Report - ${activePerson.name}`
          : selectedCondition
          ? `${selectedCondition.name} - ${summaryTitle}`
          : summaryTitle,
      dateRange: { start, end },
      symptoms: activeSelectedSymptoms,
      vitalLogs,
      questions: customQuestions,
      visitNotes,
      generatedAt: new Date().toISOString(),
      options: printOptions,
    });
    doc.save(`VisitReady-${activePerson.name.replace(/\s+/g, '-')}-${diseaseSlug}.pdf`);
  };

  const handleSaveSnapshot = async () => {
    setIsSavingSummary(true);
    setSummaryError('');
    try {
      const start =
        activeSelectedSymptoms.length > 0
          ? activeSelectedSymptoms[activeSelectedSymptoms.length - 1].start_datetime
          : new Date(Date.now() - dateRangeDays * 86400000).toISOString();
      const end =
        activeSelectedSymptoms.length > 0
          ? activeSelectedSymptoms[0].start_datetime
          : new Date().toISOString();

      await onCreateSummary({
        person_id: activePerson.id,
        appointment_id: selectedApptId || undefined,
        title: summaryTitle,
        date_range_start: start,
        date_range_end: end,
        selected_entry_ids: selectedSymptomIds,
        custom_questions: customQuestions,
        visit_notes: visitNotes,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSummaryError(err?.message || 'Could not save summary snapshot.');
    } finally {
      setIsSavingSummary(false);
    }
  };

  const handleCreateApptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptClinic.trim() || !apptDatetime) {
      setApptError('Please enter both doctor/clinic name and date/time.');
      return;
    }
    setApptError('');
    setIsSavingAppt(true);
    try {
      await onCreateAppointment({
        person_id: activePerson.id,
        clinician_or_clinic: apptClinic.trim(),
        appointment_datetime: new Date(apptDatetime).toISOString(),
        appointment_type: apptType,
        location_or_telehealth: apptLocation.trim() || undefined,
        notes: apptNotes.trim() || undefined,
        status: 'upcoming',
      });
      setShowApptForm(false);
      setApptClinic('');
      setApptDatetime('');
      setApptLocation('');
      setApptNotes('');
    } catch (err: any) {
      setApptError(err?.message || 'Could not save appointment.');
    } finally {
      setIsSavingAppt(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">OPD & Visit Preparation</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Organize symptoms, doctor questions, and generate a clean document or PNG summary.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowApptForm(true)}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Upcoming Visit
        </button>
      </div>

      {/* Add Appointment Modal */}
      {showApptForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-emerald-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-emerald-100 bg-emerald-50/40">
              <h3 className="text-sm font-bold text-zinc-900">Schedule OPD / Doctor Visit</h3>
              <button
                type="button"
                onClick={() => setShowApptForm(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateApptSubmit} className="p-5 space-y-3.5">
              {apptError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium">
                  {apptError}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Doctor / Hospital / Clinic *
                </label>
                <input
                  type="text"
                  required
                  value={apptClinic}
                  onChange={(e) => setApptClinic(e.target.value)}
                  placeholder="e.g. Dr. Ananya Kulkarni • Apollo Clinic, Indiranagar"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={apptDatetime}
                    onChange={(e) => setApptDatetime(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Visit Type
                  </label>
                  <select
                    value={apptType}
                    onChange={(e) => setApptType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
                  >
                    <option value="Routine Follow-up">Routine Follow-up</option>
                    <option value="Specialist Consultation">Specialist Consultation</option>
                    <option value="New Symptom Evaluation">New Symptom Evaluation</option>
                    <option value="Lab / Diagnostic Review">Lab / Diagnostic Review</option>
                    <option value="Urgent Check-in">Urgent Check-in</option>
                    <option value="Annual Wellness">Annual Health Checkup</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Location / Video Teleconsult
                </label>
                <input
                  type="text"
                  value={apptLocation}
                  onChange={(e) => setApptLocation(e.target.value)}
                  placeholder="e.g. OPD Room 4 / Practo Video Consult"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Prep Notes (Carry reports, fasting, etc.)
                </label>
                <textarea
                  rows={2}
                  value={apptNotes}
                  onChange={(e) => setApptNotes(e.target.value)}
                  placeholder="Carry thyroid & CBC reports, old prescription..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApptForm(false)}
                  className="px-3.5 py-2 text-xs font-medium text-zinc-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingAppt}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isSavingAppt ? 'Saving...' : 'Save Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upcoming Visits List */}
      <div className="bg-white rounded-xl border border-emerald-200/80 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-700" />
            Scheduled Visits ({appointments.length})
          </h2>
        </div>

        {appointments.length === 0 ? (
          <p className="text-xs text-zinc-500 py-4 text-center bg-emerald-50/30 rounded-lg border border-emerald-100">
            No upcoming visits scheduled yet. Click &ldquo;Add Upcoming Visit&rdquo; to attach one to your summary.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {appointments.map((appt) => {
              const isSelected = selectedApptId === appt.id;
              return (
                <div
                  key={appt.id}
                  onClick={() => setSelectedApptId(isSelected ? '' : appt.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-emerald-50/70 border-emerald-500'
                      : 'bg-white border-zinc-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="inline-block text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 mb-1">
                      {appt.appointment_type}
                    </span>
                    <p className="font-semibold text-sm text-zinc-900 truncate">
                      {appt.clinician_or_clinic}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-zinc-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        {new Date(appt.appointment_datetime).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      {appt.location_or_telehealth && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          {appt.location_or_telehealth}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAppointment(appt.id);
                    }}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    title="Delete Visit"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Summary Builder */}
      <div className="bg-white rounded-xl border border-emerald-200/80 p-5 sm:p-6 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-emerald-100">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Doctor Visit Summary Builder</h2>
            <p className="text-xs text-zinc-500">
              Select symptoms & questions to preview as a clean single-page document or PNG image.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDocModal(true)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              Preview Dashboard Summary
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3 py-2 border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => setShowDocModal(true)}
              className="px-3 py-2 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>

        {/* Choose Disease for Final Print / PDF Report */}
        <div className="p-4 rounded-xl bg-emerald-50/45 border border-emerald-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-emerald-950 block">
                1. Choose Disease for Final Report / PDF *
              </span>
              <span className="text-2xs text-zinc-600">
                Print a focused single-disease report OR select &ldquo;All Diseases&rdquo; for the complete health history.
              </span>
            </div>
            <select
              aria-label="Choose Disease for Report"
              value={selectedDiseaseId}
              onChange={(e) => setSelectedDiseaseId(e.target.value)}
              className="px-3 py-2 border border-emerald-300 bg-white rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:border-emerald-700"
            >
              {conditions.map((c) => {
                const count = symptoms.filter((s) => s.condition_ids?.includes(c.id)).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({count} {count === 1 ? 'symptom log' : 'symptom logs'})
                  </option>
                );
              })}
              <option value="all">
                All Diseases — Entire Health History ({conditions.length}{' '}
                {conditions.length === 1 ? 'disease' : 'diseases'} · {symptoms.length}{' '}
                {symptoms.length === 1 ? 'log' : 'logs'})
              </option>
              {(conditions.length === 0 || unlinkedSymptomsCount > 0) && (
                <option value="general">
                  General / Unlinked Symptoms ({unlinkedSymptomsCount})
                </option>
              )}
            </select>
          </div>

          <div className="pt-2 border-t border-emerald-200/70 space-y-2">
            <span className="text-xs font-bold text-emerald-950 block">
              2. Customize Print &amp; PDF Content
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {(
                [
                  ['includePatientHeader', 'Patient Header & Contact'],
                  ['includeVitalsSnapshot', 'Vitals & BMI KPI Cards'],
                  ['includeAllergiesAndMeds', 'Allergies, Meds & History'],
                  ['includeDiseaseTreatments', 'Disease & Doctors Plan'],
                  ['includeSymptomLog', 'Symptom Log Table'],
                  ['includeSymptomVitals', 'Home Vitals in Table'],
                  ['includeSymptomNotes', 'Triggers & Symptom Notes'],
                  ['includeQuestions', 'Questions for Doctor'],
                  ['includeConsultationPad', 'Doctor Notes Pad'],
                ] as [keyof PrintContentOptions, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200/70 text-zinc-800 cursor-pointer hover:bg-emerald-50/40"
                >
                  <input
                    type="checkbox"
                    checked={printOptions[key]}
                    onChange={() => togglePrintOption(key)}
                    className="rounded accent-emerald-700"
                  />
                  <span className="truncate">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Title & Timeframe */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Summary Title</label>
            <input
              type="text"
              value={summaryTitle}
              onChange={(e) => setSummaryTitle(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Date Range</label>
            <select
              value={dateRangeDays}
              onChange={(e) => setDateRangeDays(Number(e.target.value))}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 3 Months</option>
              <option value={365}>Last 1 Year</option>
              <option value={36500}>All Time (Entire History)</option>
            </select>
          </div>
        </div>

        {/* Select Symptoms to Include */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-700">
              Select Symptom Entries ({activeSelectedSymptoms.length} selected)
            </span>
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
            >
              Select All ({filteredSymptoms.length})
            </button>
          </div>

          {filteredSymptoms.length === 0 ? (
            <p className="text-xs text-zinc-500 p-4 bg-zinc-50 rounded-lg border border-zinc-200 text-center">
              No symptom entries in this timeframe.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-xl">
              {filteredSymptoms.map((s) => {
                const checked = selectedSymptomIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${
                      checked ? 'bg-emerald-50/50' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSymptomSelection(s.id)}
                        className="rounded accent-emerald-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="font-semibold text-zinc-900 block truncate">
                          {s.symptom_name}
                        </span>
                        <span className="text-2xs text-zinc-500">
                          {new Date(s.start_datetime).toLocaleDateString('en-IN')}
                          {s.body_location ? ` • ${s.body_location}` : ''}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 shrink-0 ml-2">
                      {s.severity_0_to_10}/10
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Questions to Ask Doctor + Categorized Quick Prompt Dropdown */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-semibold text-zinc-700">
              Questions to Ask My Doctor ({customQuestions.length})
            </label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleAddQuestion(e.target.value);
                }
              }}
              className="px-3 py-1.5 border border-emerald-200 bg-emerald-50/40 text-emerald-900 rounded-lg text-xs font-medium focus:outline-none focus:border-emerald-700 cursor-pointer"
            >
              <option value="">Quick prompts to ask a doctor...</option>
              {DOCTOR_QUESTION_PROMPT_CATEGORIES.map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.prompts.map((prompt) => (
                    <option key={prompt} value={prompt}>
                      {prompt}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddQuestion(newQuestionText);
                }
              }}
              placeholder="Write your own question for the doctor..."
              className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
            />
            <button
              type="button"
              onClick={() => handleAddQuestion(newQuestionText)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {customQuestions.map((q, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs"
              >
                <div className="flex items-start gap-2">
                  <span className="text-zinc-400 font-semibold">[ ]</span>
                  <span className="font-semibold text-emerald-700">{idx + 1}.</span>
                  <span className="text-zinc-800">{q}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveQuestion(idx)}
                  className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Visit Notes */}
        <div>
          <label className="block text-xs font-semibold text-zinc-700 mb-1">
            Additional OPD Visit Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={visitNotes}
            onChange={(e) => setVisitNotes(e.target.value)}
            placeholder="Questions about medicines, test reports to show the doctor..."
            className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
          />
        </div>

        {/* Save Snapshot */}
        <div className="flex items-center justify-between pt-2 border-t border-emerald-100">
          <div className="text-xs font-medium">
            {summaryError && <span className="text-rose-700">{summaryError}</span>}
            {saveSuccess && (
              <span className="text-emerald-700 flex items-center gap-1">
                <Check className="w-4 h-4" /> Summary snapshot saved to records.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={isSavingSummary}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {isSavingSummary ? 'Saving...' : 'Save Summary Snapshot'}
          </button>
        </div>
      </div>

      {/* Saved Summaries Archive */}
      {summaries.length > 0 && (
        <div className="bg-white rounded-xl border border-emerald-200/80 p-5 shadow-2xs space-y-3">
          <h3 className="text-sm font-bold text-zinc-900">Saved Visit Summaries ({summaries.length})</h3>
          <div className="divide-y divide-zinc-100">
            {summaries.map((sum) => (
              <div key={sum.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-zinc-900">{sum.title}</span>
                  <span className="block text-2xs text-zinc-500">
                    Saved {new Date(sum.created_at).toLocaleDateString('en-IN')} • {sum.selected_entry_ids.length} symptoms • {sum.custom_questions.length} questions
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteSummary(sum.id)}
                  className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ClinicalDocumentModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        patient={activePerson}
        conditions={conditions}
        symptoms={activeSelectedSymptoms}
        vitalLogs={vitalLogs}
        appointment={selectedAppointment}
        questions={customQuestions}
        visitNotes={visitNotes}
        selectedDiseaseId={selectedDiseaseId}
        onChangeDiseaseId={setSelectedDiseaseId}
        printOptions={printOptions}
        onChangePrintOptions={setPrintOptions}
      />
    </div>
  );
};
