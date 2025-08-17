// Cache module for storing LLM responses by URL

interface CacheEntry {
  url: string;
  language: string;
  response: string;
  timestamp: number;
  model: string;
}

interface CacheStorage {
  [key: string]: CacheEntry;
}

export class SummaryCache {
  private static readonly STORAGE_KEY = 'summary_cache';
  private static readonly MAX_CACHE_SIZE = 100; // Maximum number of cached entries
  private static readonly CACHE_EXPIRY_DAYS = 1; // Cache expires after 7 days

  /**
   * Create cache key from URL and language
   * @param url The full URL
   * @param language The language preference
   * @returns Cache key in format "url|language"
   */
  private static createCacheKey(url: string, language: string): string {
    return `${url}|${language}`;
  }

  /**
   * Get cached summary for a URL and language
   * @param url The full URL to look up
   * @param language The language preference
   * @returns Cached summary or null if not found/expired
   */
  static async get(url: string, language: string): Promise<string | null> {
    try {
      const cacheKey = this.createCacheKey(url, language);
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);

      const cache: CacheStorage = result[this.STORAGE_KEY] || {};

      const entry = cache[cacheKey];

      if (!entry) {
        return null;
      }

      // Check if cache entry has expired
      const now = Date.now();
      const expiryTime = entry.timestamp + (this.CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      if (now > expiryTime) {
        // Entry expired, remove it
        await this.remove(url, language);
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
   * @param language The language preference
   * @param response The LLM response to cache
   * @param model The model used for the response
   */
  static async set(url: string, language: string, response: string, model: string): Promise<void> {
    try {
      const cacheKey = this.createCacheKey(url, language);
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      let cache: CacheStorage = result[this.STORAGE_KEY] || {};

      // Add new entry
      cache[cacheKey] = {
        url,
        language,
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
          const entryKey = this.createCacheKey(entry.url, entry.language);
          delete cache[entryKey];
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
   * @param language The language preference
   */
  static async remove(url: string, language: string): Promise<void> {
    try {
      const cacheKey = this.createCacheKey(url, language);
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      const cache: CacheStorage = result[this.STORAGE_KEY] || {};

      delete cache[cacheKey];

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
   * Check if a URL and language combination is cached and not expired
   * @param url The URL to check
   * @param language The language preference
   * @returns true if cached and valid, false otherwise
   */
  static async has(url: string, language: string): Promise<boolean> {
    const cached = await this.get(url, language);
    return cached !== null;
  }
}