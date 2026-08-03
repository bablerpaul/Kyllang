const mongoose = require('mongoose');
const env = require('./env');

/**
 * connectDB
 * @description Handles operations for connectDB. Explains parameters, return values and usage.
 * @returns {Promise<void>} Resolves when the operation is complete
 */
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(env.mongoUri);
        console.log(`Connected to MongoDB: ${conn.connection.host}`);
        return conn;
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        throw err;
    }
};

module.exports = connectDB;
