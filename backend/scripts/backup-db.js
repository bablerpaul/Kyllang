const mongoose = require('mongoose');
const fs = require('fs');

async function backup() {
    await mongoose.connect('mongodb://localhost:27017/certificate-portal');
    const docs = await mongoose.connection.db.collection('medicalrecords').find({}).toArray();
    fs.writeFileSync('db-backup-medicalrecords.json', JSON.stringify(docs, null, 2));
    console.log(`Backup completed successfully. ${docs.length} records backed up.`);
    await mongoose.disconnect();
}

backup().catch(console.error);
