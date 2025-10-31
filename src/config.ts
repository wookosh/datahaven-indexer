/**
 * DataHaven blockchain configuration
 *
 * Contains connection details for the DataHaven blockchain,
 * a Polkadot-compatible network.
 */

export interface ChainConfig {
  /** Chain ID */
  id: number;
  /** Human-readable chain name */
  name: string;
  /** RPC endpoint URL for HTTP connections */
  rpcUrl: string;
  /** WebSocket endpoint URL for persistent connections */
  wsUrl: string;
  /** Base URL for backend services */
  baseUrl: string;
}

/**
 * Local Development Network
 */
export const LOCAL_CONFIG: ChainConfig = {
  id: 1,
  name: 'Storage Hub Solochain EVM Dev',
  rpcUrl: 'http://localhost:9888',
  wsUrl: 'ws://127.0.0.1:9888',
  baseUrl: 'http://127.0.0.1:9888',
};

/**
 * Available network configurations
 */
export const NETWORKS = {
  local: LOCAL_CONFIG,
} as const;

export type NetworkName = keyof typeof NETWORKS;

/**
 * Get chain configuration from environment variable or default to local
 */
export function getChainConfig(): ChainConfig {
  const networkName = (process.env.NETWORK || 'local') as NetworkName;

  if (!(networkName in NETWORKS)) {
    console.warn(`⚠️  Unknown network "${networkName}", falling back to local`);
    return LOCAL_CONFIG;
  }

  const config = NETWORKS[networkName];
  console.log(`🌐 Using network: ${config.name} (Chain ID: ${config.id})`);
  return config;
}