# CRITICAL REGRESSION-PROTECTION REQUIREMENT
## Appointment → Automatic Assignment → EMR Workflow MUST NEVER REGRESS

Before making ANY future code changes, treat the following behavior as a MANDATORY, PROTECTED BUSINESS REQUIREMENT.
Do NOT remove, weaken, bypass, rename, or accidentally break these properties during refactoring, security hardening, UI changes, backend changes, routing changes, model changes, or cleanup.

### 1. PATIENT APPOINTMENT WORKFLOW
The Patient MUST manually select a Doctor.
The workflow MUST remain:
Patient → selects Doctor → selects valid date → selects Doctor-specific available time slot → books appointment → appointment status = `scheduled`

At booking time:
- The selected Doctor must be stored on the Appointment.
- The appointment must initially be `scheduled`.
- The Patient MUST NOT automatically be assigned to the Doctor.
- Appointment booking MUST NOT create a Consent document.
- Appointment booking MUST NOT grant EMR authorization.
IMPORTANT: BOOKING ≠ ASSIGNMENT. Do NOT reintroduce automatic assignment at booking.

### 2. DOCTOR CONFIRMATION
Only the Doctor stored on the Appointment may confirm that appointment.
The intended transition is: `scheduled` → `confirmed`
An unrelated Doctor MUST NOT be able to confirm the appointment.
The frontend must provide the Doctor with a clear `Confirm Booking` action for their own scheduled appointments.
After confirmation:
- appointment status = `confirmed`
- automatic assignment MUST occur

### 3. AUTOMATIC PATIENT-DOCTOR ASSIGNMENT
Assignment MUST happen automatically ONLY after the selected Doctor successfully confirms the appointment.
The system must maintain the existing assignment relationship: `Doctor.assignedPatients` and `Patient.assignedDoctors`
Where the existing legacy User assignment arrays are still part of the application's working model, they must remain synchronized as currently implemented.
The assignment must be:
- server-side
- based on authenticated identity and the Appointment relationship
- not based on a client-supplied "I am assigned" field
- duplicate-safe
- performed only after successful confirmation
Do NOT require Admin intervention.

### 4. EMR AUTHORIZATION
After automatic assignment, the confirming/assigned Doctor MUST be able to manage the Patient's EMR according to the existing implemented authorization model.
Assigned Doctor: Create EMR ✓, Read EMR ✓, Update EMR ✓, Delete EMR ✓
Unassigned Doctor: Create EMR ✗, Read EMR ✗, Update EMR ✗, Delete EMR ✗
A scheduled appointment WITHOUT confirmation/assignment MUST NOT provide EMR authorization.

### 5. CONSENT MUST REMAIN INDEPENDENT
DO NOT replace the Consent architecture with appointment assignment.
Do NOT automatically create Consent when confirming an appointment.
Do NOT delete or weaken: Consent scopes, Consent expiry, Consent revocation, existing active-consent authorization, existing patient consent workflows.
An unrelated Doctor with a legitimate existing Consent must continue to receive whatever access that Consent legitimately grants.

### 6. PATIENT EMR ACCESS
The Patient MUST continue to access their own EMR through the existing working route: `/dashboard/emr`
The Patient sidebar's `My Health Records` must continue to navigate to `/dashboard/emr`
Do NOT reconnect the primary Patient workflow to the legacy `/dashboard/health-records` or `/user/health-records` routes unless deliberately verified.

### 7. DOCTOR EMR VISIBILITY
The automatically assigned Doctor MUST be able to see the assigned Patient's EMRs through the existing Doctor EMR workflow.
Do NOT introduce a filter that accidentally excludes assigned patients.
Any future modification to `getAllEMRs`, `getPatientEMRs`, `getEMRById`, `createEMR`, `updateEMR`, `deleteEMR` must explicitly preserve assignment-based authorization.

### 8. FRONTEND REQUIREMENT
The frontend must continue to expose the correct workflow:
PATIENT: Select Doctor, date, slot → Book → See PENDING CONFIRMATION / scheduled
DOCTOR: See scheduled appointment → Confirm Booking → See CONFIRMED → Access Create EMR after confirmation
The frontend must NOT falsely show an EMR action before confirmation.

### 9. DATABASE MODEL REQUIREMENT
Do NOT remove or rename the fields currently required for this workflow.
Appointment: doctor, patient, appointmentDate, timeSlot, status (scheduled, confirmed, completed, cancelled, no_show)
Doctor: assignedPatients
Patient: assignedDoctors
User: existing assignment arrays required by the current implementation.

### 10. FUTURE CODE CHANGES — MANDATORY REGRESSION CHECK
Before modifying related models/controllers/routes, you MUST first inspect the existing appointment → assignment → EMR dependency chain.
After making changes, verify at minimum:
TEST A: Patient books appointment → scheduled → NO assignment
TEST B: Correct Doctor confirms → confirmed → automatic assignment
TEST C: Wrong Doctor confirms → 403 / denied → NO assignment
TEST D: Scheduled appointment → assigned Doctor authorization must NOT activate
TEST E: Confirmed + assigned Doctor → Create EMR succeeds
TEST F: Assigned Doctor → Read EMR succeeds
TEST G: Assigned Doctor → Update EMR succeeds
TEST H: Assigned Doctor → Delete EMR succeeds according to existing behavior
TEST I: Unassigned Doctor → EMR management denied
TEST J: Existing valid Consent → existing Consent behavior remains intact
TEST K: Patient → My Health Records → /dashboard/emr → own EMR data loads

### 11. FINAL REQUIREMENT
Before declaring ANY future change complete, explicitly report all properties from Requirement 14. If any fail, STOP and wait for instructions.
