require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang_health');
    // hash for "password"
    const hash = "$2b$10$Vu/CHrVWHFul7gbURTgbw.wxvioAkR626mZX.NKJM33HuH2f/11D.";
    await User.updateMany({ email: { $in: ['doctor@test.com', 'patient@test.com'] } }, { password: hash });
    console.log('Updated');
    process.exit(0);
}
run();
