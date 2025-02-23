import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

interface ENV {
  PORT: number | undefined;
  MONGO_URI: string | undefined;
  JWT_SECRET: string | undefined;
  ENCRYPTION_KEY: string | undefined;
  BLOCKCHAIN_RPC_URL: string | undefined;
  SOLANA_RPC_URL: string | undefined;
}

interface Config {
  PORT: number;
  MONGO_URI: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  BLOCKCHAIN_RPC_URL: string;
  SOLANA_RPC_URL: string;
}

const getConfig = (): ENV => {
  return {
    PORT: process.env.PORT ? Number(process.env.PORT) : undefined,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    BLOCKCHAIN_RPC_URL: process.env.BLOCKCHAIN_RPC_URL,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  };
};

const getSanitzedConfig = (config: ENV): Config => {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) {
      throw new Error(`Missing key ${key} in config.env`);
    }
  }
  return config as Config;
};

const config = getConfig();

const sanitizedConfig = getSanitzedConfig(config);

export default sanitizedConfig;
