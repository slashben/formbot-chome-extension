// Debug utility for FormBot
let debugEnabled = false;

// Initialize debug mode from settings
chrome.storage.sync.get(['debugMode'], function(data) {
  debugEnabled = data.debugMode || false;
});

// Listen for changes to debug mode
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync' && changes.debugMode) {
    debugEnabled = changes.debugMode.newValue;
  }
});

// Debug logging function
function debugLog(...args) {
  if (debugEnabled) {
    console.log('[FormBot]', ...args);
  }
}

// Debug error logging function
function debugError(...args) {
  if (debugEnabled) {
    console.error('[FormBot]', ...args);
  }
}

// Debug warning logging function
function debugWarn(...args) {
  if (debugEnabled) {
    console.warn('[FormBot]', ...args);
  }
}

// Export the debug functions
window.debugLog = debugLog;
window.debugError = debugError;
window.debugWarn = debugWarn;