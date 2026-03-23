const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY || 'supersecretkey';

const hashPassword = (password) => bcrypt.hashSync(password, 10);
const verifyPassword = (password, hash) => bcrypt.compareSync(password, hash);

const createToken = (email) => {
  return jwt.sign({ email }, SECRET_KEY, { expiresIn: '24h' });
};

const decodeToken = (token) => {
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    return decoded.email;
  } catch (err) {
    return null;
  }
};

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  decodeToken
};
