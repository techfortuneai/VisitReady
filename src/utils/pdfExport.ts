/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { Person, SymptomEntry, Appointment, Condition, DailyVitalLog } from '../types/index.ts';
import { getBloodSugarReadings, formatBloodSugarContext } from './vitals.ts';

export interface PrintContentOptions {
  includePatientHeader: boolean;
  includeVitalsSnapshot: boolean;
  includeAllergiesAndMeds: boolean;
  includeDiseaseTreatments: boolean;
  includeSymptomLog: boolean;
  includeSymptomVitals: boolean;
  includeSymptomNotes: boolean;
  includeQuestions: boolean;
  includeConsultationPad: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintContentOptions = {
  includePatientHeader: true,
  includeVitalsSnapshot: true,
  includeAllergiesAndMeds: true,
  includeDiseaseTreatments: true,
  includeSymptomLog: true,
  includeSymptomVitals: true,
  includeSymptomNotes: true,
  includeQuestions: true,
  includeConsultationPad: true,
};

export interface SummaryPdfData {
  patient: Person;
  conditions?: Condition[];
  selectedCondition?: Condition | null;
  appointment?: Appointment;
  title: string;
  dateRange: { start: string; end: string };
  symptoms: SymptomEntry[];
  vitalLogs?: DailyVitalLog[];
  questions: string[];
  visitNotes?: string;
  generatedAt: string;
  options?: Partial<PrintContentOptions>;
}

function calcAge(dob?: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function calcBmi(patient: Person): string | null {
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
    if (cmMatch) {
      heightM = parseFloat(cmMatch[1]) / 100;
    }
  }
  if (!heightM || heightM <= 0) return null;
  return (weightKg / (heightM * heightM)).toFixed(1);
}

export function generateAppointmentSummaryPdf(data: SummaryPdfData): jsPDF {
  const opts: PrintContentOptions = {
    ...DEFAULT_PRINT_OPTIONS,
    ...(data.options || {}),
  };

  const reportConditions = data.selectedCondition
    ? [data.selectedCondition]
    : data.conditions || [];

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const contentWidth = pageWidth - margin * 2;
  const colGap = 10;
  const halfW = (contentWidth - colGap) / 2;
  let y = 0;

  const drawTopAccent = () => {
    doc.setFillColor(4, 120, 87);
    doc.rect(0, 0, pageWidth, 6, 'F');
    y = 26;
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 34) {
      doc.addPage();
      drawTopAccent();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const headerContext = data.selectedCondition
        ? `${data.patient.name} · ${data.selectedCondition.name}`
        : data.patient.name;
      doc.text(`VisitReady Clinical Report · ${headerContext}`, margin, y);
      y += 14;
    }
  };

  drawTopAccent();

  // Header Identity Row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(4, 120, 87);
  const topTitle = data.selectedCondition
    ? `VISITREADY · ${data.selectedCondition.name.toUpperCase()} CLINICAL REPORT`
    : reportConditions.length > 1
    ? 'VISITREADY · COMPLETE HEALTH HISTORY REPORT (ALL DISEASES)'
    : 'VISITREADY · PATIENT HEALTH REPORT';
  doc.text(topTitle, margin, y);

  const genStr = `Prepared ${new Date(data.generatedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(genStr, pageWidth - margin - doc.getTextWidth(genStr), y);
  y += 18;

  if (opts.includePatientHeader) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(24, 24, 27);
    doc.text(data.patient.name, margin, y);

    if (data.appointment) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(6, 95, 70);
      const apptText = `OPD: ${data.appointment.clinician_or_clinic}`;
      doc.text(apptText, pageWidth - margin - doc.getTextWidth(apptText), y - 2);
    }
    y += 13;

    const age = calcAge(data.patient.birth_date);
    const metaLine = [
      data.patient.relationship,
      age !== null ? `${age} yrs` : '',
      data.patient.blood_type ? `Blood ${data.patient.blood_type}` : '',
      data.selectedCondition ? `Disease: ${data.selectedCondition.name}` : '',
      data.appointment
        ? `Visit ${new Date(data.appointment.appointment_datetime).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          })}`
        : '',
    ]
      .filter(Boolean)
      .join('  ·  ');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(82, 82, 91);
    doc.text(metaLine, margin, y);
    y += 14;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(24, 24, 27);
    doc.text(
      data.selectedCondition
        ? `${data.selectedCondition.name} — OPD Report`
        : data.title || 'OPD Clinical Report',
      margin,
      y
    );
    y += 16;
  }


  // 2-Column Clinical Profile Strip (Allergies / Meds | History / Emergency)
  if (opts.includeAllergiesAndMeds) {
    const profileBoxH = 46;
    checkPageBreak(profileBoxH + 12);
    doc.setDrawColor(228, 228, 231);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, y, halfW, profileBoxH, 4, 4, 'FD');
    doc.roundedRect(margin + halfW + colGap, y, halfW, profileBoxH, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(6, 95, 70);
    doc.text('ALLERGIES & CURRENT MEDICATIONS', margin + 8, y + 12);
    doc.text('HISTORY & EMERGENCY CONTACT', margin + halfW + colGap + 8, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(39, 39, 42);
    const leftLines = doc.splitTextToSize(
      `Allergies: ${data.patient.allergies || 'None noted'} · Meds: ${
        data.patient.current_medications || 'None noted'
      }`,
      halfW - 16
    );
    doc.text(leftLines.slice(0, 2), margin + 8, y + 24);

    const rightLines = doc.splitTextToSize(
      `History: ${data.patient.medical_history || 'None noted'} · Contact: ${
        data.patient.emergency_contact_name || 'Not set'
      } ${data.patient.emergency_contact_phone ? `(${data.patient.emergency_contact_phone})` : ''}`,
      halfW - 16
    );
    doc.text(rightLines.slice(0, 2), margin + halfW + colGap + 8, y + 24);
    y += profileBoxH + 12;
  }

  // Selected Disease & Doctors / Treatments Section
  if (opts.includeDiseaseTreatments && reportConditions.length > 0) {
    checkPageBreak(70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(6, 95, 70);
    doc.text(
      reportConditions.length === 1
        ? `Disease & Treatment Details: ${reportConditions[0].name}`
        : `All Tracked Conditions & Treatment Plans (${reportConditions.length})`,
      margin,
      y
    );
    y += 8;

    reportConditions.forEach((c) => {
      const doctorPlans = c.doctor_treatments || [];
      const cardH = Math.max(
        38,
        24 + Math.max(1, doctorPlans.length) * 14 + (c.notes ? 12 : 0)
      );
      checkPageBreak(cardH + 6);

      doc.setDrawColor(167, 243, 208);
      doc.setFillColor(246, 250, 247);
      doc.roundedRect(margin, y, contentWidth, cardH, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(24, 24, 27);
      doc.text(c.name, margin + 10, y + 15);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(4, 120, 87);
      const st = c.status.toUpperCase();
      doc.text(st, pageWidth - margin - 10 - doc.getTextWidth(st), y + 15);

      let innerY = y + 28;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(63, 63, 70);

      if (doctorPlans.length > 0) {
        doctorPlans.forEach((plan) => {
          const line = `${plan.doctor_name}${
            plan.specialty_or_clinic ? ` (${plan.specialty_or_clinic})` : ''
          }: ${
            plan.treatments.length > 0
              ? plan.treatments
                  .map((t) => `${t.name}${t.notes ? ` [${t.notes}]` : ''}`)
                  .join(', ')
              : 'Consulting'
          }`;
          doc.text(line.slice(0, 96), margin + 10, innerY);
          innerY += 13;
        });
      } else if (c.treating_clinician) {
        doc.text(`Treating Doctor: ${c.treating_clinician}`, margin + 10, innerY);
        innerY += 13;
      } else {
        doc.text('No treating doctor listed.', margin + 10, innerY);
        innerY += 13;
      }

      if (c.notes) {
        doc.setTextColor(113, 113, 122);
        doc.text(`Notes: ${c.notes}`.slice(0, 96), margin + 10, innerY);
      }

      y += cardH + 8;
    });
    y += 4;
  }

  // Structured Symptom & Vitals Table
  if (opts.includeSymptomLog) {
    checkPageBreak(80);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(6, 95, 70);
    const symHeaderTitle = data.selectedCondition
      ? `${data.selectedCondition.name} — Symptom Log (${data.symptoms.length})`
      : `Symptom & Vitals Log (${data.symptoms.length})`;
    doc.text(symHeaderTitle, margin, y);
    y += 8;

    const colDate = 68;
    const colSev = 54;
    const colVit = opts.includeSymptomVitals ? 116 : 0;
    const colNote = opts.includeSymptomNotes ? 150 : 0;
    const colSym = contentWidth - colDate - colSev - colVit - colNote;

    const drawTableHeader = () => {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.rect(margin, y, contentWidth, 20, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(6, 95, 70);
      let curX = margin + 6;
      doc.text('DATE', curX, y + 13);
      curX = margin + colDate + 4;
      doc.text('SYMPTOM', curX, y + 13);
      curX += colSym;
      doc.text('SEVERITY', curX, y + 13);
      curX += colSev;
      if (opts.includeSymptomVitals) {
        doc.text('HOME VITALS', curX, y + 13);
        curX += colVit;
      }
      if (opts.includeSymptomNotes) {
        doc.text('TRIGGERS / NOTES', curX, y + 13);
      }
      y += 20;
    };

    if (data.symptoms.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(113, 113, 122);
      doc.text('No symptom entries selected for this report.', margin, y + 12);
      y += 24;
    } else {
      drawTableHeader();
      data.symptoms.forEach((s, idx) => {
        const symText = doc.splitTextToSize(
          `${s.symptom_name}${s.body_location ? ` (${s.body_location})` : ''}${
            s.ongoing ? ' · Ongoing' : ''
          }`,
          colSym - 8
        );
        const vitParts: string[] = [];
        if (opts.includeSymptomVitals && s.vitals) {
          if (s.vitals.blood_pressure_systolic && s.vitals.blood_pressure_diastolic) {
            vitParts.push(
              `BP ${s.vitals.blood_pressure_systolic}/${s.vitals.blood_pressure_diastolic}`
            );
          }
          if (s.vitals.pulse) vitParts.push(`P ${s.vitals.pulse}`);
          if (s.vitals.temperature) {
            vitParts.push(`${s.vitals.temperature}°${s.vitals.temperature_unit || 'F'}`);
          }
          getBloodSugarReadings(s.vitals).forEach((sr) => {
            vitParts.push(`Sugar (${formatBloodSugarContext(sr.context, true)}) ${sr.value}`);
          });
          if (s.vitals.oxygen_spo2) vitParts.push(`SpO2 ${s.vitals.oxygen_spo2}%`);
        }
        const vitLines = opts.includeSymptomVitals
          ? doc.splitTextToSize(vitParts.join(' · ') || '—', colVit - 8)
          : [];

        const noteStr = opts.includeSymptomNotes
          ? [s.possible_triggers ? `Trigger: ${s.possible_triggers}` : '', s.description || '']
              .filter(Boolean)
              .join(' · ') || '—'
          : '';
        const noteLines = opts.includeSymptomNotes
          ? doc.splitTextToSize(noteStr, colNote - 8)
          : [];

        const maxLines = Math.max(
          symLinesLen(symText),
          symLinesLen(vitLines),
          symLinesLen(noteLines),
          1
        );
        const rowH = Math.max(24, maxLines * 10 + 10);

        if (y + rowH > pageHeight - 36) {
          doc.addPage();
          drawTopAccent();
          drawTableHeader();
        }

        doc.setFillColor(
          idx % 2 === 0 ? 255 : 249,
          idx % 2 === 0 ? 255 : 252,
          idx % 2 === 0 ? 255 : 250
        );
        doc.setDrawColor(228, 228, 231);
        doc.rect(margin, y, contentWidth, rowH, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(82, 82, 91);
        doc.text(
          new Date(s.start_datetime).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
          }),
          margin + 6,
          y + 14
        );

        let curX = margin + colDate + 4;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(24, 24, 27);
        doc.text(symText.slice(0, 3), curX, y + 13);
        curX += colSym;

        // Severity text + mini bar
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(
          s.severity_0_to_10 >= 7 ? 190 : s.severity_0_to_10 >= 4 ? 180 : 4,
          s.severity_0_to_10 >= 7 ? 18 : s.severity_0_to_10 >= 4 ? 83 : 120,
          s.severity_0_to_10 >= 7 ? 60 : s.severity_0_to_10 >= 4 ? 9 : 87
        );
        doc.text(`${s.severity_0_to_10}/10`, curX, y + 12);
        doc.setFillColor(228, 228, 231);
        doc.rect(curX, y + 16, 40, 3, 'F');
        doc.setFillColor(
          s.severity_0_to_10 >= 7 ? 225 : s.severity_0_to_10 >= 4 ? 217 : 16,
          s.severity_0_to_10 >= 7 ? 29 : s.severity_0_to_10 >= 4 ? 119 : 185,
          s.severity_0_to_10 >= 7 ? 72 : s.severity_0_to_10 >= 4 ? 6 : 129
        );
        doc.rect(curX, y + 16, Math.max(2, (s.severity_0_to_10 / 10) * 40), 3, 'F');
        curX += colSev;

        if (opts.includeSymptomVitals) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(6, 95, 70);
          doc.text(vitLines.slice(0, 3), curX, y + 13);
          curX += colVit;
        }

        if (opts.includeSymptomNotes) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(82, 82, 91);
          doc.text(noteLines.slice(0, 3), curX, y + 13);
        }

        y += rowH;
      });
    }

    y += 14;
  }

  // Bottom Row: Questions Checklist & Doctor Consultation Pad (independently toggleable)
  if (opts.includeQuestions || opts.includeConsultationPad) {
    const questionsList =
      data.questions && data.questions.length > 0
        ? data.questions
        : [
            'Could these symptoms be related to my existing condition or medicines?',
            'Are any blood tests or follow-up scans recommended right now?',
            'Which red-flag symptoms require urgent casualty care?',
          ];

    const bottomH = Math.max(96, (opts.includeQuestions ? questionsList.length : 3) * 18 + 26);
    checkPageBreak(bottomH + 10);

    const bothCols = opts.includeQuestions && opts.includeConsultationPad;
    const boxW = bothCols ? halfW : contentWidth;

    if (opts.includeQuestions) {
      doc.setDrawColor(228, 228, 231);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, y, boxW, bottomH, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(6, 95, 70);
      doc.text('QUESTIONS FOR DOCTOR', margin + 10, y + 15);

      let qY = y + 30;
      questionsList.slice(0, 6).forEach((q, idx) => {
        doc.setDrawColor(161, 161, 170);
        doc.rect(margin + 10, qY - 6, 7, 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(39, 39, 42);
        const wrapped = doc.splitTextToSize(`${idx + 1}. ${q}`, boxW - 30);
        doc.text(wrapped[0], margin + 22, qY);
        qY += 16;
      });
    }

    if (opts.includeConsultationPad) {
      const padX = bothCols ? margin + halfW + colGap : margin;
      doc.setDrawColor(228, 228, 231);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(padX, y, boxW, bottomH, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(6, 95, 70);
      doc.text('OPD CONSULTATION NOTES', padX + 10, y + 15);

      if (data.visitNotes) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(63, 63, 70);
        const vn = doc.splitTextToSize(data.visitNotes, boxW - 20);
        doc.text(vn.slice(0, 3), padX + 10, y + 30);
      }
      doc.setDrawColor(228, 228, 231);
      for (let lineY = y + (data.visitNotes ? 62 : 34); lineY < y + bottomH - 10; lineY += 16) {
        doc.line(padX + 10, lineY, padX + boxW - 10, lineY);
      }
    }

    y += bottomH + 12;
  }

  // Bottom 4-Column Vitals & KPI Snapshot Cards (Placed at end of report)
  if (opts.includeVitalsSnapshot) {
    const combinedVitalsSources = [
      ...(data.vitalLogs || []).map((v) => ({ ts: new Date(v.recorded_at).getTime(), vitals: v })),
      ...data.symptoms
        .filter((s) => s.vitals)
        .map((s) => ({ ts: new Date(s.start_datetime).getTime(), vitals: s.vitals! })),
    ].sort((a, b) => b.ts - a.ts);

    const latestBpEntry = combinedVitalsSources.find(
      (v) => v.vitals.blood_pressure_systolic && v.vitals.blood_pressure_diastolic
    );
    const latestPulseEntry = combinedVitalsSources.find((v) => v.vitals.pulse);
    const latestSugarEntry = combinedVitalsSources.find(
      (v) => getBloodSugarReadings(v.vitals).length > 0
    );
    const sugarReadings = getBloodSugarReadings(latestSugarEntry?.vitals);
    const latestSpo2Entry = combinedVitalsSources.find((v) => v.vitals.oxygen_spo2);
    const peakSeverity =
      data.symptoms.length > 0
        ? Math.max(...data.symptoms.map((s) => s.severity_0_to_10))
        : null;
    const ongoingCount = data.symptoms.filter((s) => s.ongoing).length;
    const bmi = calcBmi(data.patient);

    const kpis = [
      {
        label: 'BLOOD PRESSURE & PULSE',
        value: latestBpEntry
          ? `${latestBpEntry.vitals.blood_pressure_systolic}/${latestBpEntry.vitals.blood_pressure_diastolic} mmHg`
          : data.patient.baseline_bp || 'No reading',
        sub: latestPulseEntry
          ? `Pulse ${latestPulseEntry.vitals.pulse} bpm`
          : data.patient.baseline_bp
          ? `Usual ${data.patient.baseline_bp}`
          : 'Add vitals in log',
      },
      {
        label: 'BLOOD SUGAR & SPO2',
        value:
          sugarReadings.length > 0
            ? sugarReadings
                .slice(0, 2)
                .map((r) => `${r.value} (${formatBloodSugarContext(r.context, true)})`)
                .join(' · ')
            : latestSpo2Entry
            ? `SpO2 ${latestSpo2Entry.vitals.oxygen_spo2}%`
            : 'No reading',
        sub:
          [
            sugarReadings.length > 2
              ? `+${sugarReadings.length - 2} more readings`
              : sugarReadings.length > 0
              ? 'mg/dL home monitoring'
              : '',
            latestSpo2Entry ? `SpO2 ${latestSpo2Entry.vitals.oxygen_spo2}%` : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'Home monitoring',
      },
      {
        label: 'BODY METRICS',
        value: data.patient.weight
          ? `${data.patient.weight} ${data.patient.weight_unit || 'kg'}`
          : data.patient.height || 'Not recorded',
        sub:
          [data.patient.height || '', bmi ? `BMI ${bmi}` : ''].filter(Boolean).join(' · ') ||
          'Baseline profile',
      },
      {
        label: 'SYMPTOM ACTIVITY',
        value: `${data.symptoms.length} ${data.symptoms.length === 1 ? 'Entry' : 'Entries'}`,
        sub:
          peakSeverity !== null
            ? `Peak ${peakSeverity}/10 · ${ongoingCount} ongoing`
            : 'No symptoms selected',
      },
    ];

    const kpiGap = 8;
    const kpiW = (contentWidth - kpiGap * 3) / 4;
    const kpiH = 48;

    checkPageBreak(kpiH + 26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70);
    doc.text('VITALS & HEALTH SNAPSHOT SUMMARY', margin, y);
    y += 10;

    kpis.forEach((k, idx) => {
      const x = margin + idx * (kpiW + kpiGap);
      doc.setDrawColor(167, 243, 208);
      doc.setFillColor(246, 250, 247);
      doc.roundedRect(x, y, kpiW, kpiH, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(6, 95, 70);
      doc.text(k.label, x + 8, y + 13);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(24, 24, 27);
      doc.text(k.value.slice(0, 24), x + 8, y + 29);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(82, 82, 91);
      doc.text(k.sub.slice(0, 28), x + 8, y + 41);
    });

    y += kpiH + 10;
  }

  // Footers
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    const leftFoot = data.selectedCondition
      ? `VisitReady · ${data.selectedCondition.name} · Page ${i} of ${pageCount}`
      : `VisitReady Clinical Report · Page ${i} of ${pageCount}`;
    doc.text(leftFoot, margin, pageHeight - 16);
    const rightFoot = 'Self-reported record · For Indian emergencies call 112 / 108';
    doc.text(rightFoot, pageWidth - margin - doc.getTextWidth(rightFoot), pageHeight - 16);
  }

  return doc;
}

function symLinesLen(arr: string[]): number {
  return Math.min(3, arr.length);
}
