document.addEventListener('DOMContentLoaded', function() {
  // Tab switching functionality
  document.getElementById('tab-openai').addEventListener('click', () => switchTab('openai'));
  document.getElementById('tab-anthropic').addEventListener('click', () => switchTab('anthropic'));
  
  // Save settings button
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  
  // Load existing settings
  loadSettings();
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

// Save settings to Chrome storage
function saveSettings() {
  // Determine which tab is active
  const activeTab = document.querySelector('.tab.active').id.split('-')[1]; // 'openai' or 'anthropic'
  
  // Get values based on active tab
  let apiType, apiKey, apiModel;
  
  if (activeTab === 'openai') {
    apiType = 'openai';
    apiKey = document.getElementById('openai-api-key').value.trim();
    apiModel = document.getElementById('openai-model').value;
  } else {
    apiType = 'anthropic';
    apiKey = document.getElementById('anthropic-api-key').value.trim();
    apiModel = document.getElementById('anthropic-model').value;
  }
  
  // Validate input
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  // Save to Chrome storage
  chrome.storage.sync.set({
    apiType: apiType,
    apiKey: apiKey,
    apiModel: apiModel
  }, function() {
    showStatus('Settings saved successfully!', 'success');
    
    // Simple validation by checking API key format
    if (apiType === 'openai' && !apiKey.startsWith('sk-')) {
      showStatus('Warning: OpenAI API keys usually start with "sk-"', 'error');
    } else if (apiType === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
      showStatus('Warning: Anthropic API keys usually start with "sk-ant-"', 'error');
    }
  });
}

// Show status message
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  statusElement.style.display = 'block';
  
  // Hide after a few seconds
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}

// Load existing settings from Chrome storage
function loadSettings() {
  chrome.storage.sync.get(['apiType', 'apiKey', 'apiModel'], function(data) {
    if (data.apiType) {
      // Switch to the correct tab
      switchTab(data.apiType);
      
      // Fill in fields based on API type
      if (data.apiType === 'openai') {
        document.getElementById('openai-api-key').value = data.apiKey || '';
        
        if (data.apiModel && document.querySelector(`#openai-model option[value="${data.apiModel}"]`)) {
          document.getElementById('openai-model').value = data.apiModel;
        }
      } else if (data.apiType === 'anthropic') {
        document.getElementById('anthropic-api-key').value = data.apiKey || '';
        
        if (data.apiModel && document.querySelector(`#anthropic-model option[value="${data.apiModel}"]`)) {
          document.getElementById('anthropic-model').value = data.apiModel;
        }
      }
    }
  });
}