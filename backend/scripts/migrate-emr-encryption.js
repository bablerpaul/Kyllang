require('dotenv').config();
const mongoose = require('mongoose');
const MedicalRecord = require('../models/MedicalRecord');
const encryptionService = require('../src/utils/encryptionService');

// MongoDB connection URI
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal';

async function migrateEMRs() {
    try {
        console.log(`Connecting to MongoDB at ${mongoUri}...`);
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB.');

        // Get all MedicalRecords, bypassing mongoose getters to read raw data
        const emrs = await MedicalRecord.find().exec();
        console.log(`Found ${emrs.length} EMR records to process.`);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const emr of emrs) {
            try {
                emr.markModified('diagnosis');
                emr.markModified('symptoms');
                emr.markModified('vitalSigns');
                emr.markModified('vitals');
                emr.markModified('allergies');
                emr.markModified('medications');
                emr.markModified('clinicalNotes');
                emr.markModified('chiefComplaint');
                emr.markModified('treatmentPlan');

                await emr.save();
                migratedCount++;
                console.log(`Migrated EMR ${emr._id}`);
            } catch (err) {
                errorCount++;
                console.error(`Error migrating EMR ${emr._id}:`, err.message);
            }
        }

        console.log('--- Migration Summary ---');
        console.log(`Total Records: ${emrs.length}`);
        console.log(`Successfully Migrated: ${migratedCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (err) {
        console.error('Fatal error during migration:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

migrateEMRs();
