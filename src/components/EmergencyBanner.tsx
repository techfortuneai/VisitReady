/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { SAFETY_DISCLAIMER } from '../utils/safety.ts';

interface EmergencyBannerProps {
  urgentKeywordDetected?: boolean;
  dismissible?: boolean;
}

export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({
  urgentKeywordDetected = false,
  dismissible = false,
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && !urgentKeywordDetected) return null;

  if (urgentKeywordDetected) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="bg-white border border-rose-200/90 p-4 rounded-xl shadow-2xs mb-4 text-zinc-900"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-rose-950 mb-0.5">
              Notice: Immediate Medical Attention
            </p>
            <p className="text-zinc-600 leading-relaxed">
              If you or the person you are recording for is having severe symptoms (such as difficulty breathing, severe chest pain, or sudden weakness), please call Indian emergency helpline 112 / 108 or visit your nearest hospital casualty immediately. VisitReady is for personal recordkeeping only and cannot detect emergencies.
            </p>
          </div>
          <a
            href="tel:112"
            className="shrink-0 px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md text-xs font-semibold transition-colors"
          >
            Call 112
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Safety notice"
      className="bg-white border border-emerald-200/70 px-3.5 py-2 rounded-xl mb-4 text-xs text-zinc-600 flex items-center justify-between gap-3 shadow-2xs"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
        <span className="leading-snug">
          <span className="font-semibold text-emerald-900">Recordkeeping only:</span> {SAFETY_DISCLAIMER}
        </span>
      </div>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer shrink-0"
          aria-label="Dismiss notice"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
