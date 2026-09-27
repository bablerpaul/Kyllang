require('dotenv').config();

if (!process.env.PRIVATE_KEY) {
    throw new Error('[CONFIG ERROR] PRIVATE_KEY environment variable is required but not set. The application cannot start without a configured blockchain wallet key.');
}

module.exports = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal',
    jwtSecret: process.env.JWT_SECRET,
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:7545',
    privateKey: process.env.PRIVATE_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS || '0xDA0bab807633f07f013f94DD0E6A4F96F8742B53',
};
