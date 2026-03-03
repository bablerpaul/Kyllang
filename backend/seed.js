const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal');

        // Clear existing
        await User.deleteMany({});

        // Demo Accounts
        const users = [
            {
                name: 'Admin User',
                email: 'admin@hospital.com',
                password: 'password123',
                role: 'hospital_admin'
            },
            {
                name: 'Dr. Smith',
                email: 'doctor@hospital.com',
                password: 'password123',
                role: 'doctor',
                specialty: 'General Physician'
            },
            {
                name: 'General User',
                email: 'user@hospital.com',
                password: 'password123',
                role: 'general_user'
            }
        ];

        for (const user of users) {
            await User.create(user);
        }
        console.log('Database seeded with properly hashed Demo Users!');
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

seedData();
