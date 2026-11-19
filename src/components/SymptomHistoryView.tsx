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
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SEVERITY_DESCRIPTIONS } from '../utils/safety.ts';
import { getBloodSugarReadings, formatBloodSugarContext } from '../utils/vitals.ts';

interface SymptomHistoryViewProps {
  activePerson: Person;
  conditions: Condition[];
  symptoms: SymptomEntry[];
  onOpenLogModal: (entry?: SymptomEntry) => void;
  onDeleteSymptom: (id: string) => Promise<void>;
  onOpenConditionsModal?: () => void;
}

export const SymptomHistoryView: React.FC<SymptomHistoryViewProps> = ({
  activePerson,
  conditions,
  symptoms,
  onOpenLogModal,
  onDeleteSymptom,
  onOpenConditionsModal,
}) => {
  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConditionId, setSelectedConditionId] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Calendar month selection
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    symptoms.forEach((s) => s.tags?.forEach((t) => set.add(t.toLowerCase())));
    return Array.from(set).sort();
  }, [symptoms]);

  // Symptoms count per condition
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

  // Filtered symptoms
  const filteredSymptoms = useMemo(() => {
    return symptoms.filter((s) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          s.symptom_name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.context?.toLowerCase().includes(q) ||
          s.possible_triggers?.toLowerCase().includes(q) ||
          s.body_location?.toLowerCase().includes(q) ||
          s.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Condition
      if (selectedConditionId !== 'all') {
        if (!s.condition_ids?.includes(selectedConditionId)) return false;
      }

      // Severity
      if (severityFilter === 'mild' && (s.severity_0_to_10 < 1 || s.severity_0_to_10 > 3)) return false;
      if (severityFilter === 'moderate' && (s.severity_0_to_10 < 4 || s.severity_0_to_10 > 6)) return false;
      if (severityFilter === 'severe' && s.severity_0_to_10 < 7) return false;

      // Tag
      if (selectedTag !== 'all') {
        if (!s.tags?.some((t) => t.toLowerCase() === selectedTag.toLowerCase())) return false;
      }

      // Date Range
      if (startDate && s.start_datetime < startDate) return false;
      if (endDate && s.start_datetime > `${endDate}T23:59:59Z`) return false;

      return true;
    });
  }, [symptoms, searchQuery, selectedConditionId, severityFilter, selectedTag, startDate, endDate]);

  // Paginated list
  const totalPages = Math.ceil(filteredSymptoms.length / itemsPerPage) || 1;
  const paginatedSymptoms = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSymptoms.slice(start, start + itemsPerPage);
  }, [filteredSymptoms, currentPage, itemsPerPage]);

  // Inline confirm used for symptom deletion

  // Calendar helpers
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentMonthDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentMonthDate(new Date(year, month + 1, 1));

  // Group symptoms by date
  const symptomsByDate = useMemo(() => {
    const map = new Map<string, SymptomEntry[]>();
    filteredSymptoms.forEach((s) => {
      const key = s.start_datetime.slice(0, 10);
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    });
    return map;
  }, [filteredSymptoms]);

  return (
    <div className="space-y-3.5 max-w-4xl mx-auto pb-14 text-zinc-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Symptom Log</h1>
          <p className="text-2xs text-zinc-500 mt-0.5">
            {activePerson.name} · {filteredSymptoms.length} of {symptoms.length} entries
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white border border-zinc-200 p-0.5 rounded-md flex items-center text-3xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Calendar
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenLogModal()}
            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Record</span>
          </button>
        </div>
      </div>

      {/* Disease Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => {
            setSelectedConditionId('all');
            setCurrentPage(1);
          }}
          className={`px-2.5 py-1 rounded-md text-3xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
            selectedConditionId === 'all'
              ? 'bg-zinc-900 text-white'
              : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          <span>All Diseases</span>
          <span className={`font-mono px-1 py-0.2 rounded ${selectedConditionId === 'all' ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-500'}`}>
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
              onClick={() => {
                setSelectedConditionId(c.id);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-3xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                isSelected
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <span>{c.name}</span>
              <span className={`font-mono px-1 py-0.2 rounded ${isSelected ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-500'}`}>
                {count}
              </span>
            </button>
          );
        })}

        {onOpenConditionsModal && (
          <button
            type="button"
            onClick={onOpenConditionsModal}
            className="px-2 py-1 rounded-md text-3xs font-medium border border-dashed border-zinc-300 text-zinc-500 hover:text-zinc-900 hover:border-zinc-400 bg-transparent cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-0.5"
          >
            <Plus className="w-2.5 h-2.5" />
            <span>Add Disease</span>
          </button>
        )}
      </div>

      {/* Sleek Minimalist Search & Filter Strip */}
      <div className="bg-white rounded-lg p-2.5 border border-zinc-200/80 space-y-2">
        <div className="relative">
          <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search symptoms, notes, locations, triggers..."
            className="w-full pl-7 pr-3 py-1 text-2xs rounded-md border border-zinc-200 focus:outline-hidden focus:border-zinc-400 text-zinc-900 placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-3xs text-zinc-400 hover:text-zinc-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Minimal Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-3xs">
          <select
            value={selectedConditionId}
            onChange={(e) => {
              setSelectedConditionId(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded border border-zinc-200 bg-white text-zinc-700"
          >
            <option value="all">All Conditions</option>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded border border-zinc-200 bg-white text-zinc-700"
          >
            <option value="all">All Severities</option>
            <option value="mild">Mild (1-3)</option>
            <option value="moderate">Moderate (4-6)</option>
            <option value="severe">Severe (7-10)</option>
          </select>

          <select
            value={selectedTag}
            onChange={(e) => {
              setSelectedTag(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded border border-zinc-200 bg-white text-zinc-700"
          >
            <option value="all">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded border border-zinc-200 bg-white text-zinc-700"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-lg border border-zinc-200/80 divide-y divide-zinc-100">
          {filteredSymptoms.length === 0 ? (
            <div className="text-center py-10 p-4">
              <p className="text-2xs text-zinc-400">No matching symptoms found.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedConditionId('all');
                  setSeverityFilter('all');
                  setSelectedTag('all');
                  setStartDate('');
                  setEndDate('');
                }}
                className="mt-1 text-2xs font-medium text-zinc-900 underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <>
              {paginatedSymptoms.map((entry) => {
                const matchedConds = conditions.filter((c) => entry.condition_ids?.includes(c.id));

                return (
                  <div
                    key={entry.id}
                    className="p-3 hover:bg-zinc-50/50 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 group"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-900">
                          {entry.symptom_name}
                        </span>
                        <span className="text-3xs text-zinc-300">·</span>
                        <span className="text-3xs font-mono font-medium text-zinc-700">
                          Sev {entry.severity_0_to_10}/10
                        </span>
                        {entry.ongoing && (
                          <>
                            <span className="text-3xs text-zinc-300">·</span>
                            <span className="text-3xs text-zinc-900 font-medium">Ongoing</span>
                          </>
                        )}
                        {matchedConds.map((c) => (
                          <span
                            key={c.id}
                            className="text-3xs px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 font-medium"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-3xs text-zinc-400 font-mono">
                        <span>
                          {new Date(entry.start_datetime).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {entry.duration_text && <span>· Dur: {entry.duration_text}</span>}
                        {entry.body_location && <span>· Loc: {entry.body_location}</span>}
                      </div>

                      {entry.description && (
                        <p className="text-2xs text-zinc-600 leading-relaxed pt-0.5">
                          {entry.description}
                        </p>
                      )}

                      {(entry.context || entry.possible_triggers || entry.better_or_worse_notes) && (
                        <div className="text-3xs text-zinc-500 pt-0.5 space-y-0.5">
                          {entry.context && <div>Context: {entry.context}</div>}
                          {entry.possible_triggers && (
                            <div>Observation: {entry.possible_triggers}</div>
                          )}
                          {entry.better_or_worse_notes && (
                            <div>Relief / Aggravation: {entry.better_or_worse_notes}</div>
                          )}
                        </div>
                      )}

                      {entry.vitals && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-zinc-600 font-mono pt-1 border-t border-zinc-100">
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
                              Glucose ({formatBloodSugarContext(sr.context, true)}): {sr.value} mg/dL
                              {sr.time_note ? ` @ ${sr.time_note}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-start opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onOpenLogModal(entry)}
                        className="p-1 text-zinc-400 hover:text-zinc-900 rounded cursor-pointer"
                        title="Edit entry"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {confirmDeleteId === entry.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteSymptom(entry.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-3xs font-medium cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-3xs text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div className="p-2.5 flex items-center justify-between text-3xs text-zinc-500 font-mono">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-0.5 rounded border border-zinc-200 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2 py-0.5 rounded border border-zinc-200 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Minimalist Calendar View */
        <div className="bg-white rounded-lg p-3.5 border border-zinc-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900">
              {currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonthDate(new Date())}
                className="px-2 py-0.5 text-3xs font-medium text-zinc-700 hover:bg-zinc-100 rounded cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-3xs font-medium text-zinc-400">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} className="min-h-[56px] bg-zinc-50/50 rounded" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayEntries = symptomsByDate.get(dateStr) || [];
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;

              return (
                <div
                  key={dateStr}
                  className={`min-h-[56px] p-1 rounded border flex flex-col justify-between transition-colors ${
                    isToday
                      ? 'border-zinc-900 bg-zinc-50/50'
                      : dayEntries.length > 0
                      ? 'border-zinc-200 bg-white'
                      : 'border-zinc-100 bg-zinc-50/30'
                  }`}
                >
                  <span
                    className={`text-3xs font-medium ${
                      isToday ? 'font-bold text-zinc-900' : 'text-zinc-500'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {dayEntries.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {dayEntries.slice(0, 2).map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => onOpenLogModal(entry)}
                          className="w-full text-left truncate text-3xs px-1 py-0.2 rounded bg-zinc-100 text-zinc-800 hover:bg-zinc-200 cursor-pointer block"
                          title={entry.symptom_name}
                        >
                          {entry.symptom_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
