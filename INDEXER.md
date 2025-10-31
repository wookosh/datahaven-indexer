# DataHaven MongoDB Indexer

A comprehensive blockchain indexer that stores **all** block data (blocks, extrinsics, and events) in MongoDB for fast querying.

## Why MongoDB?

Unlike caching solutions, the MongoDB indexer:

✅ Stores **everything** from every block
✅ Enables **complex queries** and aggregations
✅ Supports **relationships** between blocks, extrinsics, and events
✅ Provides **fast indexed** lookups
✅ Scales to **millions of records**
✅ Offers **real-time analytics**

## Setup

See [README.md](README.md) for complete setup instructions including MongoDB installation and environment configuration.

## Usage

### Index Blockchain Data

```bash
# Index all blocks (resumes from last indexed block)
npm start

# Index specific range
npm start -- --start=0 --end=1000

# Index blocks 100k-200k
npm start -- --start=100000 --end=200000

# Faster indexing with more parallel fetches
npm start -- --concurrency=10

# Start from latest block (useful for pruned nodes)
npm start -- --from-latest
```

### Query Indexed Data

```bash
# Connect to MongoDB shell
mongosh datahaven_indexer

# Show collections
show collections

# Count documents
db.blocks.countDocuments()
db.extrinsics.countDocuments()
db.events.countDocuments()

# View scan progress
db.scan_progress.findOne()
```

## MongoDB Schema

### Collections

#### `blocks`
Core block information:
```typescript
{
  number: 12345,
  hash: "0x...",
  parentHash: "0x...",
  stateRoot: "0x...",
  extrinsicsRoot: "0x...",
  timestamp: 1697654321000,
  extrinsicCount: 5,
  eventCount: 23,
  author: "5GrwvaEF...",
  chainId: 1283,
  indexedAt: ISODate("2025-10-17T...")
}
```

**Indexes:**
- `number` (unique)
- `hash` (unique)
- `timestamp`
- `chainId + number`

#### `extrinsics`
All blockchain transactions:
```typescript
{
  blockNumber: 12345,
  blockHash: "0x...",
  extrinsicIndex: 2,
  hash: "0x...",
  pallet: "fileSystem",
  method: "createBucket",
  args: { bucketName: "my-bucket", ... },
  signer: "5GrwvaEF...",
  success: true,
  error: undefined,
  timestamp: 1697654321000,
  nonce: 42,
  tip: "0",
  isSigned: true,
  chainId: 1283,
  indexedAt: ISODate("2025-10-17T...")
}
```

**Indexes:**
- `blockNumber + extrinsicIndex` (unique)
- `hash`
- `pallet + method`
- `signer`
- `success`
- `timestamp`
- `chainId + blockNumber`

#### `events`
All blockchain events:
```typescript
{
  blockNumber: 12345,
  blockHash: "0x...",
  eventIndex: 5,
  extrinsicIndex: 2,
  pallet: "fileSystem",
  method: "BucketCreated",
  data: ["5GrwvaEF...", "my-bucket"],
  phase: "ApplyExtrinsic",
  topics: [],
  timestamp: 1697654321000,
  chainId: 1283,
  indexedAt: ISODate("2025-10-17T...")
}
```

**Indexes:**
- `blockNumber + eventIndex` (unique)
- `extrinsicIndex`
- `pallet + method`
- `timestamp`
- `chainId + blockNumber`

#### `scan_progress`
Tracks indexing progress:
```typescript
{
  chainId: 1,
  chainName: "Storage Hub Solochain EVM Dev",
  lastIndexedBlock: 50000,
  blocksIndexed: 50001,
  extrinsicsIndexed: 125000,
  eventsIndexed: 450000,
  lastUpdated: ISODate("2025-10-17T..."),
  isComplete: false,
  targetEndBlock: 319000
}
```

## Example Queries

### Programmatic Usage

```typescript
import { IndexerDatabase } from './src/db/connection';

const db = new IndexerDatabase({
  uri: 'mongodb://localhost:27017',
  dbName: 'datahaven_indexer'
});

await db.connect();

// Get statistics
const stats = await db.getStats(1283);
console.log('Blocks:', stats.blockCount);
console.log('Extrinsics:', stats.extrinsicCount);
console.log('Events:', stats.eventCount);

// Get scan progress
const progress = await db.getScanProgress(1283);
console.log('Last indexed block:', progress?.lastIndexedBlock);

// Find missing blocks
const missing = await db.findMissingBlocks(1283, 0, 10000);
console.log('Missing blocks:', missing);

// Query blocks directly
const block = await db.blocks.findOne({ number: 12345 });

// Query extrinsics
const extrinsics = await db.extrinsics
  .find({ pallet: 'fileSystem', method: 'createBucket' })
  .limit(10)
  .toArray();

// Query events
const events = await db.events
  .find({ blockNumber: 12345 })
  .toArray();
```

### MongoDB Shell Queries

```javascript
// Connect to MongoDB
mongosh datahaven_indexer

// Count total documents
db.blocks.countDocuments()
db.extrinsics.countDocuments()
db.events.countDocuments()

// Find specific extrinsic
db.extrinsics.findOne({ hash: "0x..." })

// Get all createBucket calls
db.extrinsics.find({
  pallet: "fileSystem",
  method: "createBucket"
})

// Get user's transactions
db.extrinsics.find({
  signer: "5GrwvaEF..."
}).sort({ blockNumber: -1 })

// Aggregation: Count by pallet/method
db.extrinsics.aggregate([
  { $group: {
      _id: { pallet: "$pallet", method: "$method" },
      count: { $sum: 1 }
  }},
  { $sort: { count: -1 } },
  { $limit: 10 }
])

// Get events for a specific extrinsic
db.events.find({
  blockNumber: 12345,
  extrinsicIndex: 2
})

// Find failed transactions with errors
db.extrinsics.find({
  success: false,
  error: { $exists: true }
})

// Most active signers
db.extrinsics.aggregate([
  { $group: {
      _id: "$signer",
      count: { $sum: 1 }
  }},
  { $sort: { count: -1 } },
  { $limit: 10 }
])
```

## Automatic Retry on Network Failures

The indexer includes **robust retry logic** that handles network failures gracefully:

✅ **Infinite Retries** - Never gives up on network errors
✅ **60-Second Fixed Delay** - Consistent retry interval
✅ **Auto-Recovery** - Automatically resumes when network returns
✅ **Progress Saved** - After **every single block** (zero data loss!)

### How It Works

When a network error occurs (timeout, connection refused, etc.):
1. **Retry with 60-second delay** (1 minute wait)
2. **Keep retrying** at 60-second intervals indefinitely
3. **Resume automatically** when network connection restores

**Example output during network failure:**
```
⚠️  Attempt 1 failed: No response received from RPC endpoint in 60s
   Retrying in 60.0s...
⚠️  Attempt 2 failed: No response received from RPC endpoint in 60s
   Retrying in 60.0s...
⚠️  Attempt 3 failed: No response received from RPC endpoint in 60s
   Retrying in 60.0s...
```

### Network Errors Handled

- RPC timeouts (`No response received`)
- Connection refused (`ECONNREFUSED`)
- Connection reset (`ECONNRESET`)
- DNS failures (`ENOTFOUND`)
- Network unreachable (`ENETUNREACH`)
- Socket hang ups
- Connection closed errors
- WebSocket disconnections

### Pruned State Handling

When a node has pruned state (block data no longer available), the indexer:
1. **Detects** "state already discarded" or "unknown block" errors
2. **Skips** the unavailable block automatically
3. **Continues** with the next block
4. **No retry** for pruned state (it won't come back)

Use `--from-latest` flag to start from the latest available block when using pruned nodes.

## Performance

### Indexing Speed
- **~1-2 blocks/second** (depends on network latency)
- **Progress saved after every block** (MongoDB is designed for this!)
- **Full 319k blocks**: ~44-88 hours (resumable!)
- **Network failures**: Automatic retry, no manual intervention needed
- **Zero data loss**: Every block committed immediately to MongoDB

### Storage Requirements
Estimated for ~300k blocks:
- **Blocks**: ~50 MB
- **Extrinsics**: ~500 MB - 1 GB
- **Events**: ~1-2 GB
- **Total**: ~1.5-3 GB

### Query Performance
With proper indexes:
- **Single block lookup**: <1ms
- **Extrinsic by hash**: <1ms
- **All transactions by user**: <10ms (thousands of records)
- **Complex aggregations**: <100ms

## Resumable Indexing

The indexer automatically resumes from the last indexed block:

```bash
# Start indexing
npm start

# ... timeout or interrupt (Ctrl+C) ...

# Resume automatically
npm start  # Continues from last block
```

**Progress is saved after EVERY block** - you never lose any work! MongoDB efficiently handles frequent writes, so there's zero data loss even if the indexer crashes or network fails mid-block.

## Environment Variables

The indexer uses a `.env` file for configuration:

```bash
# .env file

# MongoDB connection URI
MONGO_URI=mongodb://localhost:27017

# Database name
MONGO_DB_NAME=datahaven_indexer

# Network selection
NETWORK=local
```

**Common configurations:**

```bash
# Local MongoDB without authentication
MONGO_URI=mongodb://localhost:27017

# Local MongoDB with authentication
MONGO_URI=mongodb://username:password@localhost:27017/datahaven_indexer?authSource=admin

# MongoDB Atlas (cloud)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/datahaven_indexer?retryWrites=true&w=majority

# Docker MongoDB
MONGO_URI=mongodb://host.docker.internal:27017
```

## Troubleshooting

### Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Start MongoDB: `brew services start mongodb-community`

### Duplicate Key Error
```
E11000 duplicate key error collection: blocks index: number
```
**Solution**: Database may be corrupted. Clear and reindex (see your MongoDB docs for clearing collections)

### Slow Indexing
**Solution**:
- Check network latency to RPC endpoint
- Increase concurrency: `npm start -- --concurrency=10`
- Use local Polkadot node for faster access

### Network Timeouts
The indexer will automatically retry network errors. If you see repeated timeout messages, check:
- RPC endpoint is accessible
- Network connection is stable
- RPC endpoint is not rate-limiting

## Next Steps

1. **Start indexing**: `npm start -- --start=0 --end=10000`
2. **Query data**: `mongosh datahaven_indexer`
3. **Build your app**: Use `IndexerDatabase` for queries
4. **Create API**: Expose MongoDB queries via REST/GraphQL
