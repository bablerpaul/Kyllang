const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kyllang')
  .then(async () => {
    const AuditLog = require('./models/AuditLog');
    const logs = await AuditLog.find({ action: 'BREAK_GLASS_ACTIVATED' }).sort({ createdAt: -1 }).limit(1);
    if (logs.length > 0) {
      console.log('AUDIT LOG FOUND:', logs[0].action);
      console.log('TIMESTAMP:', logs[0].createdAt);
      console.log('DETAILS:', logs[0].details);
    } else {
      console.log('No BREAK_GLASS_ACTIVATED audit logs found.');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
