const mongoose = require('mongoose');
const User = require('./models/User');
const Doctor = require('./models/Doctor');

mongoose.connect('mongodb://localhost:27017/certificate-portal').then(async () => {
    let user = await User.findOne({ role: 'doctor' });
    if (!user) {
        user = new User({
            name: 'Dr. Jane Smith',
            email: 'jane.smith@hospital.com',
            password: 'password123', // In a real app this would be hashed, but for seed it's fine or we should hash it
            role: 'doctor',
            isVerified: true
        });
        await user.save();
    }
    
    let doc = await Doctor.findOne({ user: user._id });
    if (!doc) {
        doc = new Doctor({
            user: user._id,
            specialty: 'Cardiologist',
            hospital: 'General Hospital',
            licenseNumber: 'MD123456',
            verificationStatus: 'verified'
        });
        await doc.save();
    }
    console.log('Doctor created or already exists!');
    process.exit(0);
}).catch(console.error);
