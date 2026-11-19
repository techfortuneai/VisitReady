/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Person, Condition, SymptomEntry, Appointment, DailyVitalLog } from '../types/index.ts';
import {
  generateAppointmentSummaryPdf,
  PrintContentOptions,
  DEFAULT_PRINT_OPTIONS,
} from '../utils/pdfExport.ts';
import { getBloodSugarReadings, formatBloodSugarContext } from '../utils/vitals.ts';
import {
  X,
  Printer,
  Download,
  Image as ImageIcon,
  Copy,
  Check,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react';

interface ClinicalDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Person;
  conditions: Condition[];
  symptoms: SymptomEntry[];
  vitalLogs?: DailyVitalLog[];
  appointment?: Appointment;
  questions?: string[];
  visitNotes?: string;
  selectedDiseaseId?: string;
  onChangeDiseaseId?: (id: string) => void;
  printOptions?: PrintContentOptions;
  onChangePrintOptions?: (opts: PrintContentOptions) => void;
}

const PRINT_OPTION_LABELS: { key: keyof PrintContentOptions; label: string }[] = [
  { key: 'includePatientHeader', label: 'Patient Header' },
  { key: 'includeVitalsSnapshot', label: 'Vitals & KPI Cards' },
  { key: 'includeAllergiesAndMeds', label: 'Allergies, Meds & History' },
  { key: 'includeDiseaseTreatments', label: 'Disease & Doctor Plans' },
  { key: 'includeSymptomLog', label: 'Symptom Log Table' },
  { key: 'includeSymptomVitals', label: 'Vitals in Table' },
  { key: 'includeSymptomNotes', label: 'Triggers & Notes' },
  { key: 'includeQuestions', label: 'Doctor Questions' },
  { key: 'includeConsultationPad', label: 'Consultation Write-In Pad' },
];

export const ClinicalDocumentModal: React.FC<ClinicalDocumentModalProps> = ({
  isOpen,
  onClose,
  patient,
  conditions,
  symptoms,
  vitalLogs = [],
  appointment,
  questions = [],
  visitNotes = '',
  selectedDiseaseId: controlledDiseaseId,
  onChangeDiseaseId,
  printOptions: controlledPrintOptions,
  onChangePrintOptions,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [imageNotice, setImageNotice] = useState('');
  const [showCustomizer, setShowCustomizer] = useState(true);

  const [internalDiseaseId, setInternalDiseaseId] = useState<string>(
    controlledDiseaseId || conditions[0]?.id || 'general'
  );
  const [internalOptions, setInternalOptions] = useState<PrintContentOptions>(
    controlledPrintOptions || DEFAULT_PRINT_OPTIONS
  );

  useEffect(() => {
    if (controlledDiseaseId) {
      setInternalDiseaseId(controlledDiseaseId);
    } else if (
      conditions.length > 0 &&
      internalDiseaseId !== 'all' &&
      internalDiseaseId !== 'general' &&
      !conditions.some((c) => c.id === internalDiseaseId)
    ) {
      setInternalDiseaseId(conditions[0].id);
    } else if (conditions.length === 0 && internalDiseaseId !== 'all') {
      setInternalDiseaseId('general');
    }
  }, [controlledDiseaseId, conditions]);

  useEffect(() => {
    if (controlledPrintOptions) {
      setInternalOptions(controlledPrintOptions);
    }
  }, [controlledPrintOptions]);

  const activeDiseaseId = controlledDiseaseId || internalDiseaseId;
  const activeOptions = controlledPrintOptions || internalOptions;
  const isAllDiseases = activeDiseaseId === 'all';

  const setDisease = (id: string) => {
    setInternalDiseaseId(id);
    onChangeDiseaseId?.(id);
  };

  const toggleOption = (key: keyof PrintContentOptions) => {
    const next = { ...activeOptions, [key]: !activeOptions[key] };
    setInternalOptions(next);
    onChangePrintOptions?.(next);
  };

  const selectedCondition = useMemo(
    () =>
      activeDiseaseId === 'general' || activeDiseaseId === 'all'
        ? null
        : conditions.find((c) => c.id === activeDiseaseId) || null,
    [conditions, activeDiseaseId]
  );

  const reportConditions = useMemo(() => {
    if (selectedCondition) return [selectedCondition];
    if (isAllDiseases) return conditions;
    return [];
  }, [selectedCondition, isAllDiseases, conditions]);

  const unlinkedSymptomsCount = useMemo(
    () => symptoms.filter((s) => !s.condition_ids || s.condition_ids.length === 0).length,
    [symptoms]
  );

  const filteredSymptoms = useMemo(() => {
    if (isAllDiseases) return symptoms;
    if (activeDiseaseId === 'general') {
      return symptoms.filter((s) => !s.condition_ids || s.condition_ids.length === 0);
    }
    return symptoms.filter((s) => s.condition_ids?.includes(activeDiseaseId));
  }, [symptoms, activeDiseaseId, isAllDiseases]);

  const metrics = useMemo(() => {
    const birthAge = (() => {
      if (!patient.birth_date) return null;
      const birth = new Date(patient.birth_date);
      if (Number.isNaN(birth.getTime())) return null;
      return Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    })();

    const bmi = (() => {
      if (!patient.weight || !patient.height) return null;
      const weightKg = patient.weight_unit === 'lbs' ? patient.weight * 0.453592 : patient.weight;
      const hStr = patient.height.toLowerCase();
      let heightM: number | null = null;
      const ftMatch = hStr.match(/(\d+)\s*(?:ft|')(?:\s*(\d+)\s*(?:in|"))?/);
      if (ftMatch) {
        const feet = parseInt(ftMatch[1], 10);
        const inches = ftMatch[2] ? parseInt(ftMatch[2], 10) : 0;
        heightM = (feet * 12 + inches) * 0.0254;
      } else {
        const cmMatch = hStr.match(/(\d+(?:\.\d+)?)\s*(?:cm)?/);
        if (cmMatch) heightM = parseFloat(cmMatch[1]) / 100;
      }
      if (!heightM || heightM <= 0) return null;
      return (weightKg / (heightM * heightM)).toFixed(1);
    })();

    const combinedVitalsSources = [
      ...vitalLogs.map((v) => ({ ts: new Date(v.recorded_at).getTime(), vitals: v })),
      ...filteredSymptoms
        .filter((s) => s.vitals)
        .map((s) => ({ ts: new Date(s.start_datetime).getTime(), vitals: s.vitals! })),
    ].sort((a, b) => b.ts - a.ts);

    const latestBp = combinedVitalsSources.find(
      (v) => v.vitals.blood_pressure_systolic && v.vitals.blood_pressure_diastolic
    );
    const latestPulse = combinedVitalsSources.find((v) => v.vitals.pulse);
    const latestSugarEntry = combinedVitalsSources.find(
      (v) => getBloodSugarReadings(v.vitals).length > 0
    );
    const latestSugarReadings = getBloodSugarReadings(latestSugarEntry?.vitals);
    const latestSpo2 = combinedVitalsSources.find((v) => v.vitals.oxygen_spo2);
    const peakSeverity =
      filteredSymptoms.length > 0
        ? Math.max(...filteredSymptoms.map((s) => s.severity_0_to_10))
        : null;
    const ongoingCount = filteredSymptoms.filter((s) => s.ongoing).length;

    const medicationList = patient.current_medications
      ? patient.current_medications
          .split(/[,;\n]+/)
          .map((m) => m.trim())
          .filter(Boolean)
      : [];

    const allergyList = patient.allergies
      ? patient.allergies
          .split(/[,;\n]+/)
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    return {
      age: birthAge,
      bmi,
      latestBp,
      latestPulse,
      latestSugarReadings,
      latestSpo2,
      peakSeverity,
      ongoingCount,
      medicationList,
      allergyList,
    };
  }, [patient, filteredSymptoms, vitalLogs]);

  if (!isOpen) return null;

  const getSeverityAccent = (sev: number) => {
    if (sev >= 7) return { bar: 'bg-rose-600', text: 'text-rose-700' };
    if (sev >= 4) return { bar: 'bg-amber-500', text: 'text-amber-700' };
    return { bar: 'bg-emerald-600', text: 'text-emerald-700' };
  };

  const diseaseSlug = isAllDiseases
    ? 'All-Diseases-Health-History'
    : selectedCondition
    ? selectedCondition.name.replace(/\s+/g, '-')
    : 'General-Report';

  const handleDownloadPdf = () => {
    const start =
      filteredSymptoms.length > 0
        ? filteredSymptoms[filteredSymptoms.length - 1].start_datetime
        : new Date().toISOString();
    const end =
      filteredSymptoms.length > 0 ? filteredSymptoms[0].start_datetime : new Date().toISOString();

    const doc = generateAppointmentSummaryPdf({
      patient,
      conditions: reportConditions,
      selectedCondition,
      appointment,
      title: isAllDiseases
        ? `Complete Health History Report - ${patient.name}`
        : selectedCondition
        ? `${selectedCondition.name} OPD Report - ${patient.name}`
        : `OPD Clinical Report - ${patient.name}`,
      dateRange: { start, end },
      symptoms: filteredSymptoms,
      vitalLogs,
      questions,
      visitNotes,
      generatedAt: new Date().toISOString(),
      options: activeOptions,
    });
    doc.save(`VisitReady-${patient.name.replace(/\s+/g, '-')}-${diseaseSlug}.pdf`);
  };

  const handleDownloadImage = () => {
    const canvas = document.createElement('canvas');
    const width = 1080;
    const condCardsCount =
      activeOptions.includeDiseaseTreatments ? Math.min(6, reportConditions.length) : 0;
    const rowCount = activeOptions.includeSymptomLog ? Math.min(14, filteredSymptoms.length) : 0;
    const height = Math.max(
      820,
      320 +
        (activeOptions.includeAllergiesAndMeds ? 96 : 0) +
        condCardsCount * 76 +
        rowCount * 48 +
        (activeOptions.includeQuestions && questions.length > 0
          ? Math.max(3, questions.length) * 24 + 30
          : 0) +
        (activeOptions.includeVitalsSnapshot ? 128 : 0)
    );
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f6faf7';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#047857';
    ctx.fillRect(0, 0, width, 8);

    const pad = 44;
    const innerW = width - pad * 2;
    let y = 44;

    if (activeOptions.includePatientHeader) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#a7f3d0';
      ctx.lineWidth = 1;
      ctx.fillRect(pad, y, innerW, 88);
      ctx.strokeRect(pad, y, innerW, 88);

      ctx.fillStyle = '#047857';
      ctx.font = '700 11px sans-serif';
      ctx.fillText(
        selectedCondition
          ? `VISITREADY  ·  ${selectedCondition.name.toUpperCase()} CLINICAL REPORT`
          : isAllDiseases
          ? 'VISITREADY  ·  COMPLETE HEALTH HISTORY REPORT (ALL DISEASES)'
          : 'VISITREADY  ·  OPD CLINICAL REPORT',
        pad + 20,
        y + 24
      );

      ctx.fillStyle = '#18181b';
      ctx.font = '700 24px sans-serif';
      ctx.fillText(patient.name, pad + 20, y + 52);

      const meta = [
        patient.relationship,
        metrics.age !== null ? `${metrics.age} yrs` : '',
        patient.blood_type ? `Blood ${patient.blood_type}` : '',
        selectedCondition
          ? `Disease: ${selectedCondition.name}`
          : isAllDiseases
          ? `All Diseases (${conditions.length})`
          : '',
        appointment ? `OPD: ${appointment.clinician_or_clinic}` : '',
      ]
        .filter(Boolean)
        .join('  ·  ');
      ctx.fillStyle = '#52525b';
      ctx.font = '400 13px sans-serif';
      ctx.fillText(meta, pad + 20, y + 73);

      const genStr = `Prepared ${new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`;
      ctx.fillStyle = '#065f46';
      ctx.font = '600 12px sans-serif';
      ctx.fillText(genStr, width - pad - 20 - ctx.measureText(genStr).width, y + 32);

      y += 104;
    }

    const halfW = (innerW - 14) / 2;
    if (activeOptions.includeAllergiesAndMeds) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e4e4e7';
      ctx.fillRect(pad, y, halfW, 70);
      ctx.strokeRect(pad, y, halfW, 70);
      ctx.fillRect(pad + halfW + 14, y, halfW, 70);
      ctx.strokeRect(pad + halfW + 14, y, halfW, 70);

      ctx.fillStyle = '#065f46';
      ctx.font = '700 11px sans-serif';
      ctx.fillText('ALLERGIES & MEDICATIONS', pad + 14, y + 22);
      ctx.fillText('MEDICAL HISTORY & EMERGENCY', pad + halfW + 28, y + 22);

      ctx.fillStyle = '#27272a';
      ctx.font = '400 12px sans-serif';
      ctx.fillText(`Allergies: ${patient.allergies || 'None recorded'}`.slice(0, 62), pad + 14, y + 41);
      ctx.fillText(`Meds: ${patient.current_medications || 'None recorded'}`.slice(0, 62), pad + 14, y + 58);
      ctx.fillText(`History: ${patient.medical_history || 'None recorded'}`.slice(0, 62), pad + halfW + 28, y + 41);
      ctx.fillText(
        `Contact: ${patient.emergency_contact_name || 'Not added'} ${patient.emergency_contact_phone || ''}`.slice(0, 62),
        pad + halfW + 28,
        y + 58
      );
      y += 88;
    }

    if (activeOptions.includeDiseaseTreatments && reportConditions.length > 0) {
      ctx.fillStyle = '#065f46';
      ctx.font = '700 12px sans-serif';
      ctx.fillText(
        reportConditions.length === 1
          ? `DISEASE FOCUS: ${reportConditions[0].name.toUpperCase()}`
          : `ALL TRACKED DISEASES & TREATMENTS (${reportConditions.length})`,
        pad,
        y
      );
      y += 12;

      reportConditions.slice(0, 6).forEach((cond) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#a7f3d0';
        ctx.fillRect(pad, y, innerW, 56);
        ctx.strokeRect(pad, y, innerW, 56);

        ctx.fillStyle = '#18181b';
        ctx.font = '700 14px sans-serif';
        ctx.fillText(`${cond.name} (${cond.status})`, pad + 14, y + 22);

        const docText =
          cond.doctor_treatments && cond.doctor_treatments.length > 0
            ? cond.doctor_treatments
                .map((p) => `${p.doctor_name}: ${p.treatments.map((t) => t.name).join(', ')}`)
                .join(' · ')
            : cond.treating_clinician || cond.notes || 'Active tracking';
        ctx.fillStyle = '#52525b';
        ctx.font = '400 12px sans-serif';
        ctx.fillText(docText.slice(0, 110), pad + 14, y + 42);
        y += 66;
      });
      y += 8;
    }

    if (activeOptions.includeSymptomLog) {
      ctx.fillStyle = '#065f46';
      ctx.font = '700 12px sans-serif';
      ctx.fillText(`SYMPTOM & VITALS LOG (${filteredSymptoms.length})`, pad, y);
      y += 10;

      ctx.fillStyle = '#ecfdf5';
      ctx.strokeStyle = '#a7f3d0';
      ctx.fillRect(pad, y, innerW, 30);
      ctx.strokeRect(pad, y, innerW, 30);

      ctx.fillStyle = '#065f46';
      ctx.font = '700 11px sans-serif';
      ctx.fillText('DATE', pad + 12, y + 19);
      ctx.fillText('SYMPTOM', pad + 115, y + 19);
      ctx.fillText('SEVERITY', pad + 370, y + 19);
      if (activeOptions.includeSymptomVitals) ctx.fillText('VITALS', pad + 485, y + 19);
      if (activeOptions.includeSymptomNotes) ctx.fillText('KEY NOTE', pad + 720, y + 19);
      y += 30;

      filteredSymptoms.slice(0, 14).forEach((s, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fafdfb';
        ctx.strokeStyle = '#e4e4e7';
        ctx.fillRect(pad, y, innerW, 44);
        ctx.strokeRect(pad, y, innerW, 44);

        ctx.fillStyle = '#52525b';
        ctx.font = '400 12px sans-serif';
        ctx.fillText(
          new Date(s.start_datetime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          pad + 12,
          y + 26
        );

        ctx.fillStyle = '#18181b';
        ctx.font = '600 12px sans-serif';
        ctx.fillText(s.symptom_name.slice(0, 32), pad + 115, y + 26);

        ctx.fillStyle =
          s.severity_0_to_10 >= 7 ? '#be123c' : s.severity_0_to_10 >= 4 ? '#b45309' : '#047857';
        ctx.font = '700 12px sans-serif';
        ctx.fillText(`${s.severity_0_to_10}/10`, pad + 370, y + 26);

        if (activeOptions.includeSymptomVitals) {
          const vitParts: string[] = [];
          if (s.vitals?.blood_pressure_systolic && s.vitals?.blood_pressure_diastolic) {
            vitParts.push(`BP ${s.vitals.blood_pressure_systolic}/${s.vitals.blood_pressure_diastolic}`);
          }
          if (s.vitals?.pulse) vitParts.push(`P ${s.vitals.pulse}`);
          getBloodSugarReadings(s.vitals).forEach((sr) => {
            vitParts.push(`Sug(${formatBloodSugarContext(sr.context, true)}) ${sr.value}`);
          });
          if (s.vitals?.oxygen_spo2) vitParts.push(`SpO2 ${s.vitals.oxygen_spo2}%`);

          ctx.fillStyle = '#065f46';
          ctx.font = '500 11px sans-serif';
          ctx.fillText((vitParts.join(' · ') || '—').slice(0, 34), pad + 485, y + 26);
        }

        if (activeOptions.includeSymptomNotes) {
          ctx.fillStyle = '#52525b';
          ctx.font = '400 11px sans-serif';
          ctx.fillText((s.description || s.possible_triggers || '—').slice(0, 36), pad + 720, y + 26);
        }
        y += 44;
      });
      y += 18;
    }

    if (activeOptions.includeQuestions && questions.length > 0) {
      ctx.fillStyle = '#065f46';
      ctx.font = '700 12px sans-serif';
      ctx.fillText('QUESTIONS FOR DOCTOR', pad, y);
      y += 16;
      questions.slice(0, 5).forEach((q, idx) => {
        ctx.fillStyle = '#27272a';
        ctx.font = '400 12px sans-serif';
        ctx.fillText(`[  ]  ${idx + 1}. ${q.slice(0, 110)}`, pad, y);
        y += 22;
      });
      y += 14;
    }

    // Bottom 4-Tile Vitals & Health Snapshot KPI Cards (at end of report)
    if (activeOptions.includeVitalsSnapshot) {
      ctx.fillStyle = '#065f46';
      ctx.font = '700 11px sans-serif';
      ctx.fillText('VITALS & HEALTH SNAPSHOT SUMMARY', pad, y);
      y += 10;

      const kpiData = [
        {
          label: 'BLOOD PRESSURE & PULSE',
          val: metrics.latestBp
            ? `${metrics.latestBp.vitals.blood_pressure_systolic}/${metrics.latestBp.vitals.blood_pressure_diastolic} mmHg`
            : patient.baseline_bp || 'No reading',
          sub: metrics.latestPulse ? `Pulse ${metrics.latestPulse.vitals.pulse} bpm` : 'Usual baseline',
        },
        {
          label: 'SUGAR & SPO2',
          val:
            metrics.latestSugarReadings.length > 0
              ? metrics.latestSugarReadings
                  .slice(0, 2)
                  .map((r) => `${r.value} (${formatBloodSugarContext(r.context, true)})`)
                  .join(' · ')
              : metrics.latestSpo2
              ? `SpO2 ${metrics.latestSpo2.vitals.oxygen_spo2}%`
              : 'No reading',
          sub: metrics.latestSpo2 ? `SpO2 ${metrics.latestSpo2.vitals.oxygen_spo2}%` : 'mg/dL home vitals',
        },
        {
          label: 'BODY METRICS',
          val: patient.weight
            ? `${patient.weight} ${patient.weight_unit || 'kg'}`
            : patient.height || 'Not set',
          sub:
            [patient.height || '', metrics.bmi ? `BMI ${metrics.bmi}` : '']
              .filter(Boolean)
              .join(' · ') || 'Baseline',
        },
        {
          label: 'SYMPTOM SUMMARY',
          val: `${filteredSymptoms.length} Entries`,
          sub:
            metrics.peakSeverity !== null
              ? `Peak ${metrics.peakSeverity}/10 · ${metrics.ongoingCount} ongoing`
              : 'No entries selected',
        },
      ];

      const tileGap = 14;
      const tileW = (innerW - tileGap * 3) / 4;
      kpiData.forEach((tile, idx) => {
        const tx = pad + idx * (tileW + tileGap);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d1fae5';
        ctx.fillRect(tx, y, tileW, 82);
        ctx.strokeRect(tx, y, tileW, 82);

        ctx.fillStyle = '#047857';
        ctx.font = '700 10px sans-serif';
        ctx.fillText(tile.label, tx + 14, y + 22);

        ctx.fillStyle = '#18181b';
        ctx.font = '700 16px sans-serif';
        ctx.fillText(tile.val.slice(0, 20), tx + 14, y + 48);

        ctx.fillStyle = '#71717a';
        ctx.font = '400 12px sans-serif';
        ctx.fillText(tile.sub.slice(0, 26), tx + 14, y + 67);
      });

      y += 98;
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VisitReady-${patient.name.replace(/\s+/g, '-')}-${diseaseSlug}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setImageNotice('Dashboard PNG image downloaded.');
      setTimeout(() => setImageNotice(''), 3000);
    }, 'image/png');
  };

  const handleCopyPlainText = () => {
    const lines: string[] = [
      `VISITREADY CLINICAL REPORT — ${patient.name}${
        selectedCondition
          ? ` (${selectedCondition.name})`
          : isAllDiseases
          ? ' (Complete Health History · All Diseases)'
          : ''
      }`,
    ];
    if (activeOptions.includePatientHeader) {
      lines.push(
        `${patient.relationship}${metrics.age !== null ? ` · ${metrics.age} yrs` : ''}${
          patient.blood_type ? ` · Blood ${patient.blood_type}` : ''
        }`,
        `Body Metrics: ${patient.height || '-'} · ${
          patient.weight ? `${patient.weight} ${patient.weight_unit || 'kg'}` : '-'
        } · Usual BP: ${patient.baseline_bp || '-'}`
      );
    }
    if (activeOptions.includeAllergiesAndMeds) {
      lines.push(
        `Allergies: ${patient.allergies || 'None noted'} | Meds: ${
          patient.current_medications || 'None noted'
        }`
      );
    }
    if (activeOptions.includeDiseaseTreatments && reportConditions.length > 0) {
      lines.push('', `DISEASE & TREATMENT PLANS (${reportConditions.length}):`);
      reportConditions.forEach((cond) => {
        const docSummary =
          cond.doctor_treatments && cond.doctor_treatments.length > 0
            ? ' | ' +
              cond.doctor_treatments
                .map(
                  (p) =>
                    `${p.doctor_name}: ${
                      p.treatments.map((t) => t.name).join(', ') || 'Consulting'
                    }`
                )
                .join(' ; ')
            : '';
        lines.push(
          `- ${cond.name} [${cond.status}]${docSummary}${cond.notes ? ` · ${cond.notes}` : ''}`
        );
      });
    }
    if (activeOptions.includeSymptomLog) {
      lines.push(
        '',
        `SYMPTOM & VITALS LOG (${filteredSymptoms.length}):`,
        ...filteredSymptoms.map((s) => {
          const d = new Date(s.start_datetime).toLocaleDateString('en-IN');
          const sugars = getBloodSugarReadings(s.vitals)
            .map((r) => `${r.value} mg/dL (${formatBloodSugarContext(r.context, true)})`)
            .join(', ');
          return `- ${d} | ${s.symptom_name} (${s.severity_0_to_10}/10)${
            sugars ? ` | Sugar: ${sugars}` : ''
          }${activeOptions.includeSymptomNotes && s.description ? ` — ${s.description}` : ''}`;
        })
      );
    }
    if (activeOptions.includeQuestions && questions.length > 0) {
      lines.push('', 'QUESTIONS FOR DOCTOR:', ...questions.map((q, i) => `${i + 1}. ${q}`));
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const modalContent = (
    <div
      id="printable-dashboard-sheet"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-zinc-900/50 backdrop-blur-xs overflow-y-auto print:static print:inset-auto print:block print:bg-white print:p-0 print:overflow-visible"
    >
      <div className="bg-[#f6faf7] rounded-xl shadow-2xl border border-emerald-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden print:bg-white print:shadow-none print:border-none print:max-h-none print:rounded-none print:overflow-visible">
        {/* Interactive Action Toolbar */}
        <div className="px-5 py-3 border-b border-emerald-200/80 bg-white flex flex-wrap items-center justify-between gap-2 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-zinc-900">
              Printable Disease Report Preview
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomizer((prev) => !prev)}
              className={`px-3 py-1.5 border rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                showCustomizer
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-emerald-200 bg-white hover:bg-emerald-50 text-zinc-800'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-700" />
              Customize Print
            </button>
            <button
              type="button"
              onClick={handleCopyPlainText}
              className="px-3 py-1.5 border border-emerald-200 bg-white hover:bg-emerald-50 text-zinc-800 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              {copiedText ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-emerald-700" />
              )}
              {copiedText ? 'Copied' : 'Copy Text'}
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              className="px-3 py-1.5 border border-emerald-200 bg-white hover:bg-emerald-50 text-zinc-800 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-700" />
              PNG Image
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3 py-1.5 border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Report
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-emerald-50 cursor-pointer ml-1"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Disease Selector & Content Customizer */}
        {showCustomizer && (
          <div className="px-5 py-3 bg-emerald-50/60 border-b border-emerald-200/80 space-y-2.5 print:hidden shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-bold text-emerald-950">
                  Disease for this Report:
                </label>
                <select
                  aria-label="Disease for this Report"
                  value={activeDiseaseId}
                  onChange={(e) => setDisease(e.target.value)}
                  className="px-2.5 py-1.5 border border-emerald-300 bg-white rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:border-emerald-700"
                >
                  {conditions.map((c) => {
                    const count = symptoms.filter((s) => s.condition_ids?.includes(c.id)).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({count} {count === 1 ? 'log' : 'logs'})
                      </option>
                    );
                  })}
                  <option value="all">
                    All Diseases — Complete Health History ({conditions.length}{' '}
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
              <span className="text-2xs text-emerald-800">
                Choose a specific disease or &ldquo;All Diseases&rdquo; for the full health history report.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-emerald-200/60">
              <span className="text-2xs font-bold uppercase tracking-wider text-emerald-800">
                Print Sections:
              </span>
              {PRINT_OPTION_LABELS.map((item) => (
                <label
                  key={item.key}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-800 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={activeOptions[item.key]}
                    onChange={() => toggleOption(item.key)}
                    className="rounded accent-emerald-700"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {imageNotice && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 font-medium print:hidden">
            {imageNotice}
          </div>
        )}

        {/* Aesthetic Dashboard Sheet */}
        <div className="overflow-y-auto p-4 sm:p-6 flex-1 print:p-0 print:overflow-visible">
          <div className="max-w-4xl mx-auto space-y-4 print:max-w-none print:space-y-3">
            {/* 1. Patient & OPD Identity Header Banner */}
            {activeOptions.includePatientHeader && (
              <section className="bg-white border border-emerald-200/90 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:rounded-lg">
                <div>
                  <div className="text-3xs font-bold uppercase tracking-wider text-emerald-700 mb-0.5">
                    {selectedCondition
                      ? `VisitReady · ${selectedCondition.name} Clinical Report`
                      : isAllDiseases
                      ? 'VisitReady · Complete Health History Report (All Diseases)'
                      : 'VisitReady · OPD Clinical Dashboard'}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                    {patient.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 mt-1">
                    <span>{patient.relationship}</span>
                    {metrics.age !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{metrics.age} years</span>
                      </>
                    )}
                    {patient.blood_type && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-emerald-800">
                          Blood Group {patient.blood_type}
                        </span>
                      </>
                    )}
                    {patient.emergency_contact_name && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Emergency: {patient.emergency_contact_name}
                          {patient.emergency_contact_phone
                            ? ` (${patient.emergency_contact_phone})`
                            : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-emerald-100 pt-3 sm:pt-0 sm:pl-5 text-xs shrink-0 space-y-0.5">
                  <div className="text-2xs text-zinc-400 font-medium">Summary Generated</div>
                  <div className="font-semibold text-zinc-900 tabular-nums">
                    {new Date().toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                  {appointment && (
                    <div className="text-emerald-800 font-semibold pt-0.5">
                      {appointment.clinician_or_clinic}
                      <span className="block text-2xs font-normal text-zinc-500 tabular-nums">
                        {new Date(appointment.appointment_datetime).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* KPI cards moved cleanly to bottom of the printable report */}

            {/* 3. Structured 3-Column Clinical Reference Grid */}
            {activeOptions.includeAllergiesAndMeds && (
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
                <div className="bg-white border border-zinc-200 rounded-xl p-3.5 print:rounded-lg">
                  <div className="text-3xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Known Allergies
                  </div>
                  {metrics.allergyList.length === 0 ? (
                    <p className="text-xs text-zinc-500">None recorded</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-zinc-800">
                      {metrics.allergyList.map((a, i) => (
                        <li key={i} className="flex items-baseline gap-1.5">
                          <span className="text-emerald-700 font-bold">·</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-3.5 print:rounded-lg">
                  <div className="text-3xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Active Medications
                  </div>
                  {metrics.medicationList.length === 0 ? (
                    <p className="text-xs text-zinc-500">None recorded</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-zinc-800">
                      {metrics.medicationList.map((m, i) => (
                        <li key={i} className="flex items-baseline gap-1.5">
                          <span className="text-emerald-700 font-bold">·</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-3.5 print:rounded-lg">
                  <div className="text-3xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Medical Background
                  </div>
                  <p className="text-xs text-zinc-800 leading-snug">
                    {patient.medical_history || 'No past surgical or family history recorded.'}
                  </p>
                </div>
              </section>
            )}

            {/* 4. Focused Single Disease or All Tracked Diseases & Simultaneous Doctors Cards */}
            {activeOptions.includeDiseaseTreatments && reportConditions.length > 0 && (
              <section className="space-y-3">
                {reportConditions.length > 1 && (
                  <div className="text-3xs font-bold uppercase tracking-wider text-emerald-800 px-0.5">
                    All Tracked Diseases &amp; Treatment Plans ({reportConditions.length})
                  </div>
                )}
                {reportConditions.map((cond) => (
                  <div
                    key={cond.id}
                    className="bg-white border border-emerald-200 rounded-xl p-4 print:rounded-lg space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-3xs font-bold uppercase tracking-wider text-emerald-700 block">
                          {reportConditions.length === 1
                            ? 'Selected Disease & Treatment Plan'
                            : 'Tracked Condition & Treatment Plan'}
                        </span>
                        <h3 className="text-base font-bold text-zinc-900">{cond.name}</h3>
                      </div>
                      <div className="text-right">
                        <span className="text-2xs font-semibold capitalize px-2.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                          {cond.status}
                        </span>
                        {cond.diagnosed_date && (
                          <div className="text-3xs text-zinc-400 mt-1">
                            Diagnosed {new Date(cond.diagnosed_date).toLocaleDateString('en-IN')}
                          </div>
                        )}
                      </div>
                    </div>

                    {cond.doctor_treatments && cond.doctor_treatments.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 print:grid-cols-2">
                        {cond.doctor_treatments.map((plan) => (
                          <div
                            key={plan.id}
                            className="p-2.5 rounded-lg bg-emerald-50/40 border border-emerald-100 text-xs"
                          >
                            <div className="font-semibold text-emerald-950">
                              {plan.doctor_name}
                              {plan.specialty_or_clinic && (
                                <span className="font-normal text-zinc-500 text-2xs">
                                  {' '}
                                  · {plan.specialty_or_clinic}
                                </span>
                              )}
                            </div>
                            {plan.treatments.length > 0 && (
                              <ul className="mt-1 space-y-0.5 text-2xs text-zinc-700">
                                {plan.treatments.map((t) => (
                                  <li key={t.id}>
                                    · <span className="font-medium text-zinc-800">{t.name}</span>
                                    {t.notes ? (
                                      <span className="text-zinc-500"> ({t.notes})</span>
                                    ) : (
                                      ''
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      cond.treating_clinician && (
                        <p className="text-xs text-emerald-800 font-medium">
                          Treating Doctor: {cond.treating_clinician}
                        </p>
                      )
                    )}

                    {cond.notes && (
                      <p className="text-xs text-zinc-600 pt-1 border-t border-emerald-100">
                        {cond.notes}
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* 5. Structured Symptom & Home Vitals Dashboard Table */}
            {activeOptions.includeSymptomLog && (
              <section className="bg-white border border-zinc-200 rounded-xl overflow-hidden print:rounded-lg">
                <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    {selectedCondition
                      ? `${selectedCondition.name} — Symptom Log (${filteredSymptoms.length})`
                      : isAllDiseases
                      ? `All Diseases — Complete Symptom History (${filteredSymptoms.length})`
                      : `Symptom & Vitals Log (${filteredSymptoms.length})`}
                  </h3>
                  <span className="text-2xs text-zinc-500">Chronological clinical view</span>
                </div>

                {filteredSymptoms.length === 0 ? (
                  <p className="text-xs text-zinc-500 p-4">
                    No symptom entries selected for this disease.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50/80 text-3xs font-bold uppercase tracking-wider text-zinc-500">
                          <th className="py-2.5 px-3.5 whitespace-nowrap">Date</th>
                          <th className="py-2.5 px-3">Symptom &amp; Site</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Severity</th>
                          {activeOptions.includeSymptomVitals && (
                            <th className="py-2.5 px-3">Home Vitals</th>
                          )}
                          {activeOptions.includeSymptomNotes && (
                            <th className="py-2.5 px-3.5">Key Trigger / Note</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredSymptoms.map((s) => {
                          const sevStyle = getSeverityAccent(s.severity_0_to_10);

                          const vitItems: string[] = [];
                          if (
                            s.vitals?.blood_pressure_systolic &&
                            s.vitals?.blood_pressure_diastolic
                          ) {
                            vitItems.push(
                              `BP ${s.vitals.blood_pressure_systolic}/${s.vitals.blood_pressure_diastolic}`
                            );
                          }
                          if (s.vitals?.pulse) vitItems.push(`Pulse ${s.vitals.pulse}`);
                          if (s.vitals?.temperature) {
                            vitItems.push(
                              `${s.vitals.temperature}°${s.vitals.temperature_unit || 'F'}`
                            );
                          }
                          getBloodSugarReadings(s.vitals).forEach((sr) => {
                            vitItems.push(
                              `Sugar (${formatBloodSugarContext(sr.context, true)}) ${sr.value} mg/dL${
                                sr.time_note ? ` @ ${sr.time_note}` : ''
                              }`
                            );
                          });
                          if (s.vitals?.oxygen_spo2) {
                            vitItems.push(`SpO2 ${s.vitals.oxygen_spo2}%`);
                          }
                          if (s.vitals?.weight) {
                            vitItems.push(`${s.vitals.weight} ${s.vitals.weight_unit || 'kg'}`);
                          }

                          return (
                            <tr key={s.id} className="align-top hover:bg-emerald-50/20">
                              <td className="py-2.5 px-3.5 whitespace-nowrap text-zinc-600 tabular-nums">
                                <div className="font-medium text-zinc-800">
                                  {new Date(s.start_datetime).toLocaleDateString('en-IN', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: '2-digit',
                                  })}
                                </div>
                                <div className="text-3xs text-zinc-400">
                                  {new Date(s.start_datetime).toLocaleTimeString('en-IN', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 min-w-[160px]">
                                <div className="font-semibold text-zinc-900">{s.symptom_name}</div>
                                <div className="text-2xs text-zinc-500 mt-0.5">
                                  {[s.body_location || '', s.ongoing ? 'Ongoing' : '']
                                    .filter(Boolean)
                                    .join(' · ') || 'Logged symptom'}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className={`font-bold tabular-nums ${sevStyle.text}`}>
                                  {s.severity_0_to_10}/10
                                </div>
                                <div className="w-14 h-1.5 bg-zinc-200 rounded-full overflow-hidden mt-1">
                                  <div
                                    className={`h-full rounded-full ${sevStyle.bar}`}
                                    style={{
                                      width: `${Math.max(8, s.severity_0_to_10 * 10)}%`,
                                    }}
                                  />
                                </div>
                              </td>

                              {activeOptions.includeSymptomVitals && (
                                <td className="py-2.5 px-3 min-w-[130px] tabular-nums">
                                  {vitItems.length > 0 ? (
                                    <div className="flex flex-col gap-0.5 text-2xs font-medium text-emerald-800">
                                      {vitItems.map((v, i) => (
                                        <span key={i}>{v}</span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-zinc-400">—</span>
                                  )}
                                </td>
                              )}

                              {activeOptions.includeSymptomNotes && (
                                <td className="py-2.5 px-3.5 text-2xs text-zinc-600 max-w-[240px]">
                                  {[
                                    s.possible_triggers ? `Trigger: ${s.possible_triggers}` : '',
                                    s.better_or_worse_notes
                                      ? `Relief: ${s.better_or_worse_notes}`
                                      : '',
                                    s.description || '',
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* 6. 2-Column OPD Discussion & Doctor Write-In Grid */}
            {(activeOptions.includeQuestions || activeOptions.includeConsultationPad) && (
              <section
                className={`grid gap-4 break-inside-avoid ${
                  activeOptions.includeQuestions && activeOptions.includeConsultationPad
                    ? 'grid-cols-1 md:grid-cols-2 print:grid-cols-2'
                    : 'grid-cols-1'
                }`}
              >
                {activeOptions.includeQuestions && (
                  <div className="bg-white border border-zinc-200 rounded-xl p-4 print:rounded-lg">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2.5">
                      Questions Checklist for Doctor
                    </h3>
                    {questions.length === 0 ? (
                      <p className="text-xs text-zinc-500">No specific questions added yet.</p>
                    ) : (
                      <ul className="space-y-2 text-xs text-zinc-800">
                        {questions.map((q, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span className="w-3.5 h-3.5 mt-0.5 border border-emerald-600 rounded-xs shrink-0 inline-block" />
                            <span>
                              <span className="font-semibold text-emerald-800 mr-1 tabular-nums">
                                {idx + 1}.
                              </span>
                              {q}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activeOptions.includeConsultationPad && (
                  <div className="bg-white border border-zinc-200 rounded-xl p-4 print:rounded-lg flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-2">
                        OPD Consultation &amp; Prescription Notes
                      </h3>
                      {visitNotes && (
                        <p className="text-xs text-zinc-700 mb-3 bg-emerald-50/40 p-2 rounded border border-emerald-100">
                          {visitNotes}
                        </p>
                      )}
                    </div>
                    <div className="space-y-4 pt-1">
                      <div className="border-b border-zinc-200 h-4" />
                      <div className="border-b border-zinc-200 h-4" />
                      <div className="border-b border-zinc-200 h-4" />
                      <div className="border-b border-zinc-200 h-4" />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 7. Bottom 4-Column Vitals & Health Snapshot KPI Strip (End of Report) */}
            {activeOptions.includeVitalsSnapshot && (
              <section className="space-y-2 pt-1 break-inside-avoid">
                <div className="text-3xs font-bold uppercase tracking-wider text-emerald-800 px-0.5">
                  Vitals &amp; Health Snapshot Summary
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4">
                  <div className="bg-white border border-emerald-200/80 rounded-xl p-3.5 print:rounded-lg">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-emerald-700">
                      Blood Pressure
                    </div>
                    <div className="text-lg font-bold text-zinc-900 mt-1 tabular-nums">
                      {metrics.latestBp
                        ? `${metrics.latestBp.vitals.blood_pressure_systolic}/${metrics.latestBp.vitals.blood_pressure_diastolic} mmHg`
                        : patient.baseline_bp || '—'}
                    </div>
                    <div className="text-2xs text-zinc-500 mt-0.5 tabular-nums">
                      {metrics.latestPulse
                        ? `Pulse ${metrics.latestPulse.vitals.pulse} bpm`
                        : patient.baseline_bp
                        ? `Usual BP ${patient.baseline_bp}`
                        : 'No reading logged'}
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-200/80 rounded-xl p-3.5 print:rounded-lg">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-emerald-700">
                      Blood Sugar &amp; SpO2
                    </div>
                    {metrics.latestSugarReadings.length > 0 ? (
                      <div className="mt-1 space-y-0.5 tabular-nums">
                        {metrics.latestSugarReadings.map((sr) => (
                          <div key={sr.id} className="text-xs font-bold text-zinc-900">
                            {sr.value} mg/dL{' '}
                            <span className="font-medium text-emerald-800">
                              ({formatBloodSugarContext(sr.context, true)})
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-lg font-bold text-zinc-900 mt-1 tabular-nums">
                        {metrics.latestSpo2
                          ? `${metrics.latestSpo2.vitals.oxygen_spo2}% SpO2`
                          : '—'}
                      </div>
                    )}
                    <div className="text-2xs text-zinc-500 mt-0.5 tabular-nums">
                      {metrics.latestSpo2
                        ? `SpO2 ${metrics.latestSpo2.vitals.oxygen_spo2}%`
                        : metrics.latestSugarReadings.length > 0
                        ? 'Home sugar log'
                        : 'No home reading'}
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-200/80 rounded-xl p-3.5 print:rounded-lg">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-emerald-700">
                      Body Measurements
                    </div>
                    <div className="text-lg font-bold text-zinc-900 mt-1 tabular-nums">
                      {patient.weight
                        ? `${patient.weight} ${patient.weight_unit || 'kg'}`
                        : patient.height || '—'}
                    </div>
                    <div className="text-2xs text-zinc-500 mt-0.5 tabular-nums">
                      {[
                        patient.height ? `Ht ${patient.height}` : '',
                        metrics.bmi ? `BMI ${metrics.bmi}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Profile measurements'}
                    </div>
                  </div>

                  <div className="bg-white border border-emerald-200/80 rounded-xl p-3.5 print:rounded-lg">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-emerald-700">
                      Logged Activity
                    </div>
                    <div className="text-lg font-bold text-zinc-900 mt-1 tabular-nums">
                      {filteredSymptoms.length}{' '}
                      {filteredSymptoms.length === 1 ? 'Entry' : 'Entries'}
                    </div>
                    <div className="text-2xs text-zinc-500 mt-0.5 tabular-nums">
                      {metrics.peakSeverity !== null
                        ? `Peak ${metrics.peakSeverity}/10 · ${metrics.ongoingCount} ongoing`
                        : selectedCondition
                        ? selectedCondition.name
                        : isAllDiseases
                        ? 'All diseases history'
                        : 'General log'}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Quiet Footer */}
            <footer className="pt-1 pb-2 text-2xs text-zinc-400 flex flex-wrap justify-between gap-2 px-1">
              <span>Self-reported patient summary compiled with VisitReady.</span>
              <span>Medical emergencies (India): Call 112 / 108</span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
