class NotificationService {
    constructor() {
        this.notifications = [];
    }

    /**
     * Dispatch instantaneous cryptographic access alerts.
     */
    async dispatchEmergencyDeclared(patientId, doctorAddress, sessionId, hospitalId = "General Hospital") {
        const message = `[CRITICAL ALERT] Emergency Break-Glass access declared for your EMR by Doctor ${doctorAddress} at ${hospitalId}. Session: ${sessionId}`;
        console.log(`\n🔔 NOTIFICATION DISPATCHED (SMS/Push): ${message}`);
        
        this.notifications.push({
            type: 'EMERGENCY_DECLARED',
            patientId,
            message,
            timestamp: new Date()
        });
    }

    async dispatchCustodianAttested(sessionId, custodianAddress) {
        const message = `[AUDIT ALERT] Custodian ${custodianAddress} has attested the release of an emergency share for Session: ${sessionId}`;
        console.log(`\n🔔 NOTIFICATION DISPATCHED (Log): ${message}`);
        
        this.notifications.push({
            type: 'CUSTODIAN_ATTESTED',
            sessionId,
            message,
            timestamp: new Date()
        });
    }
    
    async dispatchEmergencyDecrypted(sessionId) {
        const message = `[CRITICAL ALERT] EMR has been decrypted and streamed for Session: ${sessionId}. Access is temporary and heavily monitored.`;
        console.log(`\n🔔 NOTIFICATION DISPATCHED (SMS/Push): ${message}`);
        
        this.notifications.push({
            type: 'EMERGENCY_DECRYPTED',
            sessionId,
            message,
            timestamp: new Date()
        });
    }

    getNotificationsForPatient(patientId) {
        return this.notifications.filter(n => n.patientId === patientId);
    }
}

module.exports = new NotificationService();
