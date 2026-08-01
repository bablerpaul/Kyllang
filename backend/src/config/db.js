const mongoose = require('mongoose');
const env = require('./env');

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
