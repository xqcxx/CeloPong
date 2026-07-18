// Normalizes boolean-like env strings (false/0) into booleans
export function readBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  // Already a boolean (e.g. passed through from non-string config)
  if (typeof value === 'boolean') {
    return value;
  }

  // Blank strings carry no intent — fall back to the default
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') {
    return defaultValue;
  }

  return normalized !== 'false' && normalized !== '0';
}
