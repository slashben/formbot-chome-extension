// Initialize the session manager UI
document.addEventListener('DOMContentLoaded', function() {
    // Load available domains
    loadDomains();

    // Set up event listeners
    document.getElementById('domainSelect').addEventListener('change', loadSessionsForDomain);
    document.getElementById('clearDomainSessions').addEventListener('click', clearCurrentDomainData);
  });

  // Load all domains that have stored sessions
  function loadDomains() {
    chrome.storage.local.get(null, function(items) {
      if (chrome.runtime.lastError) {
        console.error('Error loading domains:', chrome.runtime.lastError);
        return;
      }

      // Find all unique domains from storage
      const domains = new Set();

      for (const key in items) {
        if (key.startsWith('activeSession:') || key.startsWith('sessionHistory:')) {
          const domain = key.split(':')[1];
          domains.add(domain);
        } else if (key.startsWith('formSession:')) {
          const sessionData = items[key];
          if (sessionData && sessionData.domain) {
            domains.add(sessionData.domain);
          }
        } else if (key.startsWith('siteContext:')) {
          const domain = key.split(':')[1];
          domains.add(domain);
        }
      }

      // Populate domain select dropdown
      const domainSelect = document.getElementById('domainSelect');
      domainSelect.innerHTML = '';

      if (domains.size === 0) {
        domainSelect.innerHTML = '<option value="">No domains found</option>';
        return;
      }

      // Add "Select domain" option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- Select a domain --';
      domainSelect.appendChild(defaultOption);

      // Add all domains as options
      Array.from(domains).sort().forEach(domain => {
        const option = document.createElement('option');
        option.value = domain;
        option.textContent = domain;
        domainSelect.appendChild(option);
      });
    });
  }

  // Load sessions for the selected domain
  function loadSessionsForDomain() {
    const domain = document.getElementById('domainSelect').value;

    if (!domain) {
      document.getElementById('sessionList').innerHTML = '<li class="no-data">No domain selected</li>';
      document.getElementById('sessionDetail').innerHTML = '<div class="no-data">Select a session to view details</div>';
      return;
    }

    // Get active session and session history for this domain
    chrome.storage.local.get([`activeSession:${domain}`, `sessionHistory:${domain}`], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error loading sessions:', chrome.runtime.lastError);
        return;
      }

      const activeSessionId = result[`activeSession:${domain}`];
      const sessionHistory = result[`sessionHistory:${domain}`] || [];

      // Get all form sessions for this domain
      chrome.storage.local.get(null, function(items) {
        if (chrome.runtime.lastError) {
          console.error('Error loading form sessions:', chrome.runtime.lastError);
          return;
        }

        // Find all session IDs for this domain (from active, history, and all storage)
        const sessionIds = new Set();

        // Add active session if it exists
        if (activeSessionId) {
          sessionIds.add(activeSessionId);
        }

        // Add sessions from history
        sessionHistory.forEach(session => {
          sessionIds.add(session.id);
        });

        // Find any other sessions for this domain in storage
        for (const key in items) {
          if (key.startsWith('formSession:')) {
            const sessionData = items[key];
            if (sessionData && sessionData.domain === domain) {
              sessionIds.add(sessionData.id);
            }
          }
        }

        // Get all session data
        const sessions = [];

        for (const sessionId of sessionIds) {
          const sessionKey = `formSession:${sessionId}`;
          if (items[sessionKey]) {
            sessions.push(items[sessionKey]);
          }
        }

        // Sort sessions by start time (newest first)
        sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

        // Update the session list UI
        updateSessionList(sessions, activeSessionId);
      });
    });
  }

  // Update the session list UI
  function updateSessionList(sessions, activeSessionId) {
    const sessionList = document.getElementById('sessionList');

    if (sessions.length === 0) {
      sessionList.innerHTML = '<li class="no-data">No sessions found</li>';
      return;
    }

    // Clear current list
    sessionList.innerHTML = '';

    // Add each session to the list
    sessions.forEach(session => {
      const sessionItem = document.createElement('li');
      sessionItem.className = 'session-item';
      sessionItem.dataset.id = session.id;

      // Mark active session
      if (session.id === activeSessionId) {
        sessionItem.classList.add('active');
        sessionItem.innerHTML = `
          <div><strong>${formatDate(session.startTime)}</strong> (Active)</div>
          <div>${session.pageUrl.substring(0, 30)}${session.pageUrl.length > 30 ? '...' : ''}</div>
        `;
      } else {
        sessionItem.innerHTML = `
          <div><strong>${formatDate(session.startTime)}</strong></div>
          <div>${session.pageUrl.substring(0, 30)}${session.pageUrl.length > 30 ? '...' : ''}</div>
        `;
      }

      // Add click event to view session details
      sessionItem.addEventListener('click', () => {
        // Remove active class from all items
        document.querySelectorAll('.session-item').forEach(item => {
          item.classList.remove('active');
        });

        // Add active class to clicked item
        sessionItem.classList.add('active');

        // Show session details
        displaySessionDetails(session);
      });

      sessionList.appendChild(sessionItem);
    });

    // Select the first session by default
    if (sessions.length > 0) {
      displaySessionDetails(sessions[0]);
      sessionList.querySelector('.session-item').classList.add('active');
    }
  }

  // Display session details
  function displaySessionDetails(session) {
    const sessionDetail = document.getElementById('sessionDetail');

    // Format date strings
    const startTime = formatDate(session.startTime, true);
    const endTime = session.endTime ? formatDate(session.endTime, true) : 'Session in progress';

    // Format duration
    let duration = 'N/A';
    if (session.endTime) {
      const durationMs = new Date(session.endTime) - new Date(session.startTime);
      duration = formatDuration(durationMs);
    }

    // Build the HTML for session details
    let html = `
      <div class="session-meta">
        <div class="session-meta-label">Session ID:</div>
        <div>${session.id}</div>

        <div class="session-meta-label">Domain:</div>
        <div>${session.domain}</div>

        <div class="session-meta-label">Page URL:</div>
        <div>${session.pageUrl}</div>

        <div class="session-meta-label">Start Time:</div>
        <div>${startTime}</div>

        <div class="session-meta-label">End Time:</div>
        <div>${endTime}</div>

        <div class="session-meta-label">Duration:</div>
        <div>${duration}</div>

        <div class="session-meta-label">Form Purpose:</div>
        <div>${session.formContext?.formPurpose || 'Unknown'}</div>

        <div class="session-meta-label">Fields Processed:</div>
        <div>${session.fieldsProcessed?.length || 0}</div>
      </div>
    `;

    // Add form context section if available
    if (session.formContext && Object.keys(session.formContext).length > 0) {
      html += `<h3>Form Context</h3>`;

      html += `<div class="field-item">`;
      for (const [key, value] of Object.entries(session.formContext)) {
        html += `<div><strong>${key}:</strong> ${value}</div>`;
      }
      html += `</div>`;
    }

    // Add fields processed section
    if (session.fieldsProcessed && session.fieldsProcessed.length > 0) {
      html += `<h3>Fields Processed</h3>`;

      session.fieldsProcessed.forEach((field, index) => {
        const fieldInfo = field.fieldInfo;
        const fieldName = fieldInfo.labelText || fieldInfo.name || fieldInfo.id || `Field ${index + 1}`;

        html += `
          <div class="field-item">
            <div class="field-label">${fieldName}</div>
            <div>Type: ${fieldInfo.tagName} ${fieldInfo.type ? `(${fieldInfo.type})` : ''}</div>
            ${fieldInfo.id ? `<div>ID: ${fieldInfo.id}</div>` : ''}
            ${fieldInfo.name ? `<div>Name: ${fieldInfo.name}</div>` : ''}
            ${fieldInfo.placeholder ? `<div>Placeholder: ${fieldInfo.placeholder}</div>` : ''}
            <div class="field-value">${field.aiResponse}</div>
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              Filled on ${formatDate(field.timestamp, true)}
            </div>
          </div>
        `;
      });
    } else {
      html += `<div class="no-data">No fields have been processed in this session</div>`;
    }

    // Add actions
    html += `
      <div class="actions">
        <button class="delete-session danger" data-id="${session.id}">Delete Session</button>
      </div>
    `;

    // Update the session detail container
    sessionDetail.innerHTML = html;

    // Add event listener for delete button
    sessionDetail.querySelector('.delete-session').addEventListener('click', function() {
      deleteSession(this.dataset.id);
    });
  }

  // Delete a session
  function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) {
      return;
    }

    // Get the session to find its domain
    chrome.storage.local.get([`formSession:${sessionId}`], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error getting session:', chrome.runtime.lastError);
        return;
      }

      const session = result[`formSession:${sessionId}`];
      if (!session) {
        console.error('Session not found:', sessionId);
        return;
      }

      const domain = session.domain;

      // Remove the session
      chrome.storage.local.remove([`formSession:${sessionId}`], function() {
        if (chrome.runtime.lastError) {
          console.error('Error deleting session:', chrome.runtime.lastError);
          return;
        }

        // Check if this was the active session, and remove if so
        chrome.storage.local.get([`activeSession:${domain}`], function(activeResult) {
          if (activeResult[`activeSession:${domain}`] === sessionId) {
            chrome.storage.local.remove([`activeSession:${domain}`]);
          }

          // Update session history
          chrome.storage.local.get([`sessionHistory:${domain}`], function(historyResult) {
            const history = historyResult[`sessionHistory:${domain}`] || [];
            const updatedHistory = history.filter(item => item.id !== sessionId);

            chrome.storage.local.set({[`sessionHistory:${domain}`]: updatedHistory}, function() {
              // Reload sessions for the domain
              loadSessionsForDomain();
            });
          });
        });
      });
    });
  }

  // Clear all data for the current domain
  function clearCurrentDomainData() {
    const domain = document.getElementById('domainSelect').value;

    if (!domain) {
      alert('Please select a domain first');
      return;
    }

    if (!confirm(`Are you sure you want to clear ALL data for ${domain}? This cannot be undone.`)) {
      return;
    }

    // Get all storage keys
    chrome.storage.local.get(null, function(items) {
      if (chrome.runtime.lastError) {
        console.error('Error getting storage:', chrome.runtime.lastError);
        return;
      }

      // Find keys related to this domain
      const keysToRemove = [];

      for (const key in items) {
        if (
          key === `activeSession:${domain}` ||
          key === `sessionHistory:${domain}` ||
          key === `siteContext:${domain}` ||
          (key.startsWith('formSession:') && items[key].domain === domain)
        ) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length === 0) {
        alert('No data found for this domain');
        return;
      }

      // Remove all keys
      chrome.storage.local.remove(keysToRemove, function() {
        if (chrome.runtime.lastError) {
          console.error('Error clearing data:', chrome.runtime.lastError);
          alert('Error clearing data: ' + chrome.runtime.lastError.message);
          return;
        }

        alert(`Successfully cleared all data for ${domain}`);

        // Reload domains
        loadDomains();

        // Clear session list and details
        document.getElementById('sessionList').innerHTML = '<li class="no-data">No sessions found</li>';
        document.getElementById('sessionDetail').innerHTML = '<div class="no-data">Select a session to view details</div>';
      });
    });
  }

  // Helper function to format dates
  function formatDate(dateString, includeTime = false) {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }

    if (includeTime) {
      return date.toLocaleString();
    }

    return date.toLocaleDateString();
  }

  // Helper function to format duration
  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }