# DataHaven Blockchain Explorer

A TypeScript library for exploring Polkadot-compatible blockchains, specifically designed for the DataHaven network.

## IMPORTANT NOTE

If you are using a local datahaven/storage-hub network, in order for this indexer to work, you need to ensure that your `sh-user` has the following command arguments:
```
'--state-pruning=archive',
'--blocks-pruning=archive',
```

These need to be added in `docker/fullnet-base-template.yml`. When complete, `sh-user` will look like this: 

```
sh-user:
    image: storage-hub:local
    platform: linux/amd64
    container_name: storage-hub-sh-user-1
    ports:
      - '9888:9944'
      - '30444:30444'
    volumes:
      - ./dev-keystores/user:/keystore:rw
      - ./resource:/res:ro
    command:
      [
        '--dev',
        '--name=sh-user',
        '--provider',
        '--provider-type=user',
        '--no-hardware-benchmarks',
        '--unsafe-rpc-external',
        '--rpc-methods=unsafe',
        '--port=30444',
        '--rpc-cors=all',
        '--node-key=0x13b3b1c917dda506f152816aad4685eefa54fe57792165b31141ac893610b314',
        '--bootnodes=/ip4/${BSP_IP:-default_bsp_ip}/tcp/30350/p2p/${BSP_PEER_ID:-default_bsp_peer_id}',
        '--keystore-path=/keystore',
        '--sealing=manual',
        '--base-path=/data',
        '--state-pruning=archive',
        '--blocks-pruning=archive',
      ]
```

If you receive these errors when indexing:
```
⚠️  Block 8691: State pruned (skipping)
2025-10-31 15:14:17        RPC-CORE: getRuntimeVersion(at?: BlockHash): RuntimeVersion:: 4003: Client error: Api called for an unknown Block: State already discarded for 0xdd7206b6e37c79be601556f932a2e5b8f03f0d8c04bbf38f906b32c61d4fa184
2025-10-31 15:14:17        RPC-CORE: getBlock(hash?: BlockHash): SignedBlock:: 4003: Client error: Api called for an unknown Block: State already discarded for 0xdd7206b6e37c79be601556f932a2e5b8f03f0d8c04bbf38f906b32c61d4fa184
⚠️  Block 8693: State pruned (skipping)
```

You will need to wipe your volumes, and rebuild the containers. 

## Installation

```bash
npm install
```

## Quick Setup

### 1. MongoDB Setup (Required)

The explorer requires MongoDB to store indexed blockchain data.

#### Option A: Local MongoDB

```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Verify it's running
mongosh
```

#### Option B: Docker MongoDB

```bash
docker run -d \
  -p 27017:27017 \
  --name mongodb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:latest
```

#### Option C: MongoDB Atlas (Cloud)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get connection string

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env  # If .env.example exists
# Or create manually:
touch .env
```

**Example `.env` configurations:**

```bash
# For local MongoDB without auth:
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=datahaven_indexer
NETWORK=local

# For local MongoDB with auth:
# MONGO_URI=mongodb://admin:password@localhost:27017/datahaven_indexer?authSource=admin

# For Docker MongoDB:
# MONGO_URI=mongodb://admin:password@localhost:27017/datahaven_indexer?authSource=admin

# For MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/datahaven_indexer?retryWrites=true&w=majority
```

### 3. Test Connection

```bash
# Test that everything works by indexing a small range
npm start -- --start=0 --end=10
```

## Project Structure

```
explorer/
├── src/
│   ├── index.ts           # Main entry point (blockchain indexer)
│   ├── config.ts          # Chain configuration
│   ├── explorer.ts        # Blockchain connection management
│   ├── db/
│   │   ├── connection.ts  # MongoDB database wrapper
│   │   ├── indexer.ts     # Blockchain indexing logic
│   │   └── types.ts       # Database type definitions
│   └── utils/
│       ├── dashboard.ts   # Progress display utilities
│       └── retry.ts       # Network retry logic
├── package.json
└── tsconfig.json
```

## Usage

### Run the Indexer

The main entry point is `src/index.ts` which runs a full blockchain indexer that stores all block data in MongoDB:

```bash
# Run the indexer (automatically resumes from last indexed block)
npm start

# Index specific block range
npm start -- --start=0 --end=1000

# Start from latest block (useful for pruned nodes)
npm start -- --from-latest

# Adjust concurrency for faster indexing
npm start -- --concurrency=10
```

### MongoDB Indexer Features

The indexer stores **ALL** blockchain data in MongoDB:

✅ **Complete Data** - Blocks, extrinsics, and events

✅ **Automatic Resume** - Continues from last indexed block

✅ **Progress Saved** - After every single block (zero data loss)

✅ **Network Resilience** - Infinite retry on network failures

✅ **Pruned Node Support** - Automatically skips unavailable state

✅ **Fast Queries** - Indexed MongoDB collections

✅ **Progress Dashboard** - Real-time indexing statistics

See [INDEXER.md](INDEXER.md) for complete documentation.

## Configuration

### Environment Variables

Create a `.env` file:

```bash
# MongoDB configuration
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=datahaven_indexer

# Network selection (optional)
NETWORK=local
```

### Available Networks

The library comes with pre-configured network:

**Local Development**:
- Chain ID: 1
- WebSocket: ws://127.0.0.1:9888

## Programmatic Usage

```typescript
import 'dotenv/config';
import { BlockchainExplorer } from './explorer';
import { IndexerDatabase } from './db/connection';
import { BlockchainIndexer } from './db/indexer';
import { getChainConfig } from './config';

async function main() {
  const chainConfig = getChainConfig();
  const explorer = new BlockchainExplorer(chainConfig);
  const db = new IndexerDatabase({
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: process.env.MONGO_DB_NAME || 'datahaven_indexer',
  });

  try {
    await explorer.connect();
    await db.connect();

    const api = explorer.getApi();
    if (!api) throw new Error('Failed to connect to blockchain API');

    const indexer = new BlockchainIndexer(api, db, chainConfig.id);

    // Index blockchain data
    await indexer.index({
      startBlock: 0,
      endBlock: 10000,
      concurrency: 5,
      onProgress: (progress) => {
        console.log(`Indexed block ${progress.lastIndexedBlock}`);
        console.log(`Extrinsics: ${progress.extrinsicsIndexed}`);
        console.log(`Events: ${progress.eventsIndexed}`);
      },
    });

    // Query indexed data
    const stats = await db.getStats(chainConfig.id);
    console.log('Blocks indexed:', stats.blockCount);
    console.log('Extrinsics indexed:', stats.extrinsicCount);
    console.log('Events indexed:', stats.eventCount);
  } finally {
    await explorer.disconnect();
    await db.disconnect();
  }
}

main().catch(console.error);
```

## API Reference

### `BlockchainExplorer`

Manages blockchain connection.

**Methods:**
- `connect()` - Connects to the blockchain via WebSocket
- `disconnect()` - Disconnects from the blockchain
- `getApi()` - Returns the Polkadot.js API instance

### `IndexerDatabase`

MongoDB database wrapper.

**Methods:**
- `connect()` - Connects to MongoDB
- `disconnect()` - Disconnects from MongoDB
- `getScanProgress(chainId)` - Gets current indexing progress
- `getStats(chainId)` - Gets statistics (block/extrinsic/event counts)
- `findMissingBlocks(chainId, startBlock, endBlock)` - Finds gaps in indexed data

**Properties:**
- `blocks` - MongoDB collection for blocks
- `extrinsics` - MongoDB collection for extrinsics
- `events` - MongoDB collection for events
- `scanProgress` - MongoDB collection for scan progress

### `BlockchainIndexer`

Indexes blockchain data to MongoDB.

**Methods:**
- `index(options)` - Indexes blockchain data
  - `startBlock?: number` - Starting block (default: resume from last indexed)
  - `endBlock?: number` - Ending block (default: latest)
  - `concurrency?: number` - Parallel block fetches (default: 5)
  - `onProgress?: (progress) => void` - Progress callback

### `getChainConfig()`

Returns chain configuration based on `NETWORK` environment variable.

**Returns:** `ChainConfig` with connection details

## Types

### `ChainConfig`

```typescript
interface ChainConfig {
  id: number;          // Chain ID
  name: string;        // Human-readable name
  rpcUrl: string;      // RPC endpoint
  wsUrl: string;       // WebSocket endpoint
  baseUrl: string;     // Base URL for services
}
```

### Database Types

See [src/db/types.ts](src/db/types.ts) for complete type definitions:
- `BlockDocument` - Block data
- `ExtrinsicDocument` - Extrinsic (transaction) data
- `EventDocument` - Event data
- `ScanProgressDocument` - Indexing progress

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run type-check
```

### Clean

```bash
npm run clean
```

## Documentation

- [INDEXER.md](INDEXER.md) - Complete MongoDB indexer documentation (schema, queries, troubleshooting)

## Performance

**Indexing Speed:**
- ~1-2 blocks/second (network dependent)
- Parallel fetching with configurable concurrency
- Progress saved after every block

**Storage Requirements:**
- Blocks: ~50 MB per 300k blocks
- Extrinsics: ~500 MB - 1 GB per 300k blocks
- Events: ~1-2 GB per 300k blocks
- Total: ~1.5-3 GB per 300k blocks

**Query Performance:**
- Single block lookup: <1ms
- Extrinsic by hash: <1ms
- User transactions: <10ms

## Troubleshooting

### "Command createIndexes requires authentication"

Your MongoDB requires authentication. Update your `.env`:

```bash
MONGO_URI=mongodb://username:password@localhost:27017/datahaven_indexer?authSource=admin
```

### "Connection refused"

MongoDB is not running. Start it:

```bash
# macOS
brew services start mongodb-community

# Docker
docker start mongodb
```

### Find MongoDB credentials

If you used Docker, check your docker run command for `-e MONGO_INITDB_ROOT_USERNAME` and `-e MONGO_INITDB_ROOT_PASSWORD`.

## License

ISC
