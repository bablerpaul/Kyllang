require('dotenv').config();

module.exports = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/certificate-portal',
    jwtSecret: process.env.JWT_SECRET || 'secret_key',
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:7545',
    privateKey: process.env.PRIVATE_KEY || '0x712fac96b41c7df01136bad90dbd1ae957ecdfc169bf88c8a59f650bc9a9f388',
    contractAddress: process.env.CONTRACT_ADDRESS || '0x4cB06b7850239d5CcDCA04FddEc75772A5a573Ec',
};
