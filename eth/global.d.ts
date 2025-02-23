namespace NodeJS {
  interface ProcessEnv {
    PORT: string;
    MONGODB_URI: string;
    JWT_SECRET: string;
    ENCRYPTION_KEY: string;
    BLOCKCHAIN_RPC_URL: string;
    SOLANA_RPC_URL: string;
  }
}
