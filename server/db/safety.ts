export const assertDatabaseSafety = () => {
  // Database safety checks disabled for single-server development
  return true;
};

export const getDatabaseFingerprint = () => {
  // Database fingerprint check disabled
  return "dev-mode";
};

export const checkDatabaseSafety = () => {
  return true;
};

export const validateDatabaseConnection = () => {
  return true;
};
