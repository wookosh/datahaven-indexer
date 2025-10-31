/**
 * Retry utilities for handling network failures
 */

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (Infinity for unlimited) */
  maxAttempts?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
  /** Function to determine if error should trigger retry */
  shouldRetry?: (error: any) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: any, delay: number) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: Infinity, // Retry indefinitely
  initialDelay: 1000, // Start with 1 second
  maxDelay: 60000, // Cap at 60 seconds
  backoffMultiplier: 2, // Double delay each time
  shouldRetry: () => true, // Retry all errors by default
  onRetry: () => {}, // No-op by default
};

/**
 * Check if an error is due to state pruning (block state no longer available)
 */
export function isStatePrunedError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorCode = error?.code || '';

  return (
    errorMessage.includes('state already discarded') ||
    errorMessage.includes('unknown block') ||
    errorCode === 4003 // State already discarded RPC error code
  );
}

/**
 * Check if an error is network-related
 */
export function isNetworkError(error: any): boolean {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorCode = error?.code || '';

  return (
    // Timeout errors
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    // Connection errors
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('enotfound') ||
    errorMessage.includes('enetunreach') ||
    // WebSocket disconnection errors
    errorMessage.includes('disconnected') ||
    errorMessage.includes('websocket is not connected') ||
    errorMessage.includes('abnormal closure') ||
    errorMessage.includes('connection closed') ||
    errorMessage.includes('socket hang up') ||
    // RPC endpoint errors
    errorMessage.includes('no response received') ||
    // Network codes
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ENOTFOUND'
  );
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;
  let delay = opts.initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      // Check if we should retry this error
      if (!opts.shouldRetry(error)) {
        throw error;
      }

      // Check if we've exceeded max attempts
      if (attempt >= opts.maxAttempts) {
        console.error(`❌ Max retry attempts (${opts.maxAttempts}) exceeded`);
        throw error;
      }

      // Calculate next delay with exponential backoff
      const nextDelay = Math.min(delay, opts.maxDelay);

      // Log retry attempt
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(
        `⚠️  Attempt ${attempt} failed: ${errorMsg}\n` +
          `   Retrying in ${(nextDelay / 1000).toFixed(1)}s...`
      );

      // Call retry callback
      opts.onRetry(attempt, error, nextDelay);

      // Wait before retrying
      await sleep(nextDelay);

      // Increase delay for next attempt
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }
}

/**
 * Retry a function indefinitely on network errors
 * Uses 60-second fixed delay for retries
 *
 * @param fn - Async function to retry
 * @param onRetry - Optional callback on retry
 * @returns Result of the function
 */
export async function retryOnNetworkError<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> {
  return retryWithBackoff(fn, {
    maxAttempts: Infinity, // Retry forever
    initialDelay: 60000, // Start with 60 seconds (1 minute)
    maxDelay: 60000, // Keep at 60 seconds
    backoffMultiplier: 1, // No backoff - fixed interval
    shouldRetry: isNetworkError,
    onRetry: onRetry
      ? (attempt, error) => onRetry(attempt, error)
      : (attempt, error) => {
          // Log every retry attempt for WebSocket disconnections
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(
            `🔄 Network error detected (attempt ${attempt}): ${errorMsg}\n` +
            `   Will retry in 60 seconds...`
          );
        },
  });
}
