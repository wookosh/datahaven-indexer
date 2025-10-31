/**
 * MongoDB connection management
 */

import { MongoClient, Db, Collection } from 'mongodb';
import {
  BlockDocument,
  ExtrinsicDocument,
  EventDocument,
  ScanProgressDocument,
} from './types';

/**
 * MongoDB connection configuration
 */
export interface MongoConfig {
  /** MongoDB connection URI */
  uri: string;
  /** Database name */
  dbName: string;
}

/**
 * Default MongoDB configuration
 * Can be overridden with environment variables
 */
export const DEFAULT_MONGO_CONFIG: MongoConfig = {
  uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
  dbName: process.env.MONGO_DB_NAME || 'datahaven_indexer',
};

/**
 * MongoDB Database wrapper with typed collections
 */
export class IndexerDatabase {
  private client: MongoClient;
  private db: Db;
  private config: MongoConfig;

  /**
   * Create database instance
   *
   * @param config - MongoDB connection configuration
   */
  constructor(config: MongoConfig = DEFAULT_MONGO_CONFIG) {
    this.config = config;
    this.client = new MongoClient(config.uri);
    this.db = this.client.db(config.dbName);
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    await this.client.connect();
    console.log(`✅ Connected to MongoDB: ${this.config.dbName}`);
    await this.ensureIndexes();
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect(): Promise<void> {
    await this.client.close();
    console.log('Disconnected from MongoDB');
  }

  /**
   * Get blocks collection
   */
  get blocks(): Collection<BlockDocument> {
    return this.db.collection<BlockDocument>('blocks');
  }

  /**
   * Get extrinsics collection
   */
  get extrinsics(): Collection<ExtrinsicDocument> {
    return this.db.collection<ExtrinsicDocument>('extrinsics');
  }

  /**
   * Get events collection
   */
  get events(): Collection<EventDocument> {
    return this.db.collection<EventDocument>('events');
  }

  /**
   * Get scan progress collection
   */
  get scanProgress(): Collection<ScanProgressDocument> {
    return this.db.collection<ScanProgressDocument>('scan_progress');
  }

  /**
   * Create database indexes for optimal query performance
   */
  private async ensureIndexes(): Promise<void> {
    // Blocks indexes
    await this.blocks.createIndex({ number: 1 }, { unique: true });
    await this.blocks.createIndex({ hash: 1 }, { unique: true });
    await this.blocks.createIndex({ timestamp: -1 });
    await this.blocks.createIndex({ chainId: 1, number: 1 });

    // Extrinsics indexes
    await this.extrinsics.createIndex({ blockNumber: 1, extrinsicIndex: 1 }, { unique: true });
    await this.extrinsics.createIndex({ hash: 1 });
    await this.extrinsics.createIndex({ pallet: 1, method: 1 });
    await this.extrinsics.createIndex({ signer: 1 });
    await this.extrinsics.createIndex({ success: 1 });
    await this.extrinsics.createIndex({ timestamp: -1 });
    await this.extrinsics.createIndex({ chainId: 1, blockNumber: 1 });

    // Events indexes
    await this.events.createIndex({ blockNumber: 1, eventIndex: 1 }, { unique: true });
    await this.events.createIndex({ extrinsicIndex: 1 });
    await this.events.createIndex({ pallet: 1, method: 1 });
    await this.events.createIndex({ timestamp: -1 });
    await this.events.createIndex({ chainId: 1, blockNumber: 1 });

    // Scan progress indexes
    await this.scanProgress.createIndex({ chainId: 1 }, { unique: true });

    console.log('✅ Database indexes ensured');
  }

  /**
   * Get current scan progress for a chain
   *
   * @param chainId - Chain identifier
   * @returns Scan progress or null if not found
   */
  async getScanProgress(chainId: number): Promise<ScanProgressDocument | null> {
    return await this.scanProgress.findOne({ chainId });
  }

  /**
   * Update scan progress
   *
   * @param progress - Updated progress document
   */
  async updateScanProgress(progress: ScanProgressDocument): Promise<void> {
    await this.scanProgress.updateOne(
      { chainId: progress.chainId },
      { $set: progress },
      { upsert: true }
    );
  }

  /**
   * Get statistics for the indexed data
   *
   * @param chainId - Chain identifier
   * @returns Indexer statistics
   */
  async getStats(chainId: number) {
    const [blockCount, extrinsicCount, eventCount, progress] = await Promise.all([
      this.blocks.countDocuments({ chainId }),
      this.extrinsics.countDocuments({ chainId }),
      this.events.countDocuments({ chainId }),
      this.getScanProgress(chainId),
    ]);

    return {
      blockCount,
      extrinsicCount,
      eventCount,
      progress,
    };
  }

  /**
   * Check for missing blocks in the indexed range
   *
   * @param chainId - Chain identifier
   * @returns Array of missing block number ranges
   */
  async findMissingBlocks(chainId: number): Promise<Array<{ start: number; end: number }>> {
    const progress = await this.getScanProgress(chainId);

    if (!progress || progress.lastIndexedBlock === 0) {
      return [];
    }

    // Get all indexed block numbers sorted
    const indexedBlocks = await this.blocks
      .find({ chainId }, { projection: { number: 1 } })
      .sort({ number: 1 })
      .toArray();

    if (indexedBlocks.length === 0) {
      return [{ start: 0, end: progress.lastIndexedBlock }];
    }

    const missingRanges: Array<{ start: number; end: number }> = [];
    let expectedBlock = 0;

    for (const block of indexedBlocks) {
      const blockNum = block.number;

      if (blockNum > expectedBlock) {
        // Found a gap
        missingRanges.push({
          start: expectedBlock,
          end: blockNum - 1,
        });
      }

      expectedBlock = blockNum + 1;
    }

    // Check if there's a gap between the last indexed block and the progress record
    const lastIndexedBlock = indexedBlocks[indexedBlocks.length - 1].number;
    if (lastIndexedBlock < progress.lastIndexedBlock) {
      missingRanges.push({
        start: lastIndexedBlock + 1,
        end: progress.lastIndexedBlock,
      });
    }

    return missingRanges;
  }
}
