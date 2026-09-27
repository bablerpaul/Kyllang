/**
 * Lab & Diagnostic investigation taxonomy (T10-L7).
 * @module modules/lab/labInvestigationCatalog
 * @description Single backend source of truth for the two-level classification of a LabReport:
 *   investigationCategory ('Laboratory' | 'Diagnostic')  →  testCategory (the investigation TYPE, e.g. 'Hematology').
 * The specific test lives in `testName` (free text). Field templates per test are a UI concern and live in the frontend
 * catalog; the backend only validates the classification and the generic narrative keys.
 *
 * LEGACY_TEST_CATEGORIES are the pre-T10-L7 values. They stay valid so existing documents keep validating on save and
 * existing API clients keep working; the redesigned UI no longer offers them.
 */

const INVESTIGATION_CATEGORIES = ['Laboratory', 'Diagnostic'];

const INVESTIGATION_TYPES = {
    Laboratory: ['Hematology', 'Biochemistry', 'Urinalysis', 'Microbiology', 'Pathology', 'Molecular / Genetic'],
    Diagnostic: ['ECG', 'X-Ray', 'Ultrasound', 'CT Scan', 'MRI', 'Other Diagnostic'],
};

// Pre-T10-L7 values → the investigation category they belong to. 'Other' has no determinable category (null).
// 'ECG', 'CT Scan', 'MRI' and 'Ultrasound' are unchanged in the new taxonomy and therefore are not listed here.
const LEGACY_TEST_CATEGORIES = {
    'Blood Test': 'Laboratory',
    'Urine Test': 'Laboratory',
    'General Pathology': 'Laboratory',
    'X-ray': 'Diagnostic',
    'Other': null,
};

const CURRENT_TEST_CATEGORIES = [...INVESTIGATION_TYPES.Laboratory, ...INVESTIGATION_TYPES.Diagnostic];
const ALL_TEST_CATEGORIES = [...CURRENT_TEST_CATEGORIES, ...Object.keys(LEGACY_TEST_CATEGORIES)];

// Generic narrative keys shared by every investigation. Tests relabel them in the UI (e.g. pathology's clinicalIndication
// is shown as "Clinical Information", urinalysis' findings as "Microscopy") instead of adding modality-specific fields.
const REPORT_DETAIL_KEYS = ['specimen', 'bodyRegion', 'clinicalIndication', 'findings', 'impression', 'diagnosis', 'interpretation'];

/**
 * categoryForTestCategory
 * @param {string} testCategory
 * @returns {'Laboratory'|'Diagnostic'|null} the investigation category a type belongs to; null when unknown / legacy 'Other'
 */
const categoryForTestCategory = (testCategory) => {
    for (const cat of INVESTIGATION_CATEGORIES) {
        if (INVESTIGATION_TYPES[cat].includes(testCategory)) return cat;
    }
    return Object.prototype.hasOwnProperty.call(LEGACY_TEST_CATEGORIES, testCategory) ? LEGACY_TEST_CATEGORIES[testCategory] : null;
};

module.exports = {
    INVESTIGATION_CATEGORIES,
    INVESTIGATION_TYPES,
    LEGACY_TEST_CATEGORIES,
    CURRENT_TEST_CATEGORIES,
    ALL_TEST_CATEGORIES,
    REPORT_DETAIL_KEYS,
    categoryForTestCategory,
};
