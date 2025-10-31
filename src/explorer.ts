import { ApiPromise, WsProvider } from '@polkadot/api';
import { ChainConfig } from './config';

/**
 * Polkadot blockchain explorer
 *
 * Provides utilities for connecting to and exploring Polkadot-compatible blockchains
 * such as DataHaven.
 */
export class BlockchainExplorer {
  private api: ApiPromise | null = null;
  private config: ChainConfig;

  /**
   * Creates a new blockchain explorer instance
   *
   * @param config - Chain configuration with connection details
   */
  constructor(config: ChainConfig) {
    this.config = config;
  }

  /**
   * Connects to the blockchain using WebSocket
   *
   * @returns Promise that resolves when connection is established
   */
  async connect(): Promise<void> {
    const provider = new WsProvider(this.config.wsUrl);
    this.api = await ApiPromise.create({ provider });
    console.log(`Connected to ${this.config.name} (Chain ID: ${this.config.id})`);
  }

  /**
   * Disconnects from the blockchain
   */
  async disconnect(): Promise<void> {
    if (this.api) {
      await this.api.disconnect();
      this.api = null;
      console.log('Disconnected from blockchain');
    }
  }

  /**
   * Gets the current API instance
   *
   * @returns API instance or null if not connected
   */
  getApi(): ApiPromise | null {
    return this.api;
  }
}
