const crypto = require('crypto');

/**
 * Generate secure random temporary password
 * Format: Combination of uppercase, lowercase, numbers, and special characters (e.g. Nuf@7Kp92x)
 * @param {number} length - Length of password (default 10)
 * @returns {string} Secure random temporary password
 */
const generateTempPassword = (length = 10) => {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%^&*';
  const all = uppercase + lowercase + numbers + special;

  // Ensure at least one character from each character set
  const randomBytes = crypto.randomBytes(length * 2);
  const passwordArray = [
    uppercase[randomBytes[0] % uppercase.length],
    lowercase[randomBytes[1] % lowercase.length],
    numbers[randomBytes[2] % numbers.length],
    special[randomBytes[3] % special.length],
  ];

  for (let i = 4; i < length; i++) {
    passwordArray.push(all[randomBytes[i] % all.length]);
  }

  // Fisher-Yates shuffle using crypto random numbers
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = randomBytes[length + i] % (i + 1);
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }

  return passwordArray.join('');
};

module.exports = {
  generateTempPassword,
};
