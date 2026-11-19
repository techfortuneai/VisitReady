/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  User,
  Activity,
  FileCheck2,
  Users,
  Settings,
  Plus,
  ChevronDown,
  HeartPulse,
} from 'lucide-react';
import { Person, User as UserType } from '../types/index.ts';

export type NavTab = 'dashboard' | 'profile' | 'diseases' | 'prep' | 'share' | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  user: UserType | null;
  activePerson: Person | null;
  people: Person[];
  onSelectPerson: (id: string) => void;
  onOpenPeopleModal: () => void;
  onOpenLogModal: () => void;
  onOpenVitalsModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  activePerson,
  onOpenPeopleModal,
  onOpenLogModal,
  onOpenVitalsModal,
}) => {
  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
    { id: 'profile' as NavTab, label: 'Patient Profile', shortLabel: 'Profile', icon: User },
    { id: 'diseases' as NavTab, label: 'Diseases & Symptoms', shortLabel: 'Diseases', icon: Activity },
    { id: 'prep' as NavTab, label: 'Visit Prep', shortLabel: 'Prep', icon: FileCheck2 },
    { id: 'share' as NavTab, label: 'Share & Care', shortLabel: 'Share', icon: Users },
    { id: 'settings' as NavTab, label: 'Settings', shortLabel: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-200/70 print:hidden">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-13 flex items-center justify-between gap-2">
          {/* Brand */}
          <button
            type="button"
            onClick={() => onTabChange('dashboard')}
            className="flex items-center gap-2 cursor-pointer shrink-0"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-100" />
            <span className="font-semibold text-sm tracking-tight text-zinc-900">
              Visit<span className="text-emerald-700">Ready</span>
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-0.5 text-xs">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/70'
                      : 'text-zinc-500 hover:text-emerald-800 hover:bg-emerald-50/40 border border-transparent'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Right Action Area */}
          <div className="flex items-center gap-2 shrink-0">
            {activePerson && (
              <button
                type="button"
                onClick={onOpenPeopleModal}
                className="px-2.5 py-1 rounded-md border border-emerald-200/80 bg-white text-2xs font-medium text-zinc-700 hover:bg-emerald-50/50 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Switch patient profile"
              >
                <span className="max-w-[110px] truncate text-zinc-900 font-medium">
                  {activePerson.name}
                </span>
                <ChevronDown className="w-3 h-3 text-emerald-600" />
              </button>
            )}

            {onOpenVitalsModal && (
              <button
                type="button"
                onClick={onOpenVitalsModal}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
              >
                <HeartPulse className="w-3 h-3 text-emerald-700" />
                <span className="hidden sm:inline">Log Vitals</span>
                <span className="sm:hidden">Vitals</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenLogModal}
              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3 h-3" />
              <span>Log Symptom</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-emerald-200/70 px-1 py-1.5 print:hidden"
      >
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center justify-center text-3xs font-medium transition-colors cursor-pointer py-1 px-1 rounded ${
                  isActive ? 'text-emerald-700 font-semibold' : 'text-zinc-400 hover:text-emerald-700'
                }`}
              >
                <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-emerald-700' : 'text-zinc-400'}`} />
                <span className="truncate">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
