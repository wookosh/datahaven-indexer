/**
 * Example: Scan blockchain and index ALL data to MongoDB
 *
 * This example shows how to scan the DataHaven blockchain and store
 * ALL block data (blocks, extrinsics, events) in MongoDB for later querying.
 */

import 'dotenv/config';
import { BlockchainExplorer } from './explorer';
import { IndexerDatabase } from './db/connection';
import { BlockchainIndexer } from './db/indexer';
import { getChainConfig } from './config';
import { IndexerDashboard } from './utils/dashboard';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);

  const startBlockArg = args.find((arg) => arg.startsWith('--start='))?.split('=')[1];
  const userStartBlock = startBlockArg ? parseInt(startBlockArg) : undefined;
  const endBlockArg = args.find((arg) => arg.startsWith('--end='))?.split('=')[1];
  const userEndBlock = endBlockArg ? parseInt(endBlockArg) : undefined;
  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1];
  const concurrency = concurrencyArg ? parseInt(concurrencyArg) : 10;

  // Network override option (--network=local or -n=local)
  const networkArg = args.find((arg) => arg.startsWith('--network=') || arg.startsWith('-n='))?.split('=')[1];

  // Flag to start from latest block (useful for pruned nodes)
  const fromLatest = args.includes('--from-latest');

  console.log('⛓️  DataHaven Blockchain Indexer');
  console.log('Connecting...\n');

  // Get chain config from environment variable
  // CLI --network flag overrides environment variable
  if (networkArg) {
    process.env.NETWORK = networkArg;
  }
  const chainConfig = getChainConfig();
  const explorer = new BlockchainExplorer(chainConfig);
  const db = new IndexerDatabase({
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: process.env.MONGO_DB_NAME || 'datahaven_indexer',
  });

  let dashboard: IndexerDashboard | null = null;

  try {
    // Connect to blockchain and database
    await explorer.connect();
    await db.connect();

    const api = explorer.getApi();
    if (!api) {
      throw new Error('Failed to connect to blockchain API');
    }

    const indexer = new BlockchainIndexer(api, db, chainConfig.id);

    // Determine actual start/end blocks
    const progress = await db.getScanProgress(chainConfig.id);
    const latestBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    let actualStartBlock: number;
    if (userStartBlock !== undefined) {
      actualStartBlock = userStartBlock;
    } else if (fromLatest) {
      actualStartBlock = latestBlock;
      console.log(`🔄 Starting from latest block ${latestBlock} (--from-latest flag)`);
    } else if (progress && progress.lastIndexedBlock < (userEndBlock ?? latestBlock)) {
      actualStartBlock = progress.lastIndexedBlock + 1;
    } else {
      actualStartBlock = 0;
    }

    const actualEndBlock = userEndBlock ?? latestBlock;

    // Initialize dashboard
    dashboard = new IndexerDashboard(actualStartBlock, actualEndBlock, concurrency);

    // Track session start for speed calculation
    const sessionStartBlock = actualStartBlock;
    const sessionStartTime = Date.now();

    // Index all blockchain data with dashboard updates
    await indexer.index({
      startBlock: userStartBlock,
      endBlock: userEndBlock,
      concurrency,
      onProgress: (progress) => {
        if (dashboard) {
          dashboard.update({
            currentBlock: progress.lastIndexedBlock,
            totalBlocks: actualEndBlock + 1,
            blocksProcessed: progress.lastIndexedBlock + 1,
            blocksRemaining: actualEndBlock - progress.lastIndexedBlock,
            extrinsicsIndexed: progress.extrinsicsIndexed,
            eventsIndexed: progress.eventsIndexed,
            sessionStartTime,
            sessionBlocksProcessed: progress.lastIndexedBlock - sessionStartBlock + 1,
            concurrency,
            activeThreads: progress.activeFetches,
          });
        }
      },
    });

    // Show completion in dashboard
    const stats = await db.getStats(chainConfig.id);
    if (dashboard) {
      dashboard.showComplete(
        stats.blockCount,
        stats.extrinsicCount,
        stats.eventCount
      );
    }

    // Wait a bit for user to see the final dashboard
    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    if (dashboard) {
      dashboard.showError(error instanceof Error ? error.message : String(error));
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.error('\n❌ Error scanning blockchain:', error);
      console.error('\n💡 Progress saved after every block. Run the command again to resume.');
    }
    process.exit(1);
  } finally {
    if (dashboard) {
      dashboard.close();
    }
    await explorer.disconnect();
    await db.disconnect();
  }
}

main().catch(console.error);
