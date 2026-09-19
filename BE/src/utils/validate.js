const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str) {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

function requireUUID(value, name = 'ID') {
  if (!isValidUUID(value)) {
    const err = new Error(`Invalid ${name} format`);
    err.status = 400;
    err.code = 'INVALID_UUID';
    throw err;
  }
}

function validateStringField(value, name, options = {}) {
  const { required = true, maxLength, trim = true } = options;
  if (trim && typeof value === 'string') value = value.trim();
  if (required && (!value || value.length === 0)) {
    const err = new Error(`${name} is required`);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  if (maxLength && value && value.length > maxLength) {
    const err = new Error(`${name} must be ${maxLength} characters or fewer`);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return value;
}

module.exports = { isValidUUID, requireUUID, validateStringField };
