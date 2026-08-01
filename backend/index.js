require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Initialize express app
const app = express();

const path = require('path');

// Middlewares
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./routes/authRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const adminRoutes = require('./routes/adminRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const patientRoutes = require('./routes/patientRoutes');
const emrRoutes = require('./src/modules/emr/emrRoutes');
const prescriptionRoutes = require('./src/modules/prescriptions/prescriptionRoutes');
const labReportRoutes = require('./src/modules/lab/labReportRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const insuranceRoutes = require('./src/modules/insurance/insuranceRoutes');
const consentRoutes = require('./src/modules/consent/consentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/emr', emrRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/lab-reports', labReportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/consent', consentRoutes);

// Test route
app.get('/', (req, res) => {
    res.send('Backend Server is running');
});

// Port configuration
const PORT = process.env.PORT || 5000;

// Connect to MongoDB and start server
mongoose
    .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal')
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Failed to connect to MongoDB', err);
    });
