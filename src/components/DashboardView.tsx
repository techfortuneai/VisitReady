/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  DailyVitalLog,
} from '../types/index.ts';
import {
  Plus,
  Calendar,
  ChevronRight,
  FileCheck2,
  Users,
  UserPlus,
  HeartPulse,
  Trash2,
  Edit3,
} from 'lucide-react';
import { EmergencyBanner } from './EmergencyBanner.tsx';
import { getBloodSugarReadings, formatBloodSugarContext } from '../utils/vitals.ts';

interface DashboardViewProps {
  activePerson: Person;
  conditions: Condition[];
  symptoms: SymptomEntry[];
  vitalLogs?: DailyVitalLog[];
  appointments: Appointment[];
  onOpenLogModal: (entry?: SymptomEntry) => void;
  onOpenVitalsModal?: (entry?: DailyVitalLog) => void;
  onDeleteVitalLog?: (id: string) => Promise<void>;
  onOpenAddDisease: () => void;
  onOpenCreatePerson: () => void;
  onOpenAppointmentModal: (appt?: Appointment) => void;
  onOpenConditionsModal: () => void;
  onOpenPeopleModal: () => void;
  onNavigateToPrep: () => void;
  onNavigateToHistory: () => void;
  onNavigateToDiseases?: (conditionId?: string) => void;
  onNavigateToShare?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activePerson,
  conditions,
  symptoms,
  vitalLogs = [],
  appointments,
  onOpenLogModal,
  onOpenVitalsModal,
  onDeleteVitalLog,
  onOpenAddDisease,
  onOpenCreatePerson,
  onOpenConditionsModal,
  onNavigateToPrep,
  onNavigateToHistory,
  onNavigateToDiseases,
  onNavigateToShare,
}) => {
  const [confirmDeleteVitalId, setConfirmDeleteVitalId] = useState<string | null>(null);

  const nowTime = new Date().getTime();
  const upcomingAppointments = appointments
    .filter((a) => a.status === 'upcoming' && new Date(a.appointment_datetime).getTime() >= nowTime - 3600000)
    .sort(
      (a, b) =>
        new Date(a.appointment_datetime).getTime() - new Date(b.appointment_datetime).getTime()
    );
  const nextAppointment = upcomingAppointments[0];

  const recentSymptoms = symptoms.slice(0, 5);
  const sortedVitalLogs = [...vitalLogs].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  );

  // Pick newest resting vitals across standalone daily vital logs and symptom entries
  const latestSymptomVital = symptoms.find((s) => s.vitals && Object.keys(s.vitals).length > 0);
  const latestDailyVital = sortedVitalLogs[0];
  const useDailyAsLatest =
    latestDailyVital &&
    (!latestSymptomVital ||
      new Date(latestDailyVital.recorded_at).getTime() >=
        new Date(latestSymptomVital.start_datetime).getTime());

  const latestVitals = useDailyAsLatest ? latestDailyVital : latestSymptomVital?.vitals;
  const latestVitalsDate = useDailyAsLatest
    ? latestDailyVital?.recorded_at
    : latestSymptomVital?.start_datetime;

  let daysUntilAppt: number | null = null;
  if (nextAppointment) {
    const diffMs = new Date(nextAppointment.appointment_datetime).getTime() - nowTime;
    daysUntilAppt = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12 text-zinc-900">
      <EmergencyBanner dismissible />

      {/* Clean White & Green Minimalist Header */}
      <div className="bg-white rounded-xl p-4 border border-emerald-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 text-2xs text-zinc-500 mb-0.5">
            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-medium">
              {activePerson.relationship}
            </span>
            <span aria-hidden="true">·</span>
            <span>{symptoms.length} symptom logs</span>
            <span aria-hidden="true">·</span>
            <span>{sortedVitalLogs.length} daily vitals</span>
            {activePerson.allergies && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-rose-700 font-medium">Allergies: {activePerson.allergies}</span>
              </>
            )}
          </div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-900">
            {activePerson.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {onOpenVitalsModal && (
            <button
              type="button"
              onClick={() => onOpenVitalsModal()}
              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <HeartPulse className="w-3.5 h-3.5" />
              <span>Log Daily Vitals</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenLogModal()}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-700" />
            <span>Log Symptom</span>
          </button>
          <button
            type="button"
            onClick={onOpenAddDisease}
            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-700" />
            <span>Log New Disease</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreatePerson}
            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50/50 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-700" />
            <span>Add Patient</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToPrep}
            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50/40 text-zinc-700 border border-zinc-200 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Visit Prep</span>
          </button>
          {onNavigateToShare && (
            <button
              type="button"
              onClick={onNavigateToShare}
              className="px-2.5 py-1.5 bg-white hover:bg-emerald-50/40 text-zinc-700 border border-zinc-200 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-emerald-600" />
              <span>Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Next Appointment Callout */}
      {nextAppointment && (
        <div className="bg-white rounded-xl p-3.5 border border-emerald-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-2xs shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 text-xs">
                {nextAppointment.clinician_or_clinic}
                <span className="font-normal text-zinc-500 ml-1.5 text-2xs">
                  ({nextAppointment.appointment_type})
                </span>
              </p>
              <p className="text-zinc-500 text-3xs mt-0.5">
                {new Date(nextAppointment.appointment_datetime).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                {daysUntilAppt !== null && (
                  <span className="text-emerald-700 font-medium ml-1">
                    · {daysUntilAppt === 0 ? 'Today' : daysUntilAppt === 1 ? 'Tomorrow' : `In ${daysUntilAppt} days`}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToPrep}
            className="text-2xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-0.5 self-start sm:self-auto cursor-pointer"
          >
            <span>Visit Summary</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Conditions Strip */}
      <div className="bg-white rounded-xl p-4 border border-emerald-200/70 shadow-2xs">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-2xs font-semibold text-emerald-900 uppercase tracking-wider">
            Tracked Diseases &amp; Conditions
          </span>
          <div className="flex items-center gap-2.5">
            {onNavigateToDiseases && (
              <button
                type="button"
                onClick={() => onNavigateToDiseases()}
                className="text-3xs text-emerald-700 hover:text-emerald-900 cursor-pointer font-medium"
              >
                View Logs per Disease →
              </button>
            )}
            <button
              type="button"
              onClick={onOpenConditionsModal}
              className="text-3xs text-zinc-500 hover:text-emerald-800 cursor-pointer font-medium"
            >
              + Manage
            </button>
          </div>
        </div>

        {conditions.length === 0 ? (
          <p className="text-2xs text-zinc-400">
            No diseases or chronic conditions recorded.{' '}
            <button
              onClick={onOpenAddDisease}
              className="text-emerald-700 underline font-medium cursor-pointer"
            >
              Log a new disease
            </button>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {conditions.map((c) => {
              const count = symptoms.filter((s) => s.condition_ids?.includes(c.id)).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onNavigateToDiseases && onNavigateToDiseases(c.id)}
                  className="px-2.5 py-1 rounded-md border border-emerald-200/80 bg-emerald-50/50 hover:bg-emerald-100/70 text-2xs text-zinc-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span className="font-medium text-zinc-900">{c.name}</span>
                  <span className="text-3xs text-emerald-700">({count} logs)</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Resting Vitals */}
      {latestVitals && (
        <div className="bg-white rounded-xl p-4 border border-emerald-200/70 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-semibold text-emerald-900 uppercase tracking-wider">
              Latest Resting Vitals
            </span>
            {latestVitalsDate && (
              <span className="text-3xs text-zinc-400">
                {new Date(latestVitalsDate).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs">
            {latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic && (
              <div className="px-2.5 py-1 rounded bg-emerald-50/40 border border-emerald-100">
                <span className="text-zinc-500 mr-1">BP:</span>
                <span className="font-semibold text-zinc-900">
                  {latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic} mmHg
                </span>
              </div>
            )}
            {latestVitals.pulse && (
              <div className="px-2.5 py-1 rounded bg-emerald-50/40 border border-emerald-100">
                <span className="text-zinc-500 mr-1">Pulse:</span>
                <span className="font-semibold text-zinc-900">
                  {latestVitals.pulse} bpm
                </span>
              </div>
            )}
            {latestVitals.temperature && (
              <div className="px-2.5 py-1 rounded bg-emerald-50/40 border border-emerald-100">
                <span className="text-zinc-500 mr-1">Temp:</span>
                <span className="font-semibold text-zinc-900">
                  {latestVitals.temperature}°{latestVitals.temperature_unit || 'F'}
                </span>
              </div>
            )}
            {latestVitals.oxygen_spo2 && (
              <div className="px-2.5 py-1 rounded bg-emerald-50/40 border border-emerald-100">
                <span className="text-zinc-500 mr-1">SpO2:</span>
                <span className="font-semibold text-zinc-900">
                  {latestVitals.oxygen_spo2}%
                </span>
              </div>
            )}
            {latestVitals.weight && (
              <div className="px-2.5 py-1 rounded bg-emerald-50/40 border border-emerald-100">
                <span className="text-zinc-500 mr-1">Weight:</span>
                <span className="font-semibold text-zinc-900">
                  {latestVitals.weight} {latestVitals.weight_unit || 'kg'}
                </span>
              </div>
            )}
            {getBloodSugarReadings(latestVitals).map((sr) => (
              <div key={sr.id} className="px-2.5 py-1 rounded bg-emerald-50/40 border border-emerald-100">
                <span className="text-zinc-500 mr-1">
                  Sugar ({formatBloodSugarContext(sr.context, true)}):
                </span>
                <span className="font-semibold text-zinc-900">
                  {sr.value} mg/dL{sr.time_note ? ` · ${sr.time_note}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standalone Daily Vitals Tracker Card (No disease/symptom required) */}
      <div className="bg-white rounded-xl p-4 border border-emerald-200/70 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-2xs font-semibold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-emerald-700" />
              Daily Vitals Tracker ({sortedVitalLogs.length})
            </span>
            <p className="text-3xs text-zinc-400 mt-0.5">
              Regular BP, sugar, SpO2, pulse &amp; weight readings logged anytime—multiple entries per day
            </p>
          </div>
          {onOpenVitalsModal && (
            <button
              type="button"
              onClick={() => onOpenVitalsModal()}
              className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-2xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>Add Reading</span>
            </button>
          )}
        </div>

        {sortedVitalLogs.length === 0 ? (
          <div className="text-center py-5 bg-emerald-50/25 rounded-lg border border-dashed border-emerald-200/70">
            <p className="text-2xs text-zinc-500">
              No standalone daily vital readings recorded yet.
            </p>
            {onOpenVitalsModal && (
              <button
                type="button"
                onClick={() => onOpenVitalsModal()}
                className="mt-1.5 text-2xs font-semibold text-emerald-700 underline cursor-pointer"
              >
                + Record first BP / Sugar / SpO2 check
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sortedVitalLogs.slice(0, 6).map((log) => {
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
                          {log.weight} {log.weight_unit || 'kg'}
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

      {/* Recent Symptom Entries List — Strict 1-liner symptom name only */}
      <div className="bg-white rounded-xl p-4 border border-emerald-200/70 shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs font-semibold text-emerald-900 uppercase tracking-wider">
            Recent Symptoms ({symptoms.length})
          </span>
          {symptoms.length > 0 && (
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="text-2xs font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              View Symptom Log →
            </button>
          )}
        </div>

        {symptoms.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-2xs text-zinc-400">No symptoms recorded yet.</p>
            <button
              type="button"
              onClick={() => onOpenLogModal()}
              className="mt-1 text-2xs font-medium text-emerald-700 underline cursor-pointer"
            >
              Record your first entry
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {recentSymptoms.map((entry) => (
              <div
                key={entry.id}
                onClick={() => onOpenLogModal(entry)}
                className="py-2.5 px-2 hover:bg-emerald-50/40 flex items-center justify-between rounded cursor-pointer transition-colors group"
              >
                <span className="text-sm font-medium text-zinc-900 group-hover:text-emerald-950 truncate">
                  {entry.symptom_name}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-emerald-600 shrink-0 ml-2" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
