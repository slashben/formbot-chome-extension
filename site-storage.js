// Site-specific storage utility for FormBot

/**
 * Utility class for managing site-specific storage
 */
class SiteStorage {
    /**
     * Get a site-specific key for storage
     * @param {string} domain - The domain name
     * @param {string} key - The storage key
     * @returns {string} - The combined key
     */
    static getSiteKey(domain, key) {
      return `site:${domain}:${key}`;
    }

    /**
     * Extract domain from a URL
     * @param {string} url - The full URL
     * @returns {string} - The domain name
     */
    static getDomainFromUrl(url) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname;
      } catch (e) {
        console.error('Error parsing URL:', e);
        return url; // Fallback to the original string
      }
    }

    /**
     * Save data for a specific site
     * @param {string} url - The site URL
     * @param {string} key - The storage key
     * @param {any} data - The data to store
     * @returns {Promise} - Promise resolving when storage is complete
     */
    static saveSiteData(url, key, data) {
      const domain = this.getDomainFromUrl(url);
      const siteKey = this.getSiteKey(domain, key);

      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [siteKey]: data }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }

    /**
     * Get data for a specific site
     * @param {string} url - The site URL
     * @param {string} key - The storage key
     * @returns {Promise<any>} - Promise resolving with the stored data
     */
    static getSiteData(url, key) {
      const domain = this.getDomainFromUrl(url);
      const siteKey = this.getSiteKey(domain, key);

      return new Promise((resolve, reject) => {
        chrome.storage.local.get(siteKey, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result[siteKey]);
          }
        });
      });
    }

    /**
     * Get all data for a specific site
     * @param {string} url - The site URL
     * @returns {Promise<Object>} - Promise resolving with all stored data for the site
     */
    static getAllSiteData(url) {
      const domain = this.getDomainFromUrl(url);
      const prefix = `site:${domain}:`;

      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const siteData = {};
          for (const key in items) {
            if (key.startsWith(prefix)) {
              // Extract the original key name
              const originalKey = key.substring(prefix.length);
              siteData[originalKey] = items[key];
            }
          }

          resolve(siteData);
        });
      });
    }

    /**
     * Delete data for a specific site
     * @param {string} url - The site URL
     * @param {string} key - The storage key
     * @returns {Promise} - Promise resolving when deletion is complete
     */
    static deleteSiteData(url, key) {
      const domain = this.getDomainFromUrl(url);
      const siteKey = this.getSiteKey(domain, key);

      return new Promise((resolve, reject) => {
        chrome.storage.local.remove(siteKey, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }

    /**
     * Clear all data for a specific site
     * @param {string} url - The site URL
     * @returns {Promise} - Promise resolving when all site data is cleared
     */
    static clearAllSiteData(url) {
      return new Promise((resolve, reject) => {
        const domain = this.getDomainFromUrl(url);
        const prefix = `site:${domain}:`;

        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const keysToRemove = Object.keys(items).filter(key => key.startsWith(prefix));

          if (keysToRemove.length === 0) {
            resolve();
            return;
          }

          chrome.storage.local.remove(keysToRemove, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      });
    }
  }

  // Export the class for use in other files
  window.SiteStorage = SiteStorage;