/**
 * Comprehensive blockchain indexer that stores all block data
 */

import { ApiPromise } from '@polkadot/api';
import { IndexerDatabase } from './connection';
import { BlockDocument, ExtrinsicDocument, EventDocument } from './types';
import { retryOnNetworkError, isStatePrunedError } from '../utils/retry';

/**
 * Indexer options
 */
export interface IndexerOptions {
  /** Starting block number */
  startBlock?: number;
  /** Ending block number (null for continuous sync to latest) */
  endBlock?: number;
  /** Number of blocks to process before saving progress (deprecated, always saves every block) */
  batchSize?: number;
  /** Number of blocks to fetch in parallel (default: 5) */
  concurrency?: number;
  /** Callback for progress updates */
  onProgress?: (progress: {
    lastIndexedBlock: number;
    blocksIndexed: number;
    extrinsicsIndexed: number;
    eventsIndexed: number;
    activeFetches: number;
  }) => void;
}

/**
 * Block data fetched from blockchain
 */
interface FetchedBlockData {
  blockNum: number;
  blockHash: any;
  signedBlock: any;
  apiAt: any;
  timestampMs: number;
  allEvents: any;
}

/**
 * Comprehensive blockchain indexer
 */
export class BlockchainIndexer {
  private api: ApiPromise;
  private db: IndexerDatabase;
  private chainId: number;

  constructor(api: ApiPromise, db: IndexerDatabase, chainId: number) {
    this.api = api;
    this.db = db;
    this.chainId = chainId;
  }

  /**
   * Fetch a single block's data with retry logic
   * Returns null if state is pruned (unavailable)
   */
  private async fetchBlockData(blockNum: number): Promise<FetchedBlockData | null> {
    try {
      return await retryOnNetworkError(async () => {
        const blockHash = await this.api.rpc.chain.getBlockHash(blockNum);
        const [signedBlock, apiAt] = await Promise.all([
          this.api.rpc.chain.getBlock(blockHash),
          this.api.at(blockHash),
        ]);

        // Get timestamp and events
        const [timestamp, allEvents] = await Promise.all([
          apiAt.query.timestamp.now(),
          apiAt.query.system.events(),
        ]);

        const timestampMs = (timestamp as any).toNumber();

        return { blockNum, blockHash, signedBlock, apiAt, timestampMs, allEvents };
      });
    } catch (error) {
      // If state is pruned, skip this block
      if (isStatePrunedError(error)) {
        console.warn(`⚠️  Block ${blockNum}: State pruned (skipping)`);
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Index blockchain data into MongoDB
   *
   * @param options - Indexing options
   */
  async index(options: IndexerOptions = {}): Promise<void> {
    const {
      startBlock: userStartBlock,
      endBlock: userEndBlock,
      batchSize = 1, // deprecated but kept for backward compatibility
      concurrency = 5,
      onProgress
    } = options;

    // Get current progress
    const progress = await this.db.getScanProgress(this.chainId);

    // Check for missing blocks
    console.log('\n🔍 Checking for missing blocks...');
    const missingBlocks = await this.db.findMissingBlocks(this.chainId);
    if (missingBlocks.length > 0) {
      console.log('⚠️  WARNING: Found missing blocks in the indexed range:');
      for (const range of missingBlocks) {
        if (range.start === range.end) {
          console.log(`   - Block ${range.start}`);
        } else {
          console.log(`   - Blocks ${range.start} to ${range.end} (${range.end - range.start + 1} blocks)`);
        }
      }
      const totalMissing = missingBlocks.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
      console.log(`   Total missing: ${totalMissing} blocks\n`);
    } else if (progress && progress.lastIndexedBlock > 0) {
      console.log('✅ No missing blocks detected\n');
    }

    // Determine block range
    const latestBlock = (await this.api.rpc.chain.getHeader()).number.toNumber();
    const endBlock = userEndBlock ?? latestBlock;

    let startBlock: number;
    if (userStartBlock !== undefined) {
      startBlock = userStartBlock;
    } else if (progress && progress.lastIndexedBlock < endBlock) {
      startBlock = progress.lastIndexedBlock + 1;
      console.log(`📍 Resuming from block ${startBlock}`);
    } else {
      startBlock = 0;
    }

    console.log(`🔍 Indexing blocks ${startBlock} to ${endBlock}...`);
    console.log(`Total blocks to index: ${endBlock - startBlock + 1}`);
    console.log(`⚡ Parallel fetching enabled: ${concurrency} blocks at a time\n`);

    // Get chain info
    const chainName = (await this.api.rpc.system.chain()).toString();

    // Initialize progress tracking
    let blocksIndexed = progress?.blocksIndexed || 0;
    let extrinsicsIndexed = progress?.extrinsicsIndexed || 0;
    let eventsIndexed = progress?.eventsIndexed || 0;

    // Process blocks with parallel fetching
    let currentBlock = startBlock;
    const fetchQueue: Promise<FetchedBlockData | null>[] = [];

    while (currentBlock <= endBlock) {
      // Fill the fetch queue with parallel requests
      while (fetchQueue.length < concurrency && currentBlock <= endBlock) {
        fetchQueue.push(this.fetchBlockData(currentBlock));
        currentBlock++;
      }

      // Wait for the first block to finish (maintains order)
      if (fetchQueue.length > 0) {
        const fetchedData = await fetchQueue.shift()!;

        // Skip if block state was pruned
        if (fetchedData === null) {
          continue;
        }

        const { blockNum, blockHash, signedBlock, timestampMs, allEvents } = fetchedData;

        try {
          const block = signedBlock.block;

          // Extract block author if available
          let author: string | undefined;
          try {
            const digest = block.header.digest;
            // Try to extract author from digest (implementation varies by chain)
            author = undefined; // Simplified for now
          } catch (e) {
            // Author extraction may not be available
          }

          // Prepare block document
          const blockDoc: BlockDocument = {
            number: blockNum,
            hash: blockHash.toString(),
            parentHash: block.header.parentHash.toString(),
            stateRoot: block.header.stateRoot.toString(),
            extrinsicsRoot: block.header.extrinsicsRoot.toString(),
            timestamp: timestampMs,
            extrinsicCount: block.extrinsics.length,
            eventCount: (allEvents as any).length || 0,
            author,
            chainId: this.chainId,
            indexedAt: new Date(),
          };

          // Prepare extrinsic documents
          const extrinsicDocs: ExtrinsicDocument[] = [];
          const eventsArray = (allEvents as any).toArray ? (allEvents as any).toArray() : (allEvents as any);

          block.extrinsics.forEach((extrinsic: any, index: number) => {
            const { method: extrinsicMethod, signer, isSigned, nonce, tip } = extrinsic;
            const { section, method: methodName } = extrinsicMethod;

            // Decode arguments
            const args: Record<string, any> = {};
            try {
              const meta = extrinsic.meta;
              meta.args.forEach((argMeta: any, argIndex: number) => {
                const argName = argMeta.name.toString();
                const argValue = extrinsicMethod.args[argIndex];
                args[argName] = argValue.toHuman();
              });
            } catch (e) {
              // Argument decoding may fail for some extrinsics
            }

            // Check success status
            let success = false;
            let error: string | undefined;
            for (const record of eventsArray) {
              const { phase, event } = record as any;
              if (phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index) {
                if (this.api.events.system.ExtrinsicSuccess.is(event)) {
                  success = true;
                } else if (this.api.events.system.ExtrinsicFailed.is(event)) {
                  success = false;
                  // Extract error if available
                  try {
                    const dispatchError = event.data[0];
                    error = dispatchError.toString();
                  } catch (e) {
                    error = 'Unknown error';
                  }
                }
              }
            }

            extrinsicDocs.push({
              blockNumber: blockNum,
              blockHash: blockHash.toString(),
              extrinsicIndex: index,
              hash: extrinsic.hash.toString(),
              pallet: section,
              method: methodName,
              args,
              signer: signer?.toString(),
              success,
              error,
              timestamp: timestampMs,
              nonce: isSigned && nonce ? nonce.toNumber() : undefined,
              tip: isSigned && tip ? tip.toString() : undefined,
              isSigned: isSigned,
              chainId: this.chainId,
              indexedAt: new Date(),
            });
          });

          // Prepare event documents
          const eventDocs: EventDocument[] = [];
          eventsArray.forEach((record: any, eventIndex: number) => {
            const { phase, event } = record;
            const { section, method, data } = event;

            eventDocs.push({
              blockNumber: blockNum,
              blockHash: blockHash.toString(),
              eventIndex,
              extrinsicIndex: phase.isApplyExtrinsic ? phase.asApplyExtrinsic.toNumber() : undefined,
              pallet: section,
              method,
              data: data.toHuman(),
              phase: phase.type,
              topics: record.topics?.map((t: any) => t.toString()) || [],
              timestamp: timestampMs,
              chainId: this.chainId,
              indexedAt: new Date(),
            });
          });

          // Insert all documents
          await Promise.all([
            this.db.blocks.insertOne(blockDoc),
            extrinsicDocs.length > 0 ? this.db.extrinsics.insertMany(extrinsicDocs) : Promise.resolve(),
            eventDocs.length > 0 ? this.db.events.insertMany(eventDocs) : Promise.resolve(),
          ]);

          // Update counters
          blocksIndexed++;
          extrinsicsIndexed += extrinsicDocs.length;
          eventsIndexed += eventDocs.length;

          // Save progress after EVERY block (MongoDB handles this efficiently)
          await this.db.updateScanProgress({
            chainId: this.chainId,
            chainName,
            lastIndexedBlock: blockNum,
            blocksIndexed,
            extrinsicsIndexed,
            eventsIndexed,
            lastUpdated: new Date(),
            isComplete: blockNum === endBlock,
            targetEndBlock: endBlock,
          });

          // Call progress callback every block if provided (no console.log to avoid interfering with dashboard)
          if (onProgress) {
            onProgress({
              lastIndexedBlock: blockNum,
              blocksIndexed,
              extrinsicsIndexed,
              eventsIndexed,
              activeFetches: fetchQueue.length, // Number of blocks currently being fetched in parallel
            });
          }
        } catch (error) {
          console.error(`❌ Error indexing block ${blockNum}:`, error);
          // Save progress even on error
          await this.db.updateScanProgress({
            chainId: this.chainId,
            chainName,
            lastIndexedBlock: blockNum - 1,
            blocksIndexed,
            extrinsicsIndexed,
            eventsIndexed,
            lastUpdated: new Date(),
            isComplete: false,
            targetEndBlock: endBlock,
          });
          throw error;
        }
      }
    }

    console.log(`\n✅ Indexing complete!`);
    console.log(`   Blocks: ${blocksIndexed}`);
    console.log(`   Extrinsics: ${extrinsicsIndexed}`);
    console.log(`   Events: ${eventsIndexed}`);
  }
}
