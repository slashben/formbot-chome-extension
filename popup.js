document.addEventListener('DOMContentLoaded', function() {
  // Button click event listeners
  document.getElementById('fillCurrentField').addEventListener('click', fillCurrentField);
  document.getElementById('fillAllFields').addEventListener('click', fillAllFields);
  document.getElementById('openSettings').addEventListener('click', openSettings);

  // Check if API credentials are configured
  checkApiCredentials();
});

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

// Fill the currently focused input field
function fillCurrentField() {
  // Send message to the content script to handle the active field
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "fillCurrentField"}, function(response) {
      updateStatus(response);
    });
  });
}

// Fill all fields in the form
function fillAllFields() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "fillAllFields"}, function(response) {
      updateStatus(response);
    });
  });
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
}