// Environment Configuration
// This file loads and validates environment variables from .env

export const config = {
  // Blockchain
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || '0x32bE97ea1D57e85279f00FCF61063B1e09366af4',
  chainId: parseInt(import.meta.env.VITE_CHAIN_ID || '80002'),
  networkName: import.meta.env.VITE_NETWORK_NAME || 'Hedera Testnet',

  // IPFS/Pinata
  pinataGatewayUrl: import.meta.env.VITE_PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs',
  pinataApiUrl: 'https://api.pinata.cloud/pinning/pinFileToIPFS',

  // Crypto
  pbkdf2Iterations: parseInt(import.meta.env.VITE_PBKDF2_ITERATIONS || '600000'),
  maxFileSize: parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '104857600'), // 100MB

  // Session
  sessionTimeoutMs: parseInt(import.meta.env.VITE_SESSION_TIMEOUT_MS || '3600000'),
  rateLimitMs: parseInt(import.meta.env.VITE_RATE_LIMIT_MS || '1000'),
  statusToastDurationMs: parseInt(import.meta.env.VITE_STATUS_TOAST_DURATION_MS || '4000'),

  // Logging
  logErrors: import.meta.env.VITE_LOG_ERRORS === 'true',

  // Environment
  env: import.meta.env.VITE_APP_ENV || 'development',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
};

// Validate critical config
export function validateConfig(): void {
  if (!config.contractAddress) {
    throw new Error('VITE_CONTRACT_ADDRESS is required');
  }
  if (config.contractAddress.length !== 42) {
    throw new Error('Invalid contract address format');
  }
}
