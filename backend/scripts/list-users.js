require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/kyllang_health');
    const users = await User.find();
    console.log(users.map(u => u.email + ' - ' + u.role));
    process.exit(0);
}
run();
