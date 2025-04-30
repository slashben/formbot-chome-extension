// Form Session Management for FormBot

/**
 * Class to manage a form filling session
 * Stores context about the current form being filled
 */
class FormSession {
    constructor(formElement, pageUrl) {
      this.id = this.generateSessionId();
      this.startTime = new Date();
      this.formElement = formElement;
      this.pageUrl = pageUrl;
      this.domain = this.extractDomain(pageUrl);
      this.fieldsProcessed = [];
      this.formContext = {};
      this.aiResponses = {};
    }

    /**
     * Generate a unique session ID
     */
    generateSessionId() {
      return 'form_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * Extract domain from URL
     */
    extractDomain(url) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname;
      } catch (e) {
        console.error('Error parsing URL:', e);
        return 'unknown-domain';
      }
    }

    /**
     * Record a field that has been processed
     */
    recordFieldProcessed(fieldInfo, aiResponse) {
      const fieldData = {
        fieldInfo: fieldInfo,
        aiResponse: aiResponse,
        timestamp: new Date()
      };

      this.fieldsProcessed.push(fieldData);

      // Store the response by field ID or name for easy lookup
      const fieldId = fieldInfo.id || fieldInfo.name || `field_${this.fieldsProcessed.length}`;
      this.aiResponses[fieldId] = aiResponse;

      // Save session after each update
      this.saveSession();

      return fieldData;
    }

    /**
     * Add context information about the form
     */
    addFormContext(key, value) {
      this.formContext[key] = value;
      this.saveSession();
    }

    /**
     * Save the current session to storage
     */
    saveSession() {
      const sessionData = {
        id: this.id,
        startTime: this.startTime,
        domain: this.domain,
        pageUrl: this.pageUrl,
        formContext: this.formContext,
        fieldsProcessed: this.fieldsProcessed,
        aiResponses: this.aiResponses,
        lastUpdated: new Date()
      };

      // Save to chrome.storage.local
      chrome.storage.local.set({ [`formSession:${this.id}`]: sessionData });

      // Also save as the current active session for this domain
      chrome.storage.local.set({ [`activeSession:${this.domain}`]: this.id });
    }

    /**
     * End the current session
     */
    endSession() {
      const sessionData = {
        id: this.id,
        startTime: this.startTime,
        endTime: new Date(),
        domain: this.domain,
        pageUrl: this.pageUrl,
        formContext: this.formContext,
        fieldsProcessed: this.fieldsProcessed,
        aiResponses: this.aiResponses,
        completed: true
      };

      // Save completed session
      chrome.storage.local.set({ [`formSession:${this.id}`]: sessionData });

      // Remove as active session
      chrome.storage.local.remove([`activeSession:${this.domain}`]);

      // Add to session history
      this.addToSessionHistory(sessionData);

      return sessionData;
    }

    /**
     * Add session to history
     */
    addToSessionHistory(sessionData) {
      // Get existing history
      chrome.storage.local.get([`sessionHistory:${this.domain}`], (result) => {
        let history = result[`sessionHistory:${this.domain}`] || [];

        // Add current session to history
        history.push({
          id: sessionData.id,
          startTime: sessionData.startTime,
          endTime: sessionData.endTime,
          pageUrl: sessionData.pageUrl,
          fieldsCount: sessionData.fieldsProcessed.length
        });

        // Keep only last 10 sessions
        if (history.length > 10) {
          history = history.slice(-10);
        }

        // Save updated history
        chrome.storage.local.set({ [`sessionHistory:${this.domain}`]: history });
      });
    }

    /**
     * Get AI responses for all fields
     */
    getAllResponses() {
      return this.aiResponses;
    }

    /**
     * Get AI response for a specific field
     */
    getResponseForField(fieldId) {
      return this.aiResponses[fieldId];
    }

    /**
     * Get session duration
     */
    getSessionDuration() {
      const now = new Date();
      return (now - this.startTime) / 1000; // Duration in seconds
    }
  }

  /**
   * Static methods to work with form sessions
   */
  class FormSessionManager {
    /**
     * Create a new form session
     */
    static createSession(formElement, pageUrl) {
      const session = new FormSession(formElement, pageUrl);
      return session;
    }

    /**
     * Get active session for a domain
     */
    static getActiveSession(domain) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get([`activeSession:${domain}`], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const sessionId = result[`activeSession:${domain}`];
          if (!sessionId) {
            resolve(null);
            return;
          }

          chrome.storage.local.get([`formSession:${sessionId}`], (sessionResult) => {
            resolve(sessionResult[`formSession:${sessionId}`]);
          });
        });
      });
    }

    /**
     * Get session by ID
     */
    static getSessionById(sessionId) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get([`formSession:${sessionId}`], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          resolve(result[`formSession:${sessionId}`]);
        });
      });
    }

    /**
     * Get session history for a domain
     */
    static getSessionHistory(domain) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get([`sessionHistory:${domain}`], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          resolve(result[`sessionHistory:${domain}`] || []);
        });
      });
    }

    /**
     * Clear all sessions for a domain
     */
    static clearDomainSessions(domain) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const keysToRemove = Object.keys(items).filter(key =>
            key === `activeSession:${domain}` ||
            key === `sessionHistory:${domain}` ||
            (key.startsWith('formSession:') && items[key].domain === domain)
          );

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

  // Export classes for use in other files
  window.FormSession = FormSession;
  window.FormSessionManager = FormSessionManager;