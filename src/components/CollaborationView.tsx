/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Person,
  Condition,
  SymptomEntry,
  Appointment,
  Collaborator,
  CollaboratorCategory,
} from '../types/index.ts';
import {
  Users,
  Stethoscope,
  UserPlus,
  HeartHandshake,
  Trash2,
  Copy,
  Check,
  FileText,
  Phone,
  Mail,
  X,
  Share2,
} from 'lucide-react';
import { ClinicalDocumentModal } from './ClinicalDocumentModal.tsx';

interface CollaborationViewProps {
  activePerson: Person;
  people: Person[];
  conditions: Condition[];
  symptoms: SymptomEntry[];
  appointments: Appointment[];
  collaborators: Collaborator[];
  onAddCollaborator: (col: Partial<Collaborator>) => Promise<void>;
  onDeleteCollaborator: (id: string) => Promise<void>;
}

const RELATIONSHIP_DETAIL_OPTIONS: Record<CollaboratorCategory, string[]> = {
  Family: [
    'Spouse',
    'Partner',
    'Mother',
    'Father',
    'Daughter',
    'Son',
    'Sister',
    'Brother',
    'Grandmother',
    'Grandfather',
    'Grandchild',
    'Mother-in-law',
    'Father-in-law',
    'Son-in-law',
    'Daughter-in-law',
    'Uncle / Aunt',
    'Nephew / Niece',
    'Cousin / Extended Relative',
    'Family Caregiver',
    'Other',
  ],
  Doctor: [
    'Primary Family Physician',
    'Specialist Doctor',
    'Surgeon',
    'Pediatrician',
    'Gynecologist / Obstetrician',
    'Cardiologist / Diabetologist',
    'Ayurveda / Homeopathy Doctor',
    'Physiotherapist / Rehab',
    'Hospital / Clinic Coordinator',
    'Other',
  ],
  Friend: [
    'Close Friend',
    'Neighbour',
    'Colleague',
    'Emergency Companion',
    'Trusted Helper',
    'Other',
  ],
};

export const CollaborationView: React.FC<CollaborationViewProps> = ({
  activePerson,
  people,
  conditions,
  symptoms,
  appointments,
  collaborators,
  onAddCollaborator,
  onDeleteCollaborator,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'All' | CollaboratorCategory>('All');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CollaboratorCategory>('Doctor');
  const [relationshipDetail, setRelationshipDetail] = useState<string>(
    RELATIONSHIP_DETAIL_OPTIONS.Doctor[0]
  );
  const [customRelationship, setCustomRelationship] = useState<string>('');
  const [role, setRole] = useState<Collaborator['role']>('Doctor / Care Team');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [personId, setPersonId] = useState(activePerson.id);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy & delete feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const normalizeCategory = (c: Collaborator): CollaboratorCategory => {
    if (c.category) return c.category;
    if (c.role === 'Doctor / Care Team') return 'Doctor';
    return 'Family';
  };

  const counts = useMemo(() => {
    const res = { All: collaborators.length, Doctor: 0, Family: 0, Friend: 0 };
    collaborators.forEach((c) => {
      const cat = normalizeCategory(c);
      res[cat] += 1;
    });
    return res;
  }, [collaborators]);

  const filteredCollaborators = useMemo(() => {
    if (categoryFilter === 'All') return collaborators;
    return collaborators.filter((c) => normalizeCategory(c) === categoryFilter);
  }, [collaborators, categoryFilter]);

  const openInviteWithCategory = (cat: CollaboratorCategory) => {
    setCategory(cat);
    setRelationshipDetail(RELATIONSHIP_DETAIL_OPTIONS[cat][0]);
    setCustomRelationship('');
    if (cat === 'Doctor') setRole('Doctor / Care Team');
    else if (cat === 'Family') setRole('Editor');
    else setRole('Viewer');
    setPersonId(activePerson.id);
    setName('');
    setEmail('');
    setPhone('');
    setNotes('');
    setError(null);
    setShowInviteModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a name.');
      return;
    }
    const finalRelationshipDetail =
      relationshipDetail === 'Other' ? customRelationship.trim() : relationshipDetail;
    if (relationshipDetail === 'Other' && !finalRelationshipDetail) {
      setError('Please specify the custom relationship with the patient.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError('Please provide an email address or WhatsApp / mobile number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onAddCollaborator({
        person_id: personId,
        name: name.trim(),
        category,
        relationship_detail: finalRelationshipDetail,
        role,
        email: email.trim(),
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setShowInviteModal(false);
    } catch (err: any) {
      setError(err.message || 'Could not add collaborator.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShareMessage = (col: Collaborator) => {
    const targetPerson = people.find((p) => p.id === col.person_id) || activePerson;
    const cat = normalizeCategory(col);
    const lines = [
      `VisitReady Health Record Share (${cat}${
        col.relationship_detail ? ` · ${col.relationship_detail}` : ''
      })`,
      `Shared with: ${col.name} (${col.role})`,
      `Patient Profile: ${targetPerson.name} (${targetPerson.relationship})`,
      `Tracked Diseases: ${conditions.map((c) => c.name).join(', ') || 'None listed'}`,
      `Recent Symptom Logs: ${symptoms.length} entries recorded`,
      `Access Passcode: ${col.access_code}`,
      ``,
      `Note: Personal health recordkeeping summary via VisitReady.`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedId(col.id);
    setTimeout(() => setCopiedId(null), 2200);
  };

  const handleCopyQuickWhatsAppSummary = () => {
    const recent = symptoms.slice(0, 5);
    const lines: string[] = [
      `*Health & Symptom Update — ${activePerson.name}*`,
      `Weight: ${activePerson.weight ? `${activePerson.weight} ${activePerson.weight_unit || 'kg'}` : '—'} | BP Baseline: ${activePerson.baseline_bp || '—'}`,
    ];
    if (activePerson.allergies) lines.push(`Allergies: ${activePerson.allergies}`);
    if (conditions.length > 0) {
      lines.push(`Conditions: ${conditions.map((c) => c.name).join(', ')}`);
    }
    lines.push('');
    lines.push(`Recent Symptoms (${recent.length}):`);
    recent.forEach((s, idx) => {
      lines.push(
        `${idx + 1}. ${s.symptom_name} (Severity ${s.severity_0_to_10}/10 · ${new Date(s.start_datetime).toLocaleDateString('en-IN')})`
      );
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2400);
  };

  const nextAppointment = appointments.find((a) => a.status === 'upcoming') || null;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-14 text-zinc-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-zinc-900">
            Collaborate &amp; Share Care
          </h1>
          <p className="text-3xs text-zinc-500 mt-0.5">
            Share health records, OPD summaries, and access codes with Doctors, Family, and trusted Friends
          </p>
        </div>

        <button
          type="button"
          onClick={() => openInviteWithCategory('Doctor')}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-2xs"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Doctor / Family / Friend</span>
        </button>
      </div>

      {/* Quick Share Bar: One-Click Document Preview & WhatsApp Update */}
      <div className="bg-white rounded-xl p-3.5 border border-emerald-200/70 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-emerald-700" />
            <span className="text-xs font-semibold text-zinc-900">
              Instant OPD &amp; Family Share for {activePerson.name}
            </span>
          </div>
          <p className="text-2xs text-zinc-500">
            Generate a single-page Document / Image for your doctor or copy a quick WhatsApp care update for family.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleCopyQuickWhatsAppSummary}
            className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-md text-2xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            {copiedSummary ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copied Update</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-emerald-600" />
                <span>Copy WhatsApp Summary</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowDocModal(true)}
            className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-2xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Preview Doctor Document / Image</span>
          </button>
        </div>
      </div>

      {/* 3 Dedicated Quick-Add Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => openInviteWithCategory('Doctor')}
          className="p-3 rounded-xl bg-white border border-emerald-200/70 hover:border-emerald-400 hover:bg-emerald-50/20 text-left transition-colors cursor-pointer space-y-1 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
              <Stethoscope className="w-3.5 h-3.5 text-emerald-700" />
              <span>Doctors &amp; Clinics</span>
            </span>
            <span className="text-3xs text-emerald-700 font-medium">{counts.Doctor} added</span>
          </div>
          <p className="text-3xs text-zinc-500">
            Share OPD symptom history and reports with consulting physicians.
          </p>
        </button>

        <button
          type="button"
          onClick={() => openInviteWithCategory('Family')}
          className="p-3 rounded-xl bg-white border border-emerald-200/70 hover:border-emerald-400 hover:bg-emerald-50/20 text-left transition-colors cursor-pointer space-y-1 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
              <Users className="w-3.5 h-3.5 text-emerald-700" />
              <span>Family Caregivers</span>
            </span>
            <span className="text-3xs text-emerald-700 font-medium">{counts.Family} added</span>
          </div>
          <p className="text-3xs text-zinc-500">
            Let spouse, parents, or children view and log health updates together.
          </p>
        </button>

        <button
          type="button"
          onClick={() => openInviteWithCategory('Friend')}
          className="p-3 rounded-xl bg-white border border-emerald-200/70 hover:border-emerald-400 hover:bg-emerald-50/20 text-left transition-colors cursor-pointer space-y-1 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
              <HeartHandshake className="w-3.5 h-3.5 text-emerald-700" />
              <span>Trusted Friends</span>
            </span>
            <span className="text-3xs text-emerald-700 font-medium">{counts.Friend} added</span>
          </div>
          <p className="text-3xs text-zinc-500">
            Share view-only access with a trusted friend helping with clinic visits.
          </p>
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-emerald-200/60">
        {(['All', 'Doctor', 'Family', 'Friend'] as const).map((tab) => {
          const isSelected = categoryFilter === tab;
          const label =
            tab === 'All'
              ? 'All Shared'
              : tab === 'Doctor'
                ? 'Doctors'
                : tab === 'Family'
                  ? 'Family'
                  : 'Friends';
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setCategoryFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-2xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white border border-emerald-200/80 text-zinc-700 hover:bg-emerald-50/50'
              }`}
            >
              <span>{label}</span>
              <span
                className={`text-3xs px-1.5 py-0.2 rounded ${
                  isSelected ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Shared Circle List */}
      <div className="bg-white rounded-lg border border-zinc-200/80 divide-y divide-zinc-100">
        {filteredCollaborators.length === 0 ? (
          <div className="text-center py-10 px-4 space-y-2">
            <p className="text-2xs text-zinc-500">
              No {categoryFilter === 'All' ? 'collaborators' : categoryFilter.toLowerCase() + ' contacts'} added for {activePerson.name} yet.
            </p>
            <button
              type="button"
              onClick={() =>
                openInviteWithCategory(categoryFilter === 'All' ? 'Doctor' : categoryFilter)
              }
              className="text-2xs font-medium text-zinc-900 underline cursor-pointer"
            >
              + Share with {categoryFilter === 'All' ? 'Doctor, Family, or Friend' : categoryFilter}
            </button>
          </div>
        ) : (
          filteredCollaborators.map((col) => {
            const cat = normalizeCategory(col);
            const matchedPerson = people.find((p) => p.id === col.person_id);
            const isCopied = copiedId === col.id;
            return (
              <div
                key={col.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-900">{col.name}</span>
                    <span className="text-3xs px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 font-medium">
                      {cat}
                    </span>
                    {col.relationship_detail && (
                      <span className="text-3xs px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-medium">
                        {col.relationship_detail}
                      </span>
                    )}
                    <span className="text-3xs text-zinc-500">· {col.role}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-zinc-500">
                    {col.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3 text-zinc-400" />
                        {col.phone}
                      </span>
                    )}
                    {col.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3 text-zinc-400" />
                        {col.email}
                      </span>
                    )}
                    <span>Profile: {matchedPerson?.name || activePerson.name}</span>
                    <span>Passcode: {col.access_code}</span>
                  </div>

                  {col.notes && <p className="text-3xs text-zinc-500 italic">{col.notes}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleCopyShareMessage(col)}
                    className="px-2.5 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-50 text-3xs font-medium text-zinc-700 flex items-center gap-1 cursor-pointer"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-zinc-400" />
                        <span>Copy Invite</span>
                      </>
                    )}
                  </button>

                  {confirmDeleteId === col.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteCollaborator(col.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2 py-1 rounded bg-rose-600 text-white text-3xs font-medium cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 rounded text-3xs text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(col.id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                      title="Revoke access"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Collaborator Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-zinc-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Share Records &amp; Collaborate</h3>
                <p className="text-3xs text-zinc-500">Add a doctor, family caregiver, or trusted friend</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              {error && (
                <div className="p-2 rounded bg-rose-50 border border-rose-200 text-3xs text-rose-700">
                  {error}
                </div>
              )}

              {/* Category selector pills */}
              <div>
                <label className="block text-2xs font-medium text-zinc-600 mb-1">
                  Relationship Group
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['Doctor', 'Family', 'Friend'] as CollaboratorCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategory(cat);
                        setRelationshipDetail(RELATIONSHIP_DETAIL_OPTIONS[cat][0]);
                        setCustomRelationship('');
                        if (cat === 'Doctor') setRole('Doctor / Care Team');
                        else if (cat === 'Family') setRole('Editor');
                        else setRole('Viewer');
                      }}
                      className={`py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                        category === cat
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-2xs font-medium text-zinc-600 mb-1">
                  {category === 'Family'
                    ? 'Family Member Relationship'
                    : category === 'Doctor'
                    ? 'Doctor / Specialist Role'
                    : 'Friend / Companion Relationship'}
                </label>
                <select
                  aria-label="Member Relationship"
                  value={relationshipDetail}
                  onChange={(e) => {
                    setRelationshipDetail(e.target.value);
                    if (e.target.value !== 'Other') {
                      setCustomRelationship('');
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white focus:outline-hidden focus:border-emerald-600"
                >
                  {RELATIONSHIP_DETAIL_OPTIONS[category].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {relationshipDetail === 'Other' && (
                  <div className="mt-2">
                    <label className="block text-2xs font-medium text-zinc-600 mb-1">
                      Specify Relationship <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      aria-label="Custom Relationship"
                      value={customRelationship}
                      onChange={(e) => setCustomRelationship(e.target.value)}
                      placeholder={
                        category === 'Family'
                          ? 'e.g. Cousin Brother, Maternal Uncle'
                          : category === 'Doctor'
                          ? 'e.g. Neurologist, Nephrologist'
                          : 'e.g. Caretaker, Building Secretary'
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-2xs font-medium text-zinc-600 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    category === 'Doctor'
                      ? 'e.g. Dr. Ananya Kulkarni'
                      : category === 'Family'
                        ? 'e.g. Aarav Sharma (Spouse)'
                        : 'e.g. Neha Verma'
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-hidden focus:border-zinc-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-2xs font-medium text-zinc-600 mb-1">
                    WhatsApp / Mobile (+91)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 98450 12345"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-hidden focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-medium text-zinc-600 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. contact@example.in"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-hidden focus:border-zinc-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-2xs font-medium text-zinc-600 mb-1">
                    Permission Level
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Collaborator['role'])}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white"
                  >
                    <option value="Doctor / Care Team">Doctor / Care Team</option>
                    <option value="Editor">Editor (Can Log)</option>
                    <option value="Viewer">Viewer (Read Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-medium text-zinc-600 mb-1">
                    Patient Profile
                  </label>
                  <select
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white"
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-medium text-zinc-600 mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Consulting OPD doctor / Family emergency contact"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-hidden focus:border-zinc-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer"
                >
                  {loading ? 'Sharing...' : 'Create Access Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clinical Document / Image Modal for Doctor & Family Sharing */}
      <ClinicalDocumentModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        patient={activePerson}
        conditions={conditions}
        symptoms={symptoms}
        appointment={nextAppointment}
      />
    </div>
  );
};
