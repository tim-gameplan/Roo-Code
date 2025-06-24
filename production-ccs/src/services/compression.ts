/**
 * Message Compression Service for TASK-005.1.2
 *
 * This module implements message compression and decompression for mobile-optimized
 * communication protocols, supporting multiple compression algorithms.
 */

import { promisify } from 'util';
import { gzip, gunzip, brotliCompress, brotliDecompress } from 'zlib';
import { logger } from '@/utils/logger';
import { CompressionType, CompressionError } from '@/types/mobile';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

/**
 * Compression configuration
 */
export interface CompressionConfig {
  enabled: boolean;
  algorithms: CompressionType[];
  threshold: number;
  level: number;
}

/**
 * Compression service for mobile messages
 */
export class CompressionService {
  private config: CompressionConfig;

  constructor(config: CompressionConfig) {
    this.config = config;
    logger.debug('Compression service initialized', {
      enabled: config.enabled,
      algorithms: config.algorithms,
      threshold: config.threshold,
      level: config.level,
    });
  }

  /**
   * Compress data using specified algorithm
   */
  public async compress(data: string, algorithm: CompressionType): Promise<string> {
    if (!this.config.enabled || algorithm === 'none') {
      return data;
    }

    try {
      const buffer = Buffer.from(data, 'utf8');
      let compressed: Buffer;

      switch (algorithm) {
        case 'gzip':
          compressed = await gzipAsync(buffer, { level: this.config.level });
          break;
        case 'brotli':
          compressed = await brotliCompressAsync(buffer, {
            params: {
              [require('zlib').constants.BROTLI_PARAM_QUALITY]: this.config.level,
            },
          });
          break;
        default:
          throw new CompressionError(`Unsupported compression algorithm: ${algorithm}`, algorithm);
      }

      // Return base64 encoded compressed data
      const result = compressed.toString('base64');

      logger.debug('Data compressed', {
        algorithm,
        originalSize: buffer.length,
        compressedSize: compressed.length,
        ratio: compressed.length / buffer.length,
      });

      return result;
    } catch (error) {
      logger.error('Compression failed', {
        algorithm,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CompressionError(
        `Compression failed: ${error instanceof Error ? error.message : String(error)}`,
        algorithm
      );
    }
  }

  /**
   * Decompress data using specified algorithm
   */
  public async decompress(data: string, algorithm: CompressionType): Promise<string> {
    if (!this.config.enabled || algorithm === 'none') {
      return data;
    }

    try {
      const buffer = Buffer.from(data, 'base64');
      let decompressed: Buffer;

      switch (algorithm) {
        case 'gzip':
          decompressed = await gunzipAsync(buffer);
          break;
        case 'brotli':
          decompressed = await brotliDecompressAsync(buffer);
          break;
        default:
          throw new CompressionError(`Unsupported compression algorithm: ${algorithm}`, algorithm);
      }

      const result = decompressed.toString('utf8');

      logger.debug('Data decompressed', {
        algorithm,
        compressedSize: buffer.length,
        decompressedSize: decompressed.length,
        ratio: buffer.length / decompressed.length,
      });

      return result;
    } catch (error) {
      logger.error('Decompression failed', {
        algorithm,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new CompressionError(
        `Decompression failed: ${error instanceof Error ? error.message : String(error)}`,
        algorithm
      );
    }
  }

  /**
   * Check if data should be compressed based on size threshold
   */
  public shouldCompress(data: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const size = Buffer.byteLength(data, 'utf8');
    return size >= this.config.threshold;
  }

  /**
   * Get compression ratio for data
   */
  public async getCompressionRatio(data: string, algorithm: CompressionType): Promise<number> {
    if (algorithm === 'none') {
      return 1.0;
    }

    try {
      const originalSize = Buffer.byteLength(data, 'utf8');
      const compressed = await this.compress(data, algorithm);
      const compressedSize = Buffer.byteLength(compressed, 'base64');

      return compressedSize / originalSize;
    } catch (error) {
      logger.warn('Failed to calculate compression ratio', {
        algorithm,
        error: error instanceof Error ? error.message : String(error),
      });
      return 1.0;
    }
  }

  /**
   * Get best compression algorithm for data
   */
  public async getBestAlgorithm(
    data: string,
    supportedAlgorithms: CompressionType[]
  ): Promise<CompressionType> {
    if (!this.config.enabled || !this.shouldCompress(data)) {
      return 'none';
    }

    const availableAlgorithms = this.config.algorithms.filter(
      (alg) => supportedAlgorithms.includes(alg) && alg !== 'none'
    );

    if (availableAlgorithms.length === 0) {
      return 'none';
    }

    if (availableAlgorithms.length === 1) {
      return availableAlgorithms[0]!;
    }

    // Test compression ratios for available algorithms
    const ratios = await Promise.allSettled(
      availableAlgorithms.map(async (algorithm) => ({
        algorithm,
        ratio: await this.getCompressionRatio(data, algorithm),
      }))
    );

    // Find algorithm with best compression ratio
    let bestAlgorithm: CompressionType = availableAlgorithms[0]!;
    let bestRatio = 1.0;

    for (const result of ratios) {
      if (result.status === 'fulfilled' && result.value.ratio < bestRatio) {
        bestAlgorithm = result.value.algorithm;
        bestRatio = result.value.ratio;
      }
    }

    logger.debug('Best compression algorithm selected', {
      algorithm: bestAlgorithm,
      ratio: bestRatio,
      dataSize: Buffer.byteLength(data, 'utf8'),
    });

    return bestAlgorithm;
  }

  /**
   * Update compression configuration
   */
  public updateConfig(config: Partial<CompressionConfig>): void {
    Object.assign(this.config, config);
    logger.debug('Compression configuration updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): CompressionConfig {
    return { ...this.config };
  }

  /**
   * Get compression statistics
   */
  public getStats(): {
    enabled: boolean;
    supportedAlgorithms: CompressionType[];
    threshold: number;
    level: number;
  } {
    return {
      enabled: this.config.enabled,
      supportedAlgorithms: this.config.algorithms,
      threshold: this.config.threshold,
      level: this.config.level,
    };
  }
}
