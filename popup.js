document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    document.getElementById('tab-forms').addEventListener('click', () => switchTab('forms'));
    document.getElementById('tab-session').addEventListener('click', () => switchTab('session'));

    // Button click event listeners
    document.getElementById('fillCurrentField').addEventListener('click', fillCurrentField);
    document.getElementById('fillAllFields').addEventListener('click', fillAllFields);
    document.getElementById('openSettings').addEventListener('click', openSettings);

    // Session management buttons
    document.getElementById('newSession').addEventListener('click', startNewSession);
    document.getElementById('endSession').addEventListener('click', endCurrentSession);
    document.getElementById('viewSessions').addEventListener('click', openSessionManager);

    // Check if API credentials are configured
    checkApiCredentials();

    // Check for active session
    checkActiveSession();
  });

  // Switch between tabs
  function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`content-${tabName}`).classList.add('active');
  }

  // Check if API credentials are set
  function checkApiCredentials() {
    chrome.storage.sync.get(['apiType', 'apiKey'], function(data) {
      const statusElement = document.getElementById('status');

      if (!data.apiType || !data.apiKey) {
        statusElement.textContent = 'Please configure your API settings first';
        statusElement.className = 'error';

        // Disable buttons if not configured
        document.getElementById('fillCurrentField').disabled = true;
        document.getElementById('fillAllFields').disabled = true;
      } else {
        statusElement.textContent = `Connected to ${data.apiType} API`;
        statusElement.className = 'success';
      }
    });
  }

  // Check for active session
  function checkActiveSession() {
    // Get current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      if (!currentTab) {
        updateSessionInfo(null);
        return;
      }

      // Extract domain from URL
      const url = new URL(currentTab.url);
      const domain = url.hostname;

      // Check for active session in this domain
      chrome.storage.local.get([`activeSession:${domain}`], function(result) {
        const activeSessionId = result[`activeSession:${domain}`];

        if (!activeSessionId) {
          updateSessionInfo(null);
          return;
        }

        // Get session details
        chrome.storage.local.get([`formSession:${activeSessionId}`], function(sessionResult) {
          const sessionData = sessionResult[`formSession:${activeSessionId}`];

          if (!sessionData) {
            updateSessionInfo(null);
            return;
          }

          updateSessionInfo(sessionData);
        });
      });

      // Also ask the content script if it has an active session
      chrome.tabs.sendMessage(currentTab.id, {action: "getCurrentSession"}, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error checking session:", chrome.runtime.lastError);
          return;
        }

        if (response && response.hasActiveSession) {
          // Content script has an active session, update button states
          document.getElementById('newSession').disabled = true;
          document.getElementById('endSession').disabled = false;
        }
      });
    });
  }

  // Update session info UI
  function updateSessionInfo(sessionData) {
    const sessionInfo = document.getElementById('sessionInfo');

    if (!sessionData) {
      sessionInfo.innerHTML = '<div class="no-session">No active form session</div>';
      document.getElementById('endSession').disabled = true;
      document.getElementById('newSession').disabled = false;
      return;
    }

    // Format start time
    const startTime = new Date(sessionData.startTime).toLocaleTimeString();

    // Calculate duration
    const now = new Date();
    const startDate = new Date(sessionData.startTime);
    const durationMs = now - startDate;
    const durationMinutes = Math.floor(durationMs / 60000);
    const durationSeconds = Math.floor((durationMs % 60000) / 1000);
    const durationFormatted = `${durationMinutes}m ${durationSeconds}s`;

    // Build session info HTML
    let html = `
      <div class="session-field">
        <span class="session-field-label">URL:</span>
        <span>${sessionData.pageUrl.substring(0, 25)}${sessionData.pageUrl.length > 25 ? '...' : ''}</span>
      </div>
      <div class="session-field">
        <span class="session-field-label">Started:</span>
        <span>${startTime}</span>
      </div>
      <div class="session-field">
        <span class="session-field-label">Duration:</span>
        <span>${durationFormatted}</span>
      </div>
      <div class="session-field">
        <span class="session-field-label">Fields:</span>
        <span>${sessionData.fieldsProcessed ? sessionData.fieldsProcessed.length : 0} filled</span>
      </div>
    `;

    // If form purpose is known, show it
    if (sessionData.formContext && sessionData.formContext.formPurpose) {
      html += `
        <div class="session-field">
          <span class="session-field-label">Form Type:</span>
          <span>${sessionData.formContext.formPurpose}</span>
        </div>
      `;
    }

    sessionInfo.innerHTML = html;

    // Update button states
    document.getElementById('endSession').disabled = false;
    document.getElementById('newSession').disabled = true;
  }

  // Fill the currently focused input field
  function fillCurrentField() {
    // Show loading status
    updateStatus('Processing...', 'info');

    // Send message to the content script to handle the active field
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "fillCurrentField"}, function(response) {
        updateStatus(response);

        // Check for active session after filling
        setTimeout(checkActiveSession, 500);
      });
    });
  }

  // Fill all fields in the form
  function fillAllFields() {
    // Show loading status
    updateStatus('Processing all fields...', 'info');

    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "fillAllFields"}, function(response) {
        updateStatus(response);

        // Check for active session after filling
        setTimeout(checkActiveSession, 500);
      });
    });
  }

  // Start a new form session
  function startNewSession() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "startNewSession"}, function(response) {
        if (response && response.success) {
          updateStatus({success: true, message: "New form session started"});

          // Check for active session after starting
          setTimeout(checkActiveSession, 500);
        } else {
          updateStatus({success: false, message: "Failed to start new session"});
        }
      });
    });
  }

  // End the current form session
  function endCurrentSession() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "endCurrentSession"}, function(response) {
        updateStatus(response);

        // Check for active session after ending
        setTimeout(checkActiveSession, 500);
      });
    });
  }

  // Open the session manager
  function openSessionManager() {
    chrome.tabs.create({url: 'sessions.html'});
  }

  // Open settings page
  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  // Update status message
  function updateStatus(response) {
    const statusElement = document.getElementById('status');

    if (response && response.success) {
      statusElement.textContent = response.message;
      statusElement.className = 'success';
    } else {
      statusElement.textContent = response && response.message ? response.message : 'Operation failed';
      statusElement.className = 'error';
    }

    // Auto-clear status after a few seconds
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.className = '';
    }, 3000);
  }