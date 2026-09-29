const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  try {
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB connection disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });

    await mongoose.connect(env.MONGO_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

