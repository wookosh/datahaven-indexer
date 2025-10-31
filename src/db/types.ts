/**
 * MongoDB document types for blockchain indexer
 */

/**
 * Block document stored in MongoDB
 */
export interface BlockDocument {
  /** Block number (unique identifier) */
  number: number;
  /** Block hash */
  hash: string;
  /** Parent block hash */
  parentHash: string;
  /** State root hash */
  stateRoot: string;
  /** Extrinsics root hash */
  extrinsicsRoot: string;
  /** Block timestamp (milliseconds) */
  timestamp: number;
  /** Number of extrinsics in this block */
  extrinsicCount: number;
  /** Number of events in this block */
  eventCount: number;
  /** Block author/validator (if available) */
  author?: string;
  /** Chain ID */
  chainId: number;
  /** When this was indexed */
  indexedAt: Date;
}

/**
 * Extrinsic document stored in MongoDB
 */
export interface ExtrinsicDocument {
  /** Block number this extrinsic is in */
  blockNumber: number;
  /** Block hash */
  blockHash: string;
  /** Index within the block */
  extrinsicIndex: number;
  /** Extrinsic hash */
  hash: string;
  /** Pallet/section name */
  pallet: string;
  /** Method name */
  method: string;
  /** Decoded arguments */
  args: Record<string, any>;
  /** Signer address */
  signer?: string;
  /** Whether the extrinsic succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Block timestamp */
  timestamp: number;
  /** Nonce (for signed extrinsics) */
  nonce?: number;
  /** Tip amount (for signed extrinsics) */
  tip?: string;
  /** Is this a signed extrinsic */
  isSigned: boolean;
  /** Chain ID */
  chainId: number;
  /** When this was indexed */
  indexedAt: Date;
}

/**
 * Event document stored in MongoDB
 */
export interface EventDocument {
  /** Block number this event occurred in */
  blockNumber: number;
  /** Block hash */
  blockHash: string;
  /** Index within the block */
  eventIndex: number;
  /** Extrinsic index that triggered this event (if applicable) */
  extrinsicIndex?: number;
  /** Pallet/section name */
  pallet: string;
  /** Event method name */
  method: string;
  /** Event data/args */
  data: any[];
  /** Phase of execution (ApplyExtrinsic, Finalization, Initialization) */
  phase: string;
  /** Topics for event filtering */
  topics: string[];
  /** Block timestamp */
  timestamp: number;
  /** Chain ID */
  chainId: number;
  /** When this was indexed */
  indexedAt: Date;
}

/**
 * Scan progress tracker
 */
export interface ScanProgressDocument {
  /** Chain ID being scanned */
  chainId: number;
  /** Chain name */
  chainName: string;
  /** Last fully indexed block number */
  lastIndexedBlock: number;
  /** Total blocks indexed */
  blocksIndexed: number;
  /** Total extrinsics indexed */
  extrinsicsIndexed: number;
  /** Total events indexed */
  eventsIndexed: number;
  /** Last update timestamp */
  lastUpdated: Date;
  /** Whether indexing is complete */
  isComplete: boolean;
  /** Target end block (null for continuous sync) */
  targetEndBlock?: number;
}
