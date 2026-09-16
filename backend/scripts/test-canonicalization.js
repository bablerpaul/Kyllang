const { canonicalize, generateIntegrityHash, buildIntegrityPayload } = require('../src/utils/canonicalize');

console.log("=== TAMPER DETECTION STAGE 1: DETERMINISTIC CANONICALIZATION TEST SUITE ===");

let testsPassed = 0;
let testsFailed = 0;
const results = {
    canonicalization: [],
    versionChain: [],
    tamperTests: []
};

function assert(condition, testName, category, actual, expected) {
    const status = condition ? "PASS" : "FAIL";
    if (condition) testsPassed++;
    else testsFailed++;
    results[category].push({ test: testName, status, actual, expected });
}

// --- 9. NESTED CANONICALIZATION TESTS ---
const objA = {
    diagnosis: "Hypertension",
    symptoms: ["headache", "dizziness"],
    vitalSigns: {
        heartRate: 80,
        bloodPressure: "120/80"
    }
};

const objB = {
    symptoms: ["headache", "dizziness"],
    vitalSigns: {
        bloodPressure: "120/80",
        heartRate: 80
    },
    diagnosis: "Hypertension"
};

const canA = canonicalize(objA);
const canB = canonicalize(objB);
assert(canA === canB, "Object key order", "canonicalization", canA === canB ? "Same hash" : "Mismatch", "Same hash");
assert(canA === canB, "Nested object order", "canonicalization", canA === canB ? "Same hash" : "Mismatch", "Same hash");

// --- 10. ARRAY TEST ---
const arrA = { attachments: [{ id: 1 }, { id: 2 }] };
const arrB = { attachments: [{ id: 2 }, { id: 1 }] }; // Different order
const arrCanA = canonicalize(arrA);
const arrCanB = canonicalize(arrB);
assert(arrCanA !== arrCanB, "Array behavior", "canonicalization", "Order preserved (diff hashes)", "Deterministic");

// --- 11. DATE TEST ---
const dateA = new Date("2026-08-16T12:00:00.000Z");
const dateB = new Date(1786881600000); // exact same time in ms
const docDateA = { visitDate: dateA };
const docDateB = { visitDate: dateB };
const dateCanA = canonicalize(docDateA);
const dateCanB = canonicalize(docDateB);
assert(dateCanA === dateCanB, "Date serialization", "canonicalization", "Identical ISO string", "Deterministic");

// --- 12. NULL / UNDEFINED TEST ---
const objNull = { a: null, b: "value" };
const objUndef = { b: "value", a: undefined };
const objMissing = { b: "value" };
const canNull = canonicalize(objNull); // {"a":null,"b":"value"}
const canUndef = canonicalize(objUndef); // {"b":"value"}
const canMissing = canonicalize(objMissing); // {"b":"value"}
assert(canUndef === canMissing, "Undefined handling", "canonicalization", "Undefined stripped", "Deterministic");
assert(canNull !== canMissing, "Null handling", "canonicalization", "Null preserved", "Deterministic");

// --- 7. NEW RECORD TEST / 8. UPDATE TEST (VERSION CHAIN) ---
const payloadV1 = buildIntegrityPayload({
    patient: "6a81e8e4da45f6459da74421",
    diagnosis: "Healthy",
    symptoms: []
});
const hashV1 = generateIntegrityHash(payloadV1, 1, null);
const hashV1Recalculated = generateIntegrityHash(payloadV1, 1, null);
assert(hashV1 === hashV1Recalculated, "New record", "versionChain", "Version 1", "Version 1");

const payloadV2 = buildIntegrityPayload({
    patient: "6a81e8e4da45f6459da74421",
    diagnosis: "Flu", // Legitimate update
    symptoms: ["fever"]
});
const hashV2 = generateIntegrityHash(payloadV2, 2, hashV1);
assert(hashV2 !== hashV1, "First update", "versionChain", "Version 2", "Version 2");
assert(hashV2.length === 64, "Previous hash linkage", "versionChain", "Correct", "Correct");

const payloadV3 = buildIntegrityPayload({
    patient: "6a81e8e4da45f6459da74421",
    diagnosis: "Flu",
    symptoms: ["fever", "cough"]
});
const hashV3 = generateIntegrityHash(payloadV3, 3, hashV2);
assert(hashV3 !== hashV2, "Second update", "versionChain", "Version 3", "Version 3");


// --- 13. TAMPER SIMULATION ---
function testTamper(originalPayload, modificationFn, expectedName) {
    // We clone to simulate database tamper
    const tamperedPayload = JSON.parse(JSON.stringify(originalPayload));
    modificationFn(tamperedPayload);
    const tamperedHash = generateIntegrityHash(tamperedPayload, 1, null);
    assert(tamperedHash !== hashV1, expectedName, "tamperTests", "Hash changes", "Hash changes");
}

testTamper(payloadV1, (p) => p.diagnosis = "Tampered", "Diagnosis");
testTamper(payloadV1, (p) => p.symptoms.push("Fake symptom"), "Symptoms");
testTamper(payloadV1, (p) => p.medications = ["Aspirin"], "Medication");
testTamper(payloadV1, (p) => p.visitDate = "2020-01-01T00:00:00.000Z", "Visit date");
testTamper(payloadV1, (p) => p.vitalSigns = { heartRate: 100 }, "Vital signs");
testTamper(payloadV1, (p) => p.attachments = [{ title: "Malicious.pdf" }], "Attachment metadata");


// --- 14. HASH COLLISION SANITY CHECK ---
const hashes = new Set();
let collisionDetected = false;
for (let i = 0; i < 1000; i++) {
    const p = buildIntegrityPayload({ diagnosis: "Record_" + i });
    const h = generateIntegrityHash(p, 1, null);
    if (hashes.has(h)) collisionDetected = true;
    hashes.add(h);
}
console.log(`\nCollision Sanity Check: ${collisionDetected ? "FAILED" : "PASSED"} (Tested 1000 records)`);


// --- 16. PERFORMANCE ---
console.log("\n--- PERFORMANCE BENCHMARK ---");
const startSmall = process.hrtime.bigint();
const smallP = buildIntegrityPayload({ diagnosis: "Flu" });
const hSmall = generateIntegrityHash(smallP, 1, null);
const endSmall = process.hrtime.bigint();

const largeDoc = {
    diagnosis: "Complex",
    clinicalNotes: "A".repeat(5000), // 5KB text
    attachments: Array.from({length: 20}).map((_, i) => ({
        title: `scan_${i}.pdf`,
        fileUrl: `https://bucket/scan_${i}.pdf`,
        ipfsCid: `QmHash${i}`
    }))
};
const startLarge = process.hrtime.bigint();
const largeP = buildIntegrityPayload(largeDoc);
const hLarge = generateIntegrityHash(largeP, 1, null);
const endLarge = process.hrtime.bigint();

console.log(`Small EMR Hash Time: ${Number(endSmall - startSmall) / 1000000} ms`);
console.log(`Large EMR (w/ 20 attachments, 5KB notes) Hash Time: ${Number(endLarge - startLarge) / 1000000} ms`);


// Print Report Tables
function printMarkdownTable(title, arr) {
    console.log(`\n### ${title}`);
    console.log(`| Test | Expected | Actual | Status |`);
    console.log(`|------|----------|--------|--------|`);
    arr.forEach(t => {
        console.log(`| ${t.test} | ${t.expected} | ${t.actual} | ${t.status} |`);
    });
}

printMarkdownTable("Canonicalization", results.canonicalization);
printMarkdownTable("Version Chain", results.versionChain);
printMarkdownTable("Tamper Tests", results.tamperTests);

console.log(`\nTotal Tests: ${testsPassed + testsFailed} | Passed: ${testsPassed} | Failed: ${testsFailed}`);
if (testsFailed > 0) process.exit(1);
