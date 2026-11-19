/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  SymptomEntry,
  Person,
  Condition,
} from '../types/index.ts';
import { SEVERITY_DESCRIPTIONS } from '../utils/safety.ts';
import { getBloodSugarReadings, formatBloodSugarContext } from '../utils/vitals.ts';

interface TrendsViewProps {
  activePerson: Person;
  conditions: Condition[];
  symptoms: SymptomEntry[];
}

export const TrendsView: React.FC<TrendsViewProps> = ({
  activePerson,
  conditions,
  symptoms,
}) => {
  // Filters
  const [timeRange, setTimeRange] = useState<'7days' | '30days' | '90days' | 'all'>('30days');
  const [selectedConditionId, setSelectedConditionId] = useState<string>('all');
  const [selectedSymptomFilter, setSelectedSymptomFilter] = useState<string>('all');
  const [showAccessibleTable, setShowAccessibleTable] = useState(false);

  // Distinct symptom names for filter
  const distinctSymptomNames = useMemo(() => {
    const set = new Set<string>();
    symptoms.forEach((s) => set.add(s.symptom_name.trim()));
    return Array.from(set).sort();
  }, [symptoms]);

  // Filter symptoms
  const filteredSymptoms = useMemo(() => {
    const now = new Date().getTime();
    let minTime = 0;
    if (timeRange === '7days') minTime = now - 7 * 86400000;
    else if (timeRange === '30days') minTime = now - 30 * 86400000;
    else if (timeRange === '90days') minTime = now - 90 * 86400000;

    return symptoms.filter((s) => {
      const sTime = new Date(s.start_datetime).getTime();
      if (sTime < minTime) return false;
      if (selectedConditionId !== 'all' && !s.condition_ids?.includes(selectedConditionId))
        return false;
      if (selectedSymptomFilter !== 'all' && s.symptom_name.trim() !== selectedSymptomFilter)
        return false;
      return true;
    });
  }, [symptoms, timeRange, selectedConditionId, selectedSymptomFilter]);

  // Chronological
  const chronologicalSymptoms = useMemo(() => {
    return [...filteredSymptoms].sort(
      (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    );
  }, [filteredSymptoms]);

  // Summary statistics
  const stats = useMemo(() => {
    if (filteredSymptoms.length === 0) {
      return { totalEntries: 0, avgSeverity: '0.0', maxSeverity: 0, ongoingCount: 0 };
    }
    const total = filteredSymptoms.length;
    const sumSev = filteredSymptoms.reduce((acc, curr) => acc + curr.severity_0_to_10, 0);
    const avg = (sumSev / total).toFixed(1);
    const max = Math.max(...filteredSymptoms.map((s) => s.severity_0_to_10));
    const ongoing = filteredSymptoms.filter((s) => s.ongoing).length;
    return { totalEntries: total, avgSeverity: avg, maxSeverity: max, ongoingCount: ongoing };
  }, [filteredSymptoms]);

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Trends &amp; Metrics</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Self-reported logs for {activePerson.name}
          </p>
        </div>

        {/* Minimal Range Selector */}
        <div className="bg-white border border-zinc-200 p-0.5 rounded-lg flex items-center text-xs">
          {(['7days', '30days', '90days', 'all'] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setTimeRange(range)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                timeRange === range
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {range === '7days' ? '7D' : range === '30days' ? '30D' : range === '90days' ? '90D' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div className="text-2xs text-zinc-400 leading-relaxed border-l-2 border-zinc-200 pl-3 py-0.5">
        Neutral data display: These charts reflect your recorded entries without clinical inferences, risk scores, or diagnoses.
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <select
            value={selectedConditionId}
            onChange={(e) => setSelectedConditionId(e.target.value)}
            className="px-2.5 py-1 rounded-md border border-zinc-200 bg-white text-zinc-700 text-2xs"
          >
            <option value="all">All Conditions</option>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedSymptomFilter}
            onChange={(e) => setSelectedSymptomFilter(e.target.value)}
            className="px-2.5 py-1 rounded-md border border-zinc-200 bg-white text-zinc-700 text-2xs max-w-[180px]"
          >
            <option value="all">All Symptoms</option>
            {distinctSymptomNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowAccessibleTable(!showAccessibleTable)}
          className="text-2xs text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
        >
          {showAccessibleTable ? 'Hide Table' : 'Show Text Table'}
        </button>
      </div>

      {/* Minimal Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-zinc-200/80">
          <span className="text-3xs text-zinc-400 uppercase tracking-wider block font-medium">Entries</span>
          <span className="text-xl font-bold text-zinc-900 tabular-nums mt-0.5 block">{stats.totalEntries}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-zinc-200/80">
          <span className="text-3xs text-zinc-400 uppercase tracking-wider block font-medium">Avg Severity</span>
          <span className="text-xl font-bold text-zinc-900 tabular-nums mt-0.5 block">{stats.avgSeverity} <span className="text-xs font-normal text-zinc-400">/ 10</span></span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-zinc-200/80">
          <span className="text-3xs text-zinc-400 uppercase tracking-wider block font-medium">Max Severity</span>
          <span className="text-xl font-bold text-zinc-900 tabular-nums mt-0.5 block">{stats.maxSeverity} <span className="text-xs font-normal text-zinc-400">/ 10</span></span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-zinc-200/80">
          <span className="text-3xs text-zinc-400 uppercase tracking-wider block font-medium">Ongoing</span>
          <span className="text-xl font-bold text-zinc-900 tabular-nums mt-0.5 block">{stats.ongoingCount}</span>
        </div>
      </div>

      {/* Chart: Self-Reported Severity Over Time */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-zinc-200/80 space-y-3">
        <span className="text-xs font-semibold text-zinc-900 block">
          Self-Reported Severity Timeline
        </span>

        {chronologicalSymptoms.length === 0 ? (
          <p className="text-xs text-zinc-400 py-6 text-center">No entries recorded in this timeframe.</p>
        ) : (
          <div>
            <div className="h-40 flex items-end gap-2 border-b border-zinc-200/70 p-2 overflow-x-auto">
              {chronologicalSymptoms.map((entry) => {
                const heightPct = Math.max(10, (entry.severity_0_to_10 / 10) * 100);
                return (
                  <div
                    key={entry.id}
                    className="flex-1 min-w-[32px] max-w-[48px] flex flex-col items-center group relative cursor-pointer"
                  >
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1.5 bg-zinc-900 text-white text-3xs rounded px-2 py-1 shadow pointer-events-none z-10 whitespace-nowrap">
                      {entry.symptom_name} ({entry.severity_0_to_10}/10)
                    </div>

                    <span className="text-3xs font-medium text-zinc-500 mb-1">
                      {entry.severity_0_to_10}
                    </span>

                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full rounded-t-sm bg-zinc-800 group-hover:bg-zinc-950 transition-colors"
                    />

                    <span className="text-3xs text-zinc-400 mt-1 truncate w-full text-center">
                      {new Date(entry.start_datetime).toLocaleDateString(undefined, {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-3xs text-zinc-400 mt-1.5 px-1">
              <span>Oldest</span>
              <span>Newest</span>
            </div>
          </div>
        )}
      </div>

      {/* Home Vitals Summary */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-zinc-200/80 space-y-3">
        <span className="text-xs font-semibold text-zinc-900 block">
          Recorded Home Vitals
        </span>

        {chronologicalSymptoms.filter((s) => s.vitals && Object.keys(s.vitals).length > 0).length === 0 ? (
          <p className="text-xs text-zinc-400 py-4 text-center">No vitals logged in this timeframe.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-2xs text-zinc-400 border-b border-zinc-100">
                <tr>
                  <th className="py-1.5 px-2 font-medium">Date</th>
                  <th className="py-1.5 px-2 font-medium">Symptom</th>
                  <th className="py-1.5 px-2 font-medium">BP</th>
                  <th className="py-1.5 px-2 font-medium">Pulse</th>
                  <th className="py-1.5 px-2 font-medium">Temp</th>
                  <th className="py-1.5 px-2 font-medium">SpO2</th>
                  <th className="py-1.5 px-2 font-medium">Glucose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 text-zinc-700">
                {chronologicalSymptoms
                  .filter((s) => s.vitals && Object.keys(s.vitals).length > 0)
                  .map((entry) => (
                    <tr key={entry.id} className="hover:bg-zinc-50/50">
                      <td className="py-2 px-2 text-zinc-500 whitespace-nowrap">
                        {new Date(entry.start_datetime).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-2 font-medium text-zinc-900 truncate max-w-[140px]">
                        {entry.symptom_name}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {entry.vitals?.blood_pressure_systolic && entry.vitals?.blood_pressure_diastolic
                          ? `${entry.vitals.blood_pressure_systolic}/${entry.vitals.blood_pressure_diastolic}`
                          : '—'}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {entry.vitals?.pulse ? `${entry.vitals.pulse} bpm` : '—'}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {entry.vitals?.temperature
                          ? `${entry.vitals.temperature}°${entry.vitals.temperature_unit || 'F'}`
                          : '—'}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {entry.vitals?.oxygen_spo2 ? `${entry.vitals.oxygen_spo2}%` : '—'}
                      </td>
                      <td className="py-2 px-2">
                        {getBloodSugarReadings(entry.vitals).length > 0
                          ? getBloodSugarReadings(entry.vitals)
                              .map((r) => `${r.value} mg/dL (${formatBloodSugarContext(r.context, true)})`)
                              .join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accessible Text Table */}
      {showAccessibleTable && (
        <div className="bg-white rounded-xl p-4 border border-zinc-200/80">
          <span className="text-xs font-semibold text-zinc-900 block mb-2">
            Text Table Summary
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-2xs text-zinc-400 border-b border-zinc-100">
                <tr>
                  <th className="py-1 px-2">Date</th>
                  <th className="py-1 px-2">Symptom</th>
                  <th className="py-1 px-2">Severity</th>
                  <th className="py-1 px-2">Status</th>
                  <th className="py-1 px-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 text-zinc-700">
                {chronologicalSymptoms.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-1.5 px-2 text-zinc-500 whitespace-nowrap">
                      {new Date(entry.start_datetime).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 px-2 font-medium text-zinc-900">{entry.symptom_name}</td>
                    <td className="py-1.5 px-2">{entry.severity_0_to_10}/10</td>
                    <td className="py-1.5 px-2">{entry.ongoing ? 'Ongoing' : 'Resolved'}</td>
                    <td className="py-1.5 px-2 text-zinc-500 truncate max-w-xs">
                      {entry.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
