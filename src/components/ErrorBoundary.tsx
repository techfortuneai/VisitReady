/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { firebaseProjectConfig } from '../firebase.ts';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  quotaUpgradeUrl?: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'An unexpected error occurred.';
    let friendly = raw;
    let quotaUpgradeUrl: string | undefined;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        friendly = parsed.error;
      }
    } catch {
      // plain string error
    }

    if (
      friendly.includes(
        "Quota exceeded for quota metric 'Free daily read units per project (free tier database)'"
      )
    ) {
      quotaUpgradeUrl = `https://console.firebase.google.com/project/${firebaseProjectConfig.projectId}/firestore/databases/${firebaseProjectConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
      friendly =
        'Daily free database read quota reached. Quota resets tomorrow, or you can review database limits in Firebase Console.';
    } else if (friendly.toLowerCase().includes('quota exceeded')) {
      friendly =
        'Cloud database quota exceeded for today. Quota resets tomorrow (see Firebase Spark plan limits).';
    }

    return { hasError: true, message: friendly, quotaUpgradeUrl };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f6faf7] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-rose-200 p-6 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-zinc-900">Unable to load VisitReady</h2>
            <p className="text-xs text-zinc-600 leading-relaxed">{this.state.message}</p>
            {this.state.quotaUpgradeUrl && (
              <p className="text-2xs text-emerald-800 break-all">
                Console: {this.state.quotaUpgradeUrl}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
