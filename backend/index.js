require('dotenv').config();

if (!process.env.JWT_SECRET) {
    throw new Error('[CONFIG ERROR] JWT_SECRET environment variable is required but not set.');
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Initialize express app
const app = express();

// Trust Proxy Configuration (F-01 Remediation)
// Ensures req.ip correctly resolves client IPs when deployed behind a reverse proxy.
// Defaults to false (safe) when the environment variable is omitted.
if (process.env.TRUST_PROXY !== undefined) {
    const tpConfig = process.env.TRUST_PROXY.trim();
    
    if (tpConfig === '') {
        throw new Error('[CONFIG ERROR] TRUST_PROXY is empty or whitespace-only.');
    }
    
    if (tpConfig.toLowerCase() === 'true' || tpConfig.toLowerCase() === 'false') {
        throw new Error('[CONFIG ERROR] TRUST_PROXY cannot be a blanket boolean. Specify exact hop count (e.g., "1") or trusted IP subnets.');
    }

    if (/^\d+$/.test(tpConfig)) {
        // Numeric hop count (non-negative integer)
        app.set('trust proxy', parseInt(tpConfig, 10));
    } else {
        // Assume comma-separated IPs or subnets
        const ips = tpConfig.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
        if (ips.length === 0) {
            throw new Error('[CONFIG ERROR] TRUST_PROXY is malformed or empty.');
        }
        app.set('trust proxy', ips);
    }
}

const path = require('path');
const mongoSanitize = require('./middlewares/mongoSanitizeMiddleware');
const { trackMetrics } = require('./src/middlewares/metricsMiddleware');

// Security Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            connectSrc: ["'self'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' }
}));
app.use(trackMetrics);
app.use(express.json());
app.use(cookieParser()); // Parse secure cookies

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Strict CORS Policy (Phase 16.1-B Remediation)
const { csrfMiddleware, getAllowedOrigins } = require('./middlewares/csrfMiddleware');

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests, or same-origin in some browsers)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = getAllowedOrigins();
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true, // Allow cookies to be sent across origins securely now that origin is validated
}));

// Apply Anti-CSRF Middleware for Defense-in-Depth against Subdomain CSRF
app.use(csrfMiddleware);

// Global Rate Limiting
const rateLimit = require('express-rate-limit');
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Limit each IP to 5000 requests per `window` to prevent masking endpoint limiters
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Global rate limit exceeded, please try again later.' }
});
app.use(globalLimiter);


// Routes
const authRoutes = require('./routes/authRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const adminRoutes = require('./routes/adminRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const patientRoutes = require('./routes/patientRoutes');
const emrRoutes = require('./src/modules/emr/emrRoutes');
const prescriptionRoutes = require('./src/modules/prescriptions/prescriptionRoutes');
const labReportRoutes = require('./src/modules/lab/labReportRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const insuranceRoutes = require('./src/modules/insurance/insuranceRoutes');
const consentRoutes = require('./src/modules/consent/consentRoutes');
const storageRoutes = require('./src/modules/secure-storage/routes/storageRoutes');
const appointmentRoutes = require('./src/modules/scheduling/appointmentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/emr', emrRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/lab-reports', labReportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/secure-storage', storageRoutes);
app.use('/api/appointments', appointmentRoutes);

// Swagger Configuration
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load(path.join(__dirname, './docs/swagger.yaml'));

if (process.env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} else {
    app.use('/api/docs', (req, res) => res.status(404).json({ success: false, message: 'API Documentation is disabled in production' }));
}

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
// KYLLANG_V4: Merkle anchor worker — batches audit log hashes on-chain every 10 minutes
const { startMerkleAnchorWorker } = require('./src/jobs/merkleAnchorWorker');
// KYLLANG_V4: Canary scanner — scans dormant records
const { startCanaryScanner } = require('./src/jobs/canaryScanner');

// Connect to MongoDB and start server
mongoose
    .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal')
    .then(async () => {
        console.log('Connected to MongoDB');
        startBlockchainWorker(); // Start the async background queue
        startBackupWorker();     // Start the automated backup worker
        // KYLLANG_V4: Start Merkle anchor worker with blockchain contract
        const blockchainContract = require('./blockchain');
        startMerkleAnchorWorker(blockchainContract);
        // KYLLANG_V4: Start Canary scanner
        startCanaryScanner();
        const { connectRedis } = require('./src/config/redisClient');
        await connectRedis();
        if (require.main === module) {
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`Server running on port ${PORT} (0.0.0.0)`);
            });
        }
    })
    .catch((err) => {
        console.error('Failed to connect to MongoDB', err);
    });

module.exports = app;
