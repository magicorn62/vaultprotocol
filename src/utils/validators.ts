// Input validation utilities
export const Validators = {
  validatePassword: (password: string | null): boolean => {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 8) return false;
    return true;
  },

  validateAddress: (address: string | null): boolean => {
    return (
      typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address)
    );
  },

  validateJWT: (jwt: string | null): boolean => {
    if (!jwt || typeof jwt !== 'string') return false;
    return jwt.trim().length > 20;
  },

  validateFileSize: (file: File | null, maxSize: number): boolean => {
    return file !== null && file.size <= maxSize;
  },

  validateCID: (cid: string | null): boolean => {
    if (!cid || typeof cid !== 'string') return false;
    return cid.trim().length > 0;
  },

  validateHex: (hex: string | null): boolean => {
    if (!hex || typeof hex !== 'string') return false;
    return /^[a-fA-F0-9]*$/.test(hex) && hex.length % 2 === 0;
  },
};
