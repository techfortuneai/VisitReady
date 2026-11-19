/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.ts';
import { localDb } from './services/localDb.ts';
import {
  User,
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  AppointmentSummary,
  Collaborator,
  DailyVitalLog,
} from './types/index.ts';
import { api } from './services/api.ts';
import { Navbar, NavTab } from './components/Navbar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DiseaseView } from './components/DiseaseView.tsx';
import { PatientProfileView } from './components/PatientProfileView.tsx';
import { AppointmentPrepView } from './components/AppointmentPrepView.tsx';
import { CollaborationView } from './components/CollaborationView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { SymptomEntryModal } from './components/SymptomEntryModal.tsx';
import { DailyVitalsModal } from './components/DailyVitalsModal.tsx';
import { ConditionModal } from './components/ConditionModal.tsx';
import { PersonModal } from './components/PersonModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { EmergencyBanner } from './components/EmergencyBanner.tsx';
import {
  Activity,
  FileCheck2,
  Users,
  ArrowRight,
  Stethoscope,
  ShieldCheck,
  Cloud,
} from 'lucide-react';

const VALID_TABS: NavTab[] = ['dashboard', 'profile', 'diseases', 'prep', 'share', 'settings'];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [people, setPeople] = useState<Person[]>([]);
  const [activePersonId, setActivePersonId] = useState<string>('');
  const activePersonIdRef = useRef<string>('');
  const activeUserIdRef = useRef<string>('');

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomEntry[]>([]);
  const [vitalLogs, setVitalLogs] = useState<DailyVitalLog[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [summaries, setSummaries] = useState<AppointmentSummary[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [selectedDiseaseTabId, setSelectedDiseaseTabId] = useState<string | undefined>(undefined);

  // Modals State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [landingError, setLandingError] = useState<string | null>(null);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const [isSymptomModalOpen, setIsSymptomModalOpen] = useState(false);
  const [editingSymptom, setEditingSymptom] = useState<SymptomEntry | null>(null);
  const [preselectedConditionId, setPreselectedConditionId] = useState<string | undefined>(undefined);

  const [isVitalsModalOpen, setIsVitalsModalOpen] = useState(false);
  const [editingVitalLog, setEditingVitalLog] = useState<DailyVitalLog | null>(null);

  const [isConditionsModalOpen, setIsConditionsModalOpen] = useState(false);
  const [conditionModalInitialAdd, setConditionModalInitialAdd] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | null>(null);

  const [isPeopleModalOpen, setIsPeopleModalOpen] = useState(false);
  const [peopleModalMode, setPeopleModalMode] = useState<'list' | 'create' | 'edit'>('list');
  const [peopleModalTarget, setPeopleModalTarget] = useState<Person | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    activePersonIdRef.current = activePersonId;
  }, [activePersonId]);

  useEffect(() => {
    activeUserIdRef.current = user?.id || '';
  }, [user?.id]);

  useEffect(() => {
    if (!statusBanner) return;
    const timer = window.setTimeout(() => setStatusBanner(null), 6000);
    return () => window.clearTimeout(timer);
  }, [statusBanner]);

  const clearWorkspaceState = useCallback(() => {
    setUser(null);
    setPeople([]);
    setActivePersonId('');
    setConditions([]);
    setSymptoms([]);
    setVitalLogs([]);
    setAppointments([]);
    setSummaries([]);
    setCollaborators([]);
    setIsSymptomModalOpen(false);
    setIsVitalsModalOpen(false);
    setIsConditionsModalOpen(false);
    setIsPeopleModalOpen(false);
    setEditingSymptom(null);
    setEditingVitalLog(null);
    setEditingCondition(null);
    setPreselectedConditionId(undefined);
  }, []);

  const loadWorkspaceData = useCallback(async (personIdOverride?: string) => {
    try {
      const [{ people: loadedPeople }, { user: currentUser }] = await Promise.all([
        api.getPeople(),
        api.getMe(),
      ]);
      setUser(currentUser);
      activeUserIdRef.current = currentUser.id;

      // Restore persisted tab preference on initial load
      const savedTab = localDb.getActiveTabPreference(currentUser.id) as NavTab;
      if (savedTab && VALID_TABS.includes(savedTab)) {
        setCurrentTab(savedTab);
      }

      let resolvedPeople = loadedPeople;
      if (resolvedPeople.length === 0 && currentUser) {
        const { person: createdSelf } = await api.createPerson({
          name: currentUser.name || 'Self',
          relationship: 'Self',
          height_unit: 'cm',
          weight_unit: 'kg',
        });
        resolvedPeople = [createdSelf];
      }

      setPeople(resolvedPeople);

      if (resolvedPeople.length > 0) {
        const savedPersonPref = localDb.getActivePersonPreference(currentUser.id);
        const currentRefId = activePersonIdRef.current;
        const targetId =
          personIdOverride && resolvedPeople.some((p) => p.id === personIdOverride)
            ? personIdOverride
            : currentRefId && resolvedPeople.some((p) => p.id === currentRefId)
            ? currentRefId
            : savedPersonPref && resolvedPeople.some((p) => p.id === savedPersonPref)
            ? savedPersonPref
            : resolvedPeople[0].id;

        setActivePersonId(targetId);
        activePersonIdRef.current = targetId;
        localDb.setActivePersonPreference(currentUser.id, targetId);

        const [condRes, symRes, vitRes, apptRes, sumRes, colRes] = await Promise.all([
          api.getConditions(),
          api.getSymptoms({ personId: targetId }),
          api.getVitalLogs(targetId),
          api.getAppointments(targetId),
          api.getSummaries(targetId),
          api.getCollaborators(targetId),
        ]);

        setConditions(condRes.conditions);
        setSymptoms(symRes.symptoms);
        setVitalLogs(vitRes.vital_logs);
        setAppointments(apptRes.appointments);
        setSummaries(sumRes.summaries);
        setCollaborators(colRes.collaborators);
      }
    } catch {
      // session invalid or offline
    }
  }, []);

  useEffect(() => {
    let initialResolved = false;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        // Restore or activate Google Firebase Cloud DB session automatically on refresh
        if (api.isFirebaseMode() && activeUserIdRef.current === fbUser.uid) {
          setIsLoadingAuth(false);
          initialResolved = true;
          return;
        }
        api.setAuthMode('firebase');
        try {
          await loadWorkspaceData();
        } finally {
          initialResolved = true;
          setIsLoadingAuth(false);
        }
        return;
      }

      // No Firebase user signed in
      if (!initialResolved) {
        initialResolved = true;
        const token = api.getToken();
        if (token) {
          api.setAuthMode('server');
          try {
            await loadWorkspaceData();
          } finally {
            setIsLoadingAuth(false);
          }
        } else {
          setIsLoadingAuth(false);
        }
      } else if (api.getAuthMode() === 'firebase') {
        clearWorkspaceState();
      }
    });

    const handleUnauthorized = () => {
      clearWorkspaceState();
    };

    window.addEventListener('visitready:unauthorized', handleUnauthorized);
    return () => {
      unsubscribe();
      window.removeEventListener('visitready:unauthorized', handleUnauthorized);
    };
  }, [loadWorkspaceData, clearWorkspaceState]);

  const handleSelectPerson = async (personId: string) => {
    setActivePersonId(personId);
    activePersonIdRef.current = personId;
    if (user?.id) {
      localDb.setActivePersonPreference(user.id, personId);
    }
    const [condRes, symRes, vitRes, apptRes, sumRes, colRes] = await Promise.all([
      api.getConditions(),
      api.getSymptoms({ personId }),
      api.getVitalLogs(personId),
      api.getAppointments(personId),
      api.getSummaries(personId),
      api.getCollaborators(personId),
    ]);
    setConditions(condRes.conditions);
    setSymptoms(symRes.symptoms);
    setVitalLogs(vitRes.vital_logs);
    setAppointments(apptRes.appointments);
    setSummaries(sumRes.summaries);
    setCollaborators(colRes.collaborators);
  };

  const handleTabChange = (tab: NavTab) => {
    if (tab !== 'diseases') setSelectedDiseaseTabId(undefined);
    setCurrentTab(tab);
    if (user?.id) {
      localDb.setActiveTabPreference(user.id, tab);
    }
  };

  const activePerson = people.find((p) => p.id === activePersonId) || people[0];
  const activeConditions = conditions.filter((c) => c.person_id === activePerson?.id);

  // --- CRUD handlers ---
  const handleSaveSymptom = async (entries: Partial<SymptomEntry>[]) => {
    if (!entries || entries.length === 0) return;
    const firstTargetPersonId = entries[0].person_id || activePerson?.id || people[0]?.id;
    const savedEntries: SymptomEntry[] = [];

    if (editingSymptom) {
      const { symptom } = await api.updateSymptom(editingSymptom.id, entries[0]);
      savedEntries.push(symptom);
    } else {
      for (const entryData of entries) {
        const targetId = entryData.person_id || firstTargetPersonId;
        const { symptom } = await api.createSymptom({ ...entryData, person_id: targetId });
        savedEntries.push(symptom);
      }
    }

    const finalPersonId = savedEntries[0]?.person_id || firstTargetPersonId;
    if (finalPersonId && finalPersonId !== activePerson?.id) {
      await handleSelectPerson(finalPersonId);
    } else if (finalPersonId) {
      const { symptoms: updated } = await api.getSymptoms({ personId: finalPersonId });
      setSymptoms(updated);
    }
    const targetName =
      people.find((p) => p.id === finalPersonId)?.name || activePerson?.name || 'patient';
    setStatusBanner(
      editingSymptom
        ? `Updated symptom "${savedEntries[0].symptom_name}".`
        : savedEntries.length > 1
        ? `Logged ${savedEntries.length} detailed symptom entries for ${targetName}.`
        : `Symptom "${savedEntries[0].symptom_name}" logged for ${targetName}.`
    );
  };

  const handleDeleteSymptom = async (id: string) => {
    await api.deleteSymptom(id);
    if (activePerson) {
      const { symptoms: updated } = await api.getSymptoms({ personId: activePerson.id });
      setSymptoms(updated);
    }
  };

  const handleSaveVitalLog = async (entry: Partial<DailyVitalLog>, editingId?: string) => {
    const targetPersonId = entry.person_id || activePerson?.id || people[0]?.id;
    if (editingId) {
      await api.updateVitalLog(editingId, { ...entry, person_id: targetPersonId });
    } else {
      await api.createVitalLog({ ...entry, person_id: targetPersonId });
    }

    if (targetPersonId && targetPersonId !== activePerson?.id) {
      await handleSelectPerson(targetPersonId);
    } else if (targetPersonId) {
      const { vital_logs: updated } = await api.getVitalLogs(targetPersonId);
      setVitalLogs(updated);
    }

    const targetName =
      people.find((p) => p.id === targetPersonId)?.name || activePerson?.name || 'patient';
    setStatusBanner(
      editingId
        ? `Updated daily vitals reading for ${targetName}.`
        : `Saved daily vitals reading for ${targetName}.`
    );
  };

  const handleDeleteVitalLog = async (id: string) => {
    await api.deleteVitalLog(id);
    if (activePerson) {
      const { vital_logs: updated } = await api.getVitalLogs(activePerson.id);
      setVitalLogs(updated);
    }
    setStatusBanner('Daily vitals entry removed.');
  };

  const handleAddCondition = async (cond: Partial<Condition>): Promise<Condition> => {
    const targetPersonId = cond.person_id || activePerson?.id || people[0]?.id;
    const { condition: created } = await api.createCondition({
      ...cond,
      person_id: targetPersonId,
    });
    if (targetPersonId && targetPersonId !== activePerson?.id) {
      await handleSelectPerson(targetPersonId);
    } else {
      const { conditions: updated } = await api.getConditions();
      setConditions(updated);
    }
    const targetName =
      people.find((p) => p.id === (created.person_id || targetPersonId))?.name ||
      activePerson?.name ||
      'patient';
    setStatusBanner(`Disease "${created.name}" logged for ${targetName}.`);
    return created;
  };

  const handleUpdateCondition = async (id: string, cond: Partial<Condition>) => {
    const { condition: updatedItem } = await api.updateCondition(id, cond);
    const { conditions: updated } = await api.getConditions();
    setConditions(updated);
    setStatusBanner(`Updated disease "${updatedItem.name}".`);
  };

  const handleDeleteCondition = async (id: string) => {
    await api.deleteCondition(id);
    const { conditions: updated } = await api.getConditions();
    setConditions(updated);
  };

  const handleCreatePerson = async (p: Partial<Person>) => {
    const { person } = await api.createPerson(p);
    const { people: updatedPeople } = await api.getPeople();
    setPeople(updatedPeople);
    await handleSelectPerson(person.id);
  };

  const handleUpdatePerson = async (id: string, p: Partial<Person>) => {
    await api.updatePerson(id, p);
    const { people: updatedPeople } = await api.getPeople();
    setPeople(updatedPeople);
  };

  const handleDeletePerson = async (id: string) => {
    await api.deletePerson(id);
    const { people: updatedPeople } = await api.getPeople();
    setPeople(updatedPeople);
    if (updatedPeople.length > 0) {
      await handleSelectPerson(updatedPeople[0].id);
    }
  };

  const handleCreateAppointment = async (appt: Partial<Appointment>) => {
    await api.createAppointment(appt);
    if (activePerson) {
      const { appointments: updated } = await api.getAppointments(activePerson.id);
      setAppointments(updated);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    await api.deleteAppointment(id);
    if (activePerson) {
      const { appointments: updated } = await api.getAppointments(activePerson.id);
      setAppointments(updated);
    }
  };

  const handleCreateSummary = async (sum: Partial<AppointmentSummary>) => {
    await api.createSummary(sum);
    if (activePerson) {
      const { summaries: updated } = await api.getSummaries(activePerson.id);
      setSummaries(updated);
    }
  };

  const handleDeleteSummary = async (id: string) => {
    await api.deleteSummary(id);
    if (activePerson) {
      const { summaries: updated } = await api.getSummaries(activePerson.id);
      setSummaries(updated);
    }
  };

  const handleAddCollaborator = async (col: Partial<Collaborator>) => {
    await api.createCollaborator(col);
    if (activePerson) {
      const { collaborators: updated } = await api.getCollaborators(activePerson.id);
      setCollaborators(updated);
    }
  };

  const handleDeleteCollaborator = async (id: string) => {
    await api.deleteCollaborator(id);
    if (activePerson) {
      const { collaborators: updated } = await api.getCollaborators(activePerson.id);
      setCollaborators(updated);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    clearWorkspaceState();
    setStatusBanner(null);
    setCurrentTab('dashboard');
  };

  const handleQuickDemo = async () => {
    setLandingError(null);
    await api.loginDemo(false);
    await loadWorkspaceData();
  };

  const handleLandingGoogleSignIn = async () => {
    setLandingError(null);
    setIsGoogleSigningIn(true);
    try {
      await api.loginWithGooglePopup();
      await loadWorkspaceData();
    } catch (err: any) {
      setLandingError(err?.message || 'Google Sign-In could not complete. Please use Sign In or Create Account.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6faf7]">
        <div className="flex flex-col items-center gap-3">
          <span className="w-4 h-4 rounded-full bg-emerald-700 animate-pulse" />
          <p className="text-xs font-medium text-zinc-500">Loading VisitReady...</p>
        </div>
      </div>
    );
  }

  // --- LANDING VIEW FOR GUESTS ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f6faf7] text-zinc-900 flex flex-col">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-200/70">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-100" />
              <span className="font-semibold text-base tracking-tight text-zinc-900">
                Visit<span className="text-emerald-700">Ready</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-emerald-800 cursor-pointer"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('register');
                  setIsAuthModalOpen(true);
                }}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Get Started
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-12 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-2xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                Calm Personal &amp; Family OPD Health Journal
              </div>

              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 leading-tight">
                Walk into every doctor visit organized and ready.
              </h1>

              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-xl">
                Track diseases, daily vitals (BP, sugar, SpO2), and symptoms for yourself and your family—safely stored in Cloud Firestore and persistent SQLite storage across refreshes.
              </p>

              {landingError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {landingError}
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleLandingGoogleSignIn}
                  disabled={isGoogleSigningIn}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-60"
                >
                  <Cloud className="w-4 h-4" />
                  {isGoogleSigningIn ? 'Signing in...' : 'Continue with Google (Cloud Sync)'}
                </button>
                <button
                  type="button"
                  onClick={handleQuickDemo}
                  className="px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                >
                  Try Demo (Priya Sharma, 42)
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthModalMode('register');
                    setIsAuthModalOpen(true);
                  }}
                  className="px-5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  Create Free Account
                </button>
              </div>
            </div>

            {/* Clean Visual Summary Card Preview */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
                <div>
                  <span className="text-2xs uppercase tracking-wider font-bold text-emerald-700">
                    Sample OPD Card
                  </span>
                  <h2 className="text-sm font-bold text-zinc-900">Priya Sharma • 42 yrs</h2>
                </div>
                <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  B+ • 62 kg
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                  <span className="font-semibold text-zinc-900">Migraines / Headaches</span>
                  <span className="text-2xs text-emerald-800 font-medium">3 logged entries</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between">
                  <span className="font-semibold text-zinc-900">Hypothyroidism</span>
                  <span className="text-2xs text-zinc-500">Thyronorm 50mcg</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between">
                  <span className="font-semibold text-zinc-900">Latest BP &amp; Sugar</span>
                  <span className="text-2xs text-emerald-700 font-medium">118/78 mmHg • 102 mg/dL</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-emerald-200/80 p-5 space-y-2">
              <Activity className="w-5 h-5 text-emerald-700" />
              <h3 className="text-sm font-bold text-zinc-900">Daily Vitals &amp; Symptom Logs</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Track standalone BP, sugar, SpO2 multiple times a day or group detailed symptoms under chronic conditions.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200/80 p-5 space-y-2">
              <FileCheck2 className="w-5 h-5 text-emerald-700" />
              <h3 className="text-sm font-bold text-zinc-900">One-Click OPD Summary</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Preview a complete single-page report and export as PDF, PNG image, or copy for WhatsApp.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200/80 p-5 space-y-2">
              <Users className="w-5 h-5 text-emerald-700" />
              <h3 className="text-sm font-bold text-zinc-900">Share With Doctors &amp; Family</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Keep care circle contacts organized across doctors, family members, and trusted friends.
              </p>
            </div>
          </div>

          <EmergencyBanner />
        </main>

        <footer className="bg-white border-t border-emerald-200/60 py-4 text-center text-2xs text-zinc-500">
          <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Stethoscope className="w-3.5 h-3.5 text-emerald-700" />
              VisitReady — Personal Health &amp; Wellness Recordkeeping
            </span>
            <span>Medical Emergencies (India): Call 112 / 108</span>
          </div>
        </footer>

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => loadWorkspaceData()}
          initialMode={authModalMode}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6faf7] text-zinc-900 pb-20 md:pb-10">
      <Navbar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        user={user}
        activePerson={activePerson || null}
        people={people}
        onSelectPerson={handleSelectPerson}
        onOpenPeopleModal={() => {
          setPeopleModalMode('list');
          setPeopleModalTarget(null);
          setIsPeopleModalOpen(true);
        }}
        onOpenVitalsModal={() => {
          setEditingVitalLog(null);
          setIsVitalsModalOpen(true);
        }}
        onOpenLogModal={() => {
          setEditingSymptom(null);
          setPreselectedConditionId(undefined);
          setIsSymptomModalOpen(true);
        }}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        {statusBanner && (
          <div className="mb-4 max-w-4xl mx-auto px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-900">
            <span className="font-medium">{statusBanner}</span>
            <div className="flex items-center gap-3 shrink-0">
              {currentTab !== 'diseases' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDiseaseTabId(undefined);
                    handleTabChange('diseases');
                    setStatusBanner(null);
                  }}
                  className="text-emerald-800 font-semibold hover:underline cursor-pointer"
                >
                  Open Diseases &amp; Symptoms →
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {currentTab === 'dashboard' && activePerson && (
          <DashboardView
            activePerson={activePerson}
            conditions={activeConditions}
            symptoms={symptoms}
            vitalLogs={vitalLogs}
            appointments={appointments}
            onOpenLogModal={(entry) => {
              setEditingSymptom(entry || null);
              setPreselectedConditionId(undefined);
              setIsSymptomModalOpen(true);
            }}
            onOpenVitalsModal={(entry) => {
              setEditingVitalLog(entry || null);
              setIsVitalsModalOpen(true);
            }}
            onDeleteVitalLog={handleDeleteVitalLog}
            onOpenAddDisease={() => {
              setEditingCondition(null);
              setConditionModalInitialAdd(true);
              setIsConditionsModalOpen(true);
            }}
            onOpenCreatePerson={() => {
              setPeopleModalMode('create');
              setPeopleModalTarget(null);
              setIsPeopleModalOpen(true);
            }}
            onOpenAppointmentModal={() => handleTabChange('prep')}
            onOpenConditionsModal={() => {
              setEditingCondition(null);
              setConditionModalInitialAdd(false);
              setIsConditionsModalOpen(true);
            }}
            onOpenPeopleModal={() => {
              setPeopleModalMode('list');
              setPeopleModalTarget(null);
              setIsPeopleModalOpen(true);
            }}
            onNavigateToPrep={() => handleTabChange('prep')}
            onNavigateToHistory={() => {
              setSelectedDiseaseTabId(undefined);
              handleTabChange('diseases');
            }}
            onNavigateToDiseases={(conditionId) => {
              setSelectedDiseaseTabId(conditionId);
              handleTabChange('diseases');
            }}
            onNavigateToShare={() => handleTabChange('share')}
          />
        )}

        {currentTab === 'profile' && activePerson && (
          <PatientProfileView
            activePerson={activePerson}
            people={people}
            conditions={activeConditions}
            symptoms={symptoms}
            vitalLogs={vitalLogs}
            onSelectPerson={handleSelectPerson}
            onOpenCreateProfile={() => {
              setPeopleModalMode('create');
              setPeopleModalTarget(null);
              setIsPeopleModalOpen(true);
            }}
            onOpenEditProfile={(p) => {
              setPeopleModalMode('edit');
              setPeopleModalTarget(p);
              setIsPeopleModalOpen(true);
            }}
            onDeletePerson={handleDeletePerson}
            onNavigateToDiseases={(conditionId) => {
              setSelectedDiseaseTabId(conditionId);
              handleTabChange('diseases');
            }}
            onOpenLogModal={() => {
              setEditingSymptom(null);
              setPreselectedConditionId(undefined);
              setIsSymptomModalOpen(true);
            }}
            onOpenVitalsModal={(entry) => {
              setEditingVitalLog(entry || null);
              setIsVitalsModalOpen(true);
            }}
            onDeleteVitalLog={handleDeleteVitalLog}
            onOpenAddDisease={() => {
              setEditingCondition(null);
              setConditionModalInitialAdd(true);
              setIsConditionsModalOpen(true);
            }}
          />
        )}

        {currentTab === 'diseases' && activePerson && (
          <DiseaseView
            activePerson={activePerson}
            conditions={activeConditions}
            symptoms={symptoms}
            initialConditionId={selectedDiseaseTabId}
            onOpenLogModal={(entry, preselectedCondId) => {
              setEditingSymptom(entry || null);
              setPreselectedConditionId(preselectedCondId);
              setIsSymptomModalOpen(true);
            }}
            onOpenConditionsModal={() => {
              setEditingCondition(null);
              setConditionModalInitialAdd(true);
              setIsConditionsModalOpen(true);
            }}
            onEditCondition={(cond) => {
              setEditingCondition(cond);
              setConditionModalInitialAdd(true);
              setIsConditionsModalOpen(true);
            }}
            onDeleteSymptom={handleDeleteSymptom}
            onDeleteCondition={handleDeleteCondition}
          />
        )}

        {currentTab === 'prep' && activePerson && (
          <AppointmentPrepView
            activePerson={activePerson}
            conditions={activeConditions}
            symptoms={symptoms}
            vitalLogs={vitalLogs}
            appointments={appointments}
            summaries={summaries}
            onCreateAppointment={handleCreateAppointment}
            onDeleteAppointment={handleDeleteAppointment}
            onCreateSummary={handleCreateSummary}
            onDeleteSummary={handleDeleteSummary}
          />
        )}

        {currentTab === 'share' && activePerson && (
          <CollaborationView
            activePerson={activePerson}
            people={people}
            conditions={activeConditions}
            symptoms={symptoms}
            appointments={appointments}
            collaborators={collaborators}
            onAddCollaborator={handleAddCollaborator}
            onDeleteCollaborator={handleDeleteCollaborator}
          />
        )}

        {currentTab === 'settings' && activePerson && (
          <SettingsView
            user={user}
            activePerson={activePerson}
            onUpdateUser={setUser}
            onLogout={handleLogout}
            onNavigateToShare={() => handleTabChange('share')}
          />
        )}
      </main>

      {/* Modals */}
      {activePerson && (
        <>
          <DailyVitalsModal
            isOpen={isVitalsModalOpen}
            onClose={() => {
              setIsVitalsModalOpen(false);
              setEditingVitalLog(null);
            }}
            onSave={handleSaveVitalLog}
            editingEntry={editingVitalLog}
            personId={activePerson.id}
            people={people}
          />

          <SymptomEntryModal
            isOpen={isSymptomModalOpen}
            onClose={() => {
              setIsSymptomModalOpen(false);
              setEditingSymptom(null);
              setPreselectedConditionId(undefined);
            }}
            onSave={handleSaveSymptom}
            editingEntry={editingSymptom}
            personId={activePerson.id}
            people={people}
            conditions={conditions}
            preselectedConditionId={preselectedConditionId}
          />

          <ConditionModal
            isOpen={isConditionsModalOpen}
            onClose={() => {
              setIsConditionsModalOpen(false);
              setConditionModalInitialAdd(false);
              setEditingCondition(null);
            }}
            activePerson={activePerson}
            people={people}
            conditions={conditions}
            initialAdding={conditionModalInitialAdd}
            initialEditingCondition={editingCondition}
            onAddCondition={handleAddCondition}
            onUpdateCondition={handleUpdateCondition}
            onDeleteCondition={handleDeleteCondition}
            onConditionCreated={(created) => {
              setEditingSymptom(null);
              setPreselectedConditionId(created.id);
              setIsSymptomModalOpen(true);
            }}
          />

          <PersonModal
            isOpen={isPeopleModalOpen}
            onClose={() => setIsPeopleModalOpen(false)}
            people={people}
            activePersonId={activePerson.id}
            initialMode={peopleModalMode}
            editingTarget={peopleModalTarget}
            onSelectPerson={handleSelectPerson}
            onCreatePerson={handleCreatePerson}
            onUpdatePerson={handleUpdatePerson}
            onDeletePerson={handleDeletePerson}
          />
        </>
      )}
    </div>
  );
}

export default App;
