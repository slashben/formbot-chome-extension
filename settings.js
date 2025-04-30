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
  chrome.storage.sync.get(['apiType', 'apiKey', 'apiModel', 'debugMode'], function(data) {
    if (data.apiType) {
      // Switch to the correct tab
      switchTab(data.apiType);

      // Fill in fields based on API type
      if (data.apiType === 'openai') {
        document.getElementById('openai-api-key').value = data.apiKey || '';
        document.getElementById('openai-model').value = data.apiModel || 'gpt-3.5-turbo';
        document.getElementById('tab-openai').click();
      } else if (data.apiType === 'anthropic') {
        document.getElementById('anthropic-api-key').value = data.apiKey || '';
        document.getElementById('anthropic-model').value = data.apiModel || 'claude-3-5-sonnet-20240620';
        document.getElementById('tab-anthropic').click();
      }
      document.getElementById('debugMode').checked = data.debugMode || false;
    }
  });

  // Save settings
  document.getElementById('save').addEventListener('click', function() {
    const apiType = document.querySelector('.tab.active').id === 'tab-openai' ? 'openai' : 'anthropic';
    const apiKey = document.getElementById(`${apiType}-api-key`).value;
    const apiModel = document.getElementById(`${apiType}-model`).value;
    const debugMode = document.getElementById('debugMode').checked;

    chrome.storage.sync.set({
      apiType: apiType,
      apiKey: apiKey,
      apiModel: apiModel,
      debugMode: debugMode
    }, function() {
      const status = document.getElementById('status');
      status.textContent = 'Settings saved!';
      status.className = 'status success';
      setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
      }, 2000);
    });
  });
}