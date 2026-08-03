require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Initialize express app
const app = express();

const path = require('path');
const mongoSanitize = require('./middlewares/mongoSanitizeMiddleware');
const { trackMetrics } = require('./src/middlewares/metricsMiddleware');

// Security Middlewares
app.use(helmet()); // Sets HTTP security headers (CSP, X-Frame-Options, etc.)
app.use(trackMetrics);
app.use(express.json());
app.use(cookieParser()); // Parse secure cookies

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Strict CORS Policy
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies to be sent across origins
}));

// Global Rate Limiting
const rateLimit = require('express-rate-limit');
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Global rate limit exceeded, please try again later.' }
});
app.use(globalLimiter);
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
const storageRoutes = require('./src/modules/secure-storage/routes/storageRoutes');

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
app.use('/api/secure-storage', storageRoutes);

// Swagger Configuration
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load(path.join(__dirname, './docs/swagger.yaml'));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Test route
app.get('/', (req, res) => {
    res.send('Backend Server is running');
});

const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

// Port configuration
const PORT = process.env.PORT || 5000;

const { startBlockchainWorker } = require('./src/jobs/blockchainWorker');
const { startBackupWorker } = require('./src/jobs/backupWorker');

// Connect to MongoDB and start server
mongoose
    .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal')
    .then(async () => {
        console.log('Connected to MongoDB');
        startBlockchainWorker(); // Start the async background queue
        startBackupWorker();     // Start the automated backup worker
        const { connectRedis } = require('./src/config/redisClient');
        await connectRedis();
        if (require.main === module) {
            app.listen(PORT, () => {
                console.log(`Server running on port ${PORT}`);
            });
        }
    })
    .catch((err) => {
        console.error('Failed to connect to MongoDB', err);
    });

module.exports = app;
