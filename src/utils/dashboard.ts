/**
 * Indexer dashboard with clean single-line updates
 */

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  currentBlock: number;
  totalBlocks: number;
  blocksProcessed: number; // Overall blocks processed (for progress %)
  blocksRemaining: number;
  extrinsicsIndexed: number;
  eventsIndexed: number;
  sessionStartTime: number; // Start time of this session
  sessionBlocksProcessed: number; // Blocks processed in this session (for speed calculation)
  concurrency: number;
  activeThreads: number;
}

/**
 * Dashboard for tracking indexer progress with clean updating display
 */
export class IndexerDashboard {
  private startTime: number;
  private startBlock: number;
  private endBlock: number;
  private concurrency: number;
  private lastUpdate: number = 0;
  private updateInterval: number = 100; // Update every 100ms

  constructor(startBlock: number, endBlock: number, concurrency: number) {
    this.startBlock = startBlock;
    this.endBlock = endBlock;
    this.concurrency = concurrency;
    this.startTime = Date.now();

    // Print header
    console.log('\n' + '═'.repeat(80));
    console.log(`⛓️  DataHaven Blockchain Indexer`);
    console.log(`   Blocks: ${startBlock.toLocaleString()} - ${endBlock.toLocaleString()} | Concurrency: ${concurrency}`);
    console.log('═'.repeat(80) + '\n');
  }

  /**
   * Update the dashboard with current statistics
   */
  update(stats: DashboardStats): void {
    // Throttle updates to avoid performance impact
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return;
    }
    this.lastUpdate = now;

    const {
      currentBlock,
      totalBlocks,
      blocksProcessed,
      blocksRemaining,
      extrinsicsIndexed,
      eventsIndexed,
      sessionStartTime,
      sessionBlocksProcessed,
      concurrency,
      activeThreads,
    } = stats;

    // Calculate timing statistics based on THIS session
    const elapsed = Date.now() - sessionStartTime;
    const elapsedSeconds = elapsed / 1000;
    const blocksPerSecond = sessionBlocksProcessed / Math.max(elapsedSeconds, 0.001);
    const estimatedRemainingSeconds = blocksRemaining / Math.max(blocksPerSecond, 0.001);

    // Format durations
    const elapsedFormatted = this.formatDuration(elapsedSeconds);
    const etaFormatted = this.formatDuration(estimatedRemainingSeconds);

    // Calculate percentage
    const percentage = ((blocksProcessed / totalBlocks) * 100).toFixed(1);

    // Create progress bar with ASCII characters
    const barLength = 50;
    const filledLength = Math.floor((blocksProcessed / totalBlocks) * barLength);
    const bar = '='.repeat(filledLength) + '-'.repeat(barLength - filledLength);

    // Clear previous lines and print new stats
    process.stdout.write('\r\x1b[K'); // Clear current line

    const line1 = `📊 Progress: [${bar}] ${percentage}%`;
    const line2 = `\n📦 Block: ${currentBlock.toLocaleString()}/${this.endBlock.toLocaleString()} | Extrinsics: ${extrinsicsIndexed.toLocaleString()} | Events: ${eventsIndexed.toLocaleString()}`;
    const line3 = `\n⚡ Speed: ${blocksPerSecond.toFixed(2)} bl/s | Elapsed: ${elapsedFormatted} | ETA: ${etaFormatted} | Threads: ${activeThreads}/${concurrency}`;

    process.stdout.write(line1 + line2 + line3);
    process.stdout.write('\x1b[2A'); // Move cursor up 2 lines for next update
  }

  /**
   * Show completion message
   */
  showComplete(blocksProcessed: number, extrinsicsIndexed: number, eventsIndexed: number): void {
    const elapsed = Date.now() - this.startTime;
    const elapsedSeconds = elapsed / 1000;
    const blocksPerSecond = blocksProcessed / Math.max(elapsedSeconds, 0.001);

    // Clear the updating lines
    process.stdout.write('\r\x1b[K\n\x1b[K\n\x1b[K');

    console.log('\n' + '═'.repeat(80));
    console.log('✅ INDEXING COMPLETE!');
    console.log('═'.repeat(80));
    console.log();
    console.log(`  Total Blocks:       ${blocksProcessed.toLocaleString()}`);
    console.log(`  Total Extrinsics:   ${extrinsicsIndexed.toLocaleString()}`);
    console.log(`  Total Events:       ${eventsIndexed.toLocaleString()}`);
    console.log();
    console.log(`  Total Time:         ${this.formatDuration(elapsedSeconds)}`);
    console.log(`  Average Speed:      ${blocksPerSecond.toFixed(2)} blocks/sec`);
    console.log();
    console.log('═'.repeat(80) + '\n');
  }

  /**
   * Show error message
   */
  showError(error: string): void {
    // Clear the updating lines
    process.stdout.write('\r\x1b[K\n\x1b[K\n\x1b[K');

    console.log('\n' + '═'.repeat(80));
    console.log('❌ ERROR');
    console.log('═'.repeat(80));
    console.log();
    console.log(`  ${error}`);
    console.log();
    console.log('  Progress has been saved. You can resume by running the command again.');
    console.log();
    console.log('═'.repeat(80) + '\n');
  }

  /**
   * Close the dashboard
   */
  close(): void {
    // Move cursor down past the updating lines
    process.stdout.write('\n\n\n');
  }

  /**
   * Format duration in seconds to human-readable string
   */
  private formatDuration(seconds: number): string {
    if (!isFinite(seconds)) {
      return 'Calculating...';
    }

    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}m ${secs}s`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    } else {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return `${days}d ${hours}h`;
    }
  }
}
