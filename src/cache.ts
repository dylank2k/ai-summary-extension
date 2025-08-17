// Cache module for storing LLM responses by URL

interface CacheEntry {
  url: string;
  response: string;
  timestamp: number;
  model: string;
}

interface CacheStorage {
  [url: string]: CacheEntry;
}

export class SummaryCache {
  private static readonly STORAGE_KEY = 'summary_cache';
  private static readonly MAX_CACHE_SIZE = 100; // Maximum number of cached entries
  private static readonly CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days

  /**
   * Get cached summary for a URL
   * @param url The full URL to look up
   * @returns Cached summary or null if not found/expired
   */
  static async get(url: string): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      
      const cache: CacheStorage = result[this.STORAGE_KEY] || {};
      
      const entry = cache[url];
      
      if (!entry) {
        return null;
      }

      // Check if cache entry has expired
      const now = Date.now();
      const expiryTime = entry.timestamp + (this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      
      if (now > expiryTime) {
        // Entry expired, remove it
        await this.remove(url);
        return null;
      }

      return entry.response;
    } catch (error) {
      console.error('❌ Error reading from cache:', error);
      return null;
    }
  }

  /**
   * Store summary in cache
   * @param url The full URL as key
   * @param response The LLM response to cache
   * @param model The model used for the response
   */
  static async set(url: string, response: string, model: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      let cache: CacheStorage = result[this.STORAGE_KEY] || {};

      // Add new entry
      cache[url] = {
        url,
        response,
        timestamp: Date.now(),
        model
      };

      // Check cache size and remove oldest entries if needed
      const entries = Object.values(cache);
      if (entries.length > this.MAX_CACHE_SIZE) {
        // Sort by timestamp and remove oldest entries
        entries.sort((a, b) => a.timestamp - b.timestamp);
        const entriesToRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
        
        entriesToRemove.forEach(entry => {
          delete cache[entry.url];
        });
      }

      // Save updated cache
      await chrome.storage.local.set({ [this.STORAGE_KEY]: cache });
    } catch (error) {
      console.error('❌ Error writing to cache:', error);
    }
  }

  /**
   * Remove a specific entry from cache
   * @param url The URL to remove from cache
   */
  static async remove(url: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      const cache: CacheStorage = result[this.STORAGE_KEY] || {};
      
      delete cache[url];
      
      await chrome.storage.local.set({ [this.STORAGE_KEY]: cache });
    } catch (error) {
      console.error('Error removing from cache:', error);
    }
  }

  /**
   * Clear all cache entries
   */
  static async clear(): Promise<void> {
    try {
      await chrome.storage.local.remove([this.STORAGE_KEY]);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns Object with cache size and other stats
   */
  static async getStats(): Promise<{ size: number; oldestEntry?: string; newestEntry?: string }> {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      const cache: CacheStorage = result[this.STORAGE_KEY] || {};
      
      const entries = Object.values(cache);
      const size = entries.length;
      
      if (size === 0) {
        return { size: 0 };
      }

      entries.sort((a, b) => a.timestamp - b.timestamp);
      const oldestEntry = new Date(entries[0].timestamp).toLocaleString();
      const newestEntry = new Date(entries[entries.length - 1].timestamp).toLocaleString();

      return { size, oldestEntry, newestEntry };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { size: 0 };
    }
  }

  /**
   * Check if a URL is cached and not expired
   * @param url The URL to check
   * @returns true if cached and valid, false otherwise
   */
  static async has(url: string): Promise<boolean> {
    const cached = await this.get(url);
    return cached !== null;
  }
}