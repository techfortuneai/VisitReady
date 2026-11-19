/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, Person } from '../types/index.ts';
import { api } from '../services/api.ts';
import { Download, LogOut, Trash2, Check, Globe } from 'lucide-react';

interface SettingsViewProps {
  user: User;
  activePerson: Person;
  onUpdateUser: (u: User) => void;
  onLogout: () => Promise<void>;
  onNavigateToShare?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  activePerson,
  onUpdateUser,
  onLogout,
  onNavigateToShare,
}) => {
  const [name, setName] = useState(user.name);
  const [timeZone, setTimeZone] = useState(user.preferences?.time_zone || 'Asia/Kolkata');
  const [dateFormat, setDateFormat] = useState<'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY'>(
    user.preferences?.date_format || 'DD/MM/YYYY'
  );
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>(user.preferences?.temperature_unit || 'F');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>(user.preferences?.weight_unit || 'kg');
  const [bloodSugarUnit, setBloodSugarUnit] = useState<'mg/dL' | 'mmol/L'>(
    user.preferences?.blood_sugar_unit || 'mg/dL'
  );

  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteBox, setShowDeleteBox] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { user: updated } = await api.updatePreferences({
        name: name.trim() || user.name,
        preferences: {
          time_zone: timeZone,
          date_format: dateFormat,
          temperature_unit: tempUnit,
          weight_unit: weightUnit,
          blood_sugar_unit: bloodSugarUnit,
        },
      });
      onUpdateUser(updated);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadExport = async (format: 'json' | 'csv') => {
    const content =
      format === 'json'
        ? await api.exportWorkspaceJson(activePerson.id)
        : await api.exportSymptomsCsv(activePerson.id);

    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `VisitReady-${activePerson.name.replace(/\s+/g, '-')}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.');
      return;
    }
    try {
      await api.deleteAccount('DELETE');
      window.location.reload();
    } catch (err: any) {
      setDeleteError(err.message || 'Deletion failed.');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Settings & Preferences</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Manage your units, time zone, data exports, and privacy controls.
        </p>
      </div>

      {/* Profile & Regional Units */}
      <form
        onSubmit={handleSavePreferences}
        className="bg-white rounded-xl border border-emerald-200/80 p-5 sm:p-6 shadow-2xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-700" />
            Account & Indian Regional Units
          </h2>
          {savedToast && (
            <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Preferences saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Account Holder Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-emerald-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="text"
              disabled
              value={user.email}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-zinc-50 text-zinc-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Time Zone</label>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
            >
              <option value="Asia/Kolkata">India Standard Time (IST / Asia/Kolkata)</option>
              <option value="Asia/Dubai">Gulf Standard Time (GST)</option>
              <option value="Asia/Singapore">Singapore Time (SGT)</option>
              <option value="Europe/London">London (GMT/BST)</option>
              <option value="America/New_York">US Eastern</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Date Format</label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as any)}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY (Indian Standard)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Weight Unit</label>
            <select
              value={weightUnit}
              onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lbs')}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
            >
              <option value="kg">Kilograms (kg)</option>
              <option value="lbs">Pounds (lbs)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Temperature Unit</label>
            <select
              value={tempUnit}
              onChange={(e) => setTempUnit(e.target.value as 'F' | 'C')}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
            >
              <option value="F">Fahrenheit (°F)</option>
              <option value="C">Celsius (°C)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">Blood Sugar Unit</label>
            <select
              value={bloodSugarUnit}
              onChange={(e) => setBloodSugarUnit(e.target.value as 'mg/dL' | 'mmol/L')}
              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:border-emerald-700"
            >
              <option value="mg/dL">mg/dL (Indian Labs Standard)</option>
              <option value="mmol/L">mmol/L</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {/* Care Team Shortcut & Data Exports */}
      <div className="bg-white rounded-xl border border-emerald-200/80 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Data Export & Care Sharing</h2>
            <p className="text-xs text-zinc-500">
              Download {activePerson.name}&apos;s records in portable CSV or JSON format.
            </p>
          </div>
          {onNavigateToShare && (
            <button
              type="button"
              onClick={onNavigateToShare}
              className="px-3 py-1.5 border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Open Share & Care Hub
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleDownloadExport('csv')}
            className="px-4 py-2 border border-emerald-200 bg-white hover:bg-emerald-50 text-zinc-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            Export CSV (Excel)
          </button>
          <button
            type="button"
            onClick={() => handleDownloadExport('json')}
            className="px-4 py-2 border border-emerald-200 bg-white hover:bg-emerald-50 text-zinc-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            Export Full JSON Backup
          </button>
        </div>
      </div>

      {/* Session & Account Removal */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Session & Account</h2>
            <p className="text-xs text-zinc-500">
              Signed in as {user.name} ({user.email}).
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        <div className="pt-4 border-t border-zinc-100">
          {!showDeleteBox ? (
            <button
              type="button"
              onClick={() => setShowDeleteBox(true)}
              className="text-xs font-medium text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Account & All Health Records
            </button>
          ) : (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <p className="text-xs text-rose-900 font-medium">
                This permanently deletes your account, profiles, diseases, symptom logs, and visit summaries. Type <span className="font-bold">DELETE</span> to confirm.
              </p>
              {deleteError && <p className="text-xs text-rose-700 font-semibold">{deleteError}</p>}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="Type DELETE"
                  className="px-3 py-1.5 border border-rose-300 rounded-lg text-xs bg-white"
                />
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteBox(false);
                    setDeleteConfirm('');
                    setDeleteError('');
                  }}
                  className="px-3 py-1.5 text-xs text-zinc-600 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
