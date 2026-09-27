// Lab & Diagnostic investigation catalog (T10-L7).
//
// Category → Type → Specific Test → field template. The Category/Type names mirror the backend taxonomy in
// backend/src/modules/lab/labInvestigationCatalog.js (investigationCategory / testCategory); the specific test is sent as
// `testName`. A template only decides which inputs the form shows:
//   parameters  — prefilled result rows { parameter, unit } → LabReport.results[]
//   customRows  — the doctor may add further result rows (LFT/KFT, cultures, PCR targets, …)
//   details     — which generic narrative sections to show, with a per-test label → LabReport.reportDetails
// Every field is optional; blank rows/sections are simply not sent.

export const OTHER_TEST = '__other__';

// Generic narrative sections (backend REPORT_DETAIL_KEYS) with their default labels.
export const DETAIL_LABELS = {
  specimen: 'Specimen',
  bodyRegion: 'Body Region',
  clinicalIndication: 'Clinical Indication',
  findings: 'Findings',
  impression: 'Impression',
  diagnosis: 'Diagnosis',
  interpretation: 'Interpretation',
};
export const DETAIL_KEYS = Object.keys(DETAIL_LABELS);

const d = (key, label) => ({ key, label: label || DETAIL_LABELS[key] });
const p = (parameter, unit = '') => ({ parameter, unit });

// ── Reusable templates ──────────────────────────────────────────────────────────────────────────────────────────────
const T = {
  cbc: {
    parameters: [
      p('Hemoglobin', 'g/dL'), p('WBC Count', '×10³/µL'), p('RBC Count', '×10⁶/µL'), p('Platelet Count', '×10³/µL'),
      p('Hematocrit', '%'), p('MCV', 'fL'), p('MCH', 'pg'), p('MCHC', 'g/dL'),
    ],
    customRows: true,
    details: [d('interpretation')],
  },
  single: (parameter, unit) => ({ parameters: [p(parameter, unit)], customRows: false, details: [d('interpretation')] }),
  panel: (params) => ({ parameters: params, customRows: true, details: [d('interpretation')] }),
  urineRoutine: {
    parameters: [
      p('Colour'), p('Appearance'), p('pH'), p('Specific Gravity'), p('Protein'), p('Glucose'), p('Ketones'), p('Blood'),
    ],
    customRows: true,
    details: [d('findings', 'Microscopy'), d('interpretation')],
  },
  culture: {
    parameters: [],
    customRows: true,
    rowHint: 'e.g. antibiotic → S / I / R',
    details: [d('specimen'), d('findings', 'Culture Findings / Organism Isolated'), d('interpretation')],
  },
  pathology: {
    parameters: [],
    customRows: false,
    details: [d('specimen'), d('clinicalIndication', 'Clinical Information'), d('findings'), d('diagnosis'), d('interpretation')],
  },
  molecular: {
    parameters: [],
    customRows: true,
    rowHint: 'e.g. target / gene → Detected / Not detected',
    details: [d('specimen'), d('findings'), d('interpretation')],
  },
  ecg: {
    parameters: [p('Heart Rate', 'bpm'), p('Rhythm'), p('PR Interval', 'ms'), p('QRS Duration', 'ms'), p('QT/QTc', 'ms')],
    customRows: false,
    details: [d('findings'), d('interpretation')],
  },
  imaging: {
    parameters: [],
    customRows: false,
    details: [d('bodyRegion'), d('clinicalIndication'), d('findings'), d('impression')],
  },
  otherDiagnostic: {
    parameters: [],
    customRows: true,
    details: [d('clinicalIndication'), d('findings'), d('impression'), d('interpretation')],
  },
};

// ── Catalog ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Each type has `tests` and a `fallback` template used for "Other (specify)".
export const INVESTIGATION_CATALOG = {
  Laboratory: {
    Hematology: {
      fallback: T.panel([]),
      tests: {
        'Complete Blood Count (CBC)': T.cbc,
        Hemoglobin: T.single('Hemoglobin', 'g/dL'),
        'Erythrocyte Sedimentation Rate (ESR)': T.single('ESR', 'mm/hr'),
        'Platelet Count': T.single('Platelet Count', '×10³/µL'),
      },
    },
    Biochemistry: {
      fallback: T.panel([]),
      tests: {
        'Blood Glucose': T.single('Blood Glucose', 'mg/dL'),
        'Liver Function Test (LFT)': T.panel([
          p('Total Bilirubin', 'mg/dL'), p('Direct Bilirubin', 'mg/dL'), p('AST (SGOT)', 'U/L'), p('ALT (SGPT)', 'U/L'),
          p('Alkaline Phosphatase', 'U/L'), p('Total Protein', 'g/dL'), p('Albumin', 'g/dL'),
        ]),
        'Kidney Function Test (KFT)': T.panel([
          p('Blood Urea', 'mg/dL'), p('Serum Creatinine', 'mg/dL'), p('Uric Acid', 'mg/dL'),
          p('Sodium', 'mmol/L'), p('Potassium', 'mmol/L'), p('Chloride', 'mmol/L'),
        ]),
        'Lipid Profile': T.panel([
          p('Total Cholesterol', 'mg/dL'), p('Triglycerides', 'mg/dL'), p('HDL Cholesterol', 'mg/dL'),
          p('LDL Cholesterol', 'mg/dL'), p('VLDL Cholesterol', 'mg/dL'),
        ]),
      },
    },
    Urinalysis: {
      fallback: T.urineRoutine,
      tests: {
        'Routine Urine Examination': T.urineRoutine,
        'Urine Culture': T.culture,
      },
    },
    Microbiology: {
      fallback: T.culture,
      tests: {
        'Blood Culture': T.culture,
        'Urine Culture': T.culture,
        'Swab Culture': T.culture,
      },
    },
    Pathology: {
      fallback: T.pathology,
      tests: {
        Histopathology: T.pathology,
        Biopsy: T.pathology,
        Cytology: T.pathology,
      },
    },
    'Molecular / Genetic': {
      fallback: T.molecular,
      tests: {
        'PCR Test': T.molecular,
        'Molecular Diagnostic Test': T.molecular,
        'Genetic Test': T.molecular,
      },
    },
  },
  Diagnostic: {
    ECG: {
      fallback: T.ecg,
      tests: { '12-Lead Resting ECG': T.ecg },
    },
    'X-Ray': {
      fallback: T.imaging,
      tests: { 'Chest X-Ray': T.imaging, 'X-Ray Spine': T.imaging, 'X-Ray Extremity': T.imaging },
    },
    Ultrasound: {
      fallback: T.imaging,
      tests: { 'Ultrasound Abdomen': T.imaging, 'Ultrasound Pelvis': T.imaging, 'Obstetric Ultrasound': T.imaging },
    },
    'CT Scan': {
      fallback: T.imaging,
      tests: { 'CT Head / Brain': T.imaging, 'CT Chest': T.imaging, 'CT Abdomen & Pelvis': T.imaging },
    },
    MRI: {
      fallback: T.imaging,
      tests: { 'MRI Brain': T.imaging, 'MRI Spine': T.imaging, 'MRI Knee': T.imaging },
    },
    'Other Diagnostic': {
      fallback: T.otherDiagnostic,
      tests: {
        Echocardiogram: T.otherDiagnostic,
        'Electroencephalogram (EEG)': T.otherDiagnostic,
        'Pulmonary Function Test (PFT)': T.otherDiagnostic,
      },
    },
  },
};

export const INVESTIGATION_CATEGORIES = Object.keys(INVESTIGATION_CATALOG);

// Pre-T10-L7 testCategory values (still returned for older records) → investigation category.
const LEGACY_CATEGORY = {
  'Blood Test': 'Laboratory',
  'Urine Test': 'Laboratory',
  'General Pathology': 'Laboratory',
  'X-ray': 'Diagnostic',
};

export const typesFor = (category) => Object.keys(INVESTIGATION_CATALOG[category] || {});
export const testsFor = (category, type) => Object.keys(INVESTIGATION_CATALOG[category]?.[type]?.tests || {});

// Template for a (category, type, test). Unknown / "Other" tests get the type's fallback template.
export const templateFor = (category, type, testName) => {
  const entry = INVESTIGATION_CATALOG[category]?.[type];
  if (!entry) return null;
  return entry.tests[testName] || entry.fallback;
};

// Investigation category of a stored report: the stored value, else derived from its testCategory (legacy records).
export const categoryOfReport = (report) => {
  if (report?.investigationCategory) return report.investigationCategory;
  const tc = report?.testCategory;
  for (const cat of INVESTIGATION_CATEGORIES) if (INVESTIGATION_CATALOG[cat][tc]) return cat;
  return LEGACY_CATEGORY[tc] || null;
};

// Display label for a stored report's narrative section — the test template's label when known, else the generic one.
export const detailLabelFor = (report, key) => {
  const tpl = templateFor(categoryOfReport(report), report?.testCategory, report?.testName);
  return tpl?.details.find((x) => x.key === key)?.label || DETAIL_LABELS[key];
};

export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const ATTACHMENT_TYPES_LABEL = 'PDF / JPG / JPEG / PNG';
