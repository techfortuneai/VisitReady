# VisitReady — Symptom Journal & Healthcare Appointment Prep

VisitReady is a mobile-first, full-stack web application designed for personal symptom recordkeeping and clinical appointment preparation. It empowers individuals and family caregivers to accurately record health observations and generate clear, printable summaries for healthcare visits.

---

## ⚠️ Product Purpose & Medical Safety Notice

- **Personal Recordkeeping Only:** VisitReady is designed exclusively for personal tracking and appointment prep.
- **No Diagnosis or Triage:** The application never diagnoses conditions, estimates disease risks, interprets symptoms, recommends medication/treatment, or claims to replace a clinician.
- **Emergency Disclaimer:** *VisitReady is not for emergencies and does not provide medical advice or diagnosis. If you believe you may be experiencing an emergency, contact local emergency services (e.g., 911) or seek urgent care immediately.*
- **No AI Clinical Inferences:** No AI models infer diagnoses or predict diseases. All information presented in summaries reflects self-reported patient observations.

---

## ✨ Key Features

1. **Patient & Family Profiles (Multiple People Support)**
   - Record and organize records for multiple individuals (Self, Child, Spouse, Parent, Relative, Friend).
   - Easily switch between profiles with separate symptom histories and conditions.

2. **Multi-Disease & Chronic Condition Management**
   - Track multiple diagnoses (e.g. Migraines, Asthma, Type 2 Diabetes, Hypertension).
   - Tag symptoms with one or more conditions to streamline specialist consultations.

3. **Rich Symptom Logging & Home Vitals**
   - Searchable symptom catalog and body location selectors.
   - Self-rated 0–10 severity slider with descriptive plain-language anchors.
   - Separate recording of facts (date, duration) vs. observations (triggers, context, relief notes).
   - Optional home vitals: Blood Pressure (systolic/diastolic mmHg), Pulse (BPM), Temperature (°F/°C), Blood Glucose (mg/dL), Oxygen SpO2 (%), and Weight.
   - Attachment scans (reports, prescriptions, photos) with sensitive data advisory notices.

4. **Clinician Visit Preparation & Printable Summaries**
   - Filter symptoms by date range (7, 14, 30, 60 days, or all).
   - Associate with upcoming doctor appointments.
   - Generate clinical-ready summaries with chronological symptoms, home vitals, customizable doctor questions, and a blank lined notepad for clinician notes.
   - Print with tailored `@media print` layout, download as clean multi-page PDF (via `jsPDF`), or export selected records as CSV.

5. **Neutral Trend Visualizations**
   - View recorded entries and self-reported severity over time.
   - View home vitals recordings chronologically.
   - Screen-reader accessible text tables for every visual chart.
   - Explicit disclaimer that trends represent logged entries without clinical correlation inferences.

6. **Care Team & Family Sharing**
   - Invite family members, caregivers, or doctors with granular permissions (`Viewer`, `Editor`, `Doctor / Care Team`).
   - Secure passcodes for care circle access.

7. **Data Privacy, Export & Permanent Deletion**
   - Machine-readable JSON backup and CSV spreadsheet exports.
   - Strict record ownership checks on all server operations.
   - Full cascade account deletion with confirmation phrase (`DELETE MY ACCOUNT AND HEALTH RECORDS`).

8. **Fictional Demo Mode**
   - Pre-populated realistic patient profile (Sarah Jenkins, 42, managing Migraines & Asthma) with fictional entries, vitals, upcoming appointments, and visit summaries.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, jsPDF
- **Backend:** Node.js, Express, TSX, native Node.js PBKDF2 cryptography
- **Persistence:** High-performance, indexed JSON storage engine with cascade deletion and user isolation
- **Automated Tests:** Built-in test suite covering authentication, record isolation, CRUD, search, filtering, summaries, and cascade account deletion

---

## 🚀 Setup & Development

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Starts the full-stack Express server on `http://localhost:3000` with integrated Vite middleware.

### Run Automated Tests
```bash
npm test
```
Executes the comprehensive automated test suite verifying auth, record ownership, CRUD, filtering, export, and account deletion.

### Production Build
```bash
npm run build
npm start
```

---

## 🔒 Security & Privacy Considerations Checklist

- [x] **Strict Authentication:** Authentication required before accessing or saving personal health records.
- [x] **User Isolation & Ownership Enforcement:** Every database query checks `user_id === req.user.id`. User B can never read or mutate User A's data.
- [x] **No Ad Trackers:** Zero third-party advertising SDKs, marketing trackers, or telemetry.
- [x] **No Data Selling:** Personal health entries are never sold, rented, or repurposed.
- [x] **Password Protection:** Passwords securely hashed with salted PBKDF2 (SHA-512, 10,000 iterations).
- [x] **Session Handling:** Secure Bearer session tokens with automatic expiration.
- [x] **Safe Document Storage:** Size and MIME validation for report uploads with user warnings.
- [x] **Complete Data Portability:** Instant JSON and CSV export for personal archiving.
- [x] **Right to Erasure (Account Deletion):** Permanent cascade deletion wiping all user records, profiles, symptoms, vitals, and appointments upon confirmation.
