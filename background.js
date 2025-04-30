// Load form-session.js
importScripts('form-session.js');

// Global variable to store selected text
let selectedText = '';
let currentFormSession = null;

// Show welcome page on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open welcome page in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome.html')
    });
  }

  // Create context menus
  chrome.contextMenus.create({
    id: "useSelectedText",
    title: "Use selected text as form question (FormBot)",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "fillFormField",
    title: "Fill this field with FormBot",
    contexts: ["editable"]
  });

  chrome.contextMenus.create({
    id: "expandDraft",
    title: "Expand this draft with FormBot",
    contexts: ["selection", "editable"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "useSelectedText") {
    selectedText = info.selectionText;
    // Notify content script that text is selected
    chrome.tabs.sendMessage(tab.id, {action: "textSelected", text: selectedText});
  } else if (info.menuItemId === "fillFormField") {
    // Send message to content script to fill the field
    chrome.tabs.sendMessage(tab.id, {action: "fillCurrentField"});
  } else if (info.menuItemId === "expandDraft") {
    // Send message to content script to expand the draft
    chrome.tabs.sendMessage(tab.id, {action: "expandDraft", draft: info.selectionText});
  }
});

// Listen for message from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  debugLog('Background received message:', {
    action: request.action,
    sender: sender,
    timestamp: new Date().toISOString()
  });

  // Create a wrapper for sendResponse that logs the response
  const wrappedSendResponse = (response) => {
    debugLog('Background sending response:', {
      action: request.action,
      response: response,
      timestamp: new Date().toISOString()
    });
    sendResponse(response);
  };

  if (request.action === "getAiCompletion") {
    // Send to background script for API processing
    handleAiCompletion(request.fieldInfo, wrappedSendResponse)
      .catch(error => {
        console.error("AI Completion Error:", error);
        wrappedSendResponse({success: false, error: error.message});
      });
    return true; // Keep the message channel open for async response
  } else if (request.action === "getSelectedText") {
    wrappedSendResponse({text: selectedText});
    return false; // No need to keep channel open
  } else if (request.action === "debugTest") {
    console.log('Debug test received:', request.data);
    wrappedSendResponse({success: true, message: "Debug test successful"});
    return false; // No need to keep channel open
  } else if (request.action === "getSiteContext") {
    getSiteContext(sender.tab.url)
      .then(context => {
        wrappedSendResponse({success: true, context: context});
      })
      .catch(error => {
        console.error("Site Context Error:", error);
        wrappedSendResponse({success: false, error: error.message});
      });
    return true; // Keep the message channel open for async response
  } else if (request.action === "saveSiteContext") {
    saveSiteContext(sender.tab.url, request.key, request.data)
      .then(() => {
        wrappedSendResponse({success: true});
      })
      .catch(error => {
        console.error("Save Site Context Error:", error);
        wrappedSendResponse({success: false, error: error.message});
      });
    return true; // Keep the message channel open for async response
  } else if (request.action === "getCurrentSession") {
    wrappedSendResponse({
      hasActiveSession: currentFormSession !== null,
      sessionId: currentFormSession ? currentFormSession.id : null
    });
    return false; // No need to keep channel open
  } else if (request.action === "startNewSession") {
    startNewFormSession();
    wrappedSendResponse({success: true, message: "New form session started"});
    return false; // No need to keep channel open
  } else if (request.action === "endCurrentSession") {
    if (currentFormSession) {
      currentFormSession.endSession();
      currentFormSession = null;
      wrappedSendResponse({success: true, message: "Form session ended"});
    } else {
      wrappedSendResponse({success: false, message: "No active form session"});
    }
    return false; // No need to keep channel open
  }
});


  // Domain context storage
  async function getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      console.error('Error parsing URL:', e);
      return 'unknown-domain';
    }
  }

  async function getSiteContext(url) {
    const domain = await getDomainFromUrl(url);
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([`siteContext:${domain}`], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[`siteContext:${domain}`] || {});
        }
      });
    });
  }

  async function saveSiteContext(url, key, data) {
    const domain = await getDomainFromUrl(url);
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([`siteContext:${domain}`], (result) => {
        const context = result[`siteContext:${domain}`] || {};
        context[key] = data;

        chrome.storage.local.set({ [`siteContext:${domain}`]: context }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

// Handle API calls to AI services
async function handleAiCompletion(fieldInfo, sendResponse) {
  try {
    debugLog('Processing AI completion request:', {
      fieldInfo: fieldInfo,
      timestamp: new Date().toISOString()
    });

    // Get API key and model from storage
    const { apiKey, model } = await chrome.storage.sync.get(['apiKey', 'model']);
    if (!apiKey) {
      throw new Error('OpenAI API key not found. Please set it in the extension settings.');
    }

    // Create prompt with context
    const prompt = createPrompt(fieldInfo);
    debugLog('Created prompt:', {
      prompt: prompt,
      length: prompt.length,
      timestamp: new Date().toISOString()
    });

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      const error = await response.json();
      debugError('OpenAI API error:', {
        error: error,
        timestamp: new Date().toISOString()
      });
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    debugLog('Received OpenAI response:', {
      response: data,
      timestamp: new Date().toISOString()
    });

    const completion = data.choices[0].message.content.trim();
    sendResponse({ success: true, text: completion });
  } catch (error) {
    debugError('Error in handleAiCompletion:', {
      error: error,
      timestamp: new Date().toISOString()
    });
    sendResponse({ success: false, message: error.message });
  }
}

// Get API settings from storage
function getApiSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiType', 'apiKey', 'apiModel'], function(data) {
      resolve({
        apiType: data.apiType || '',
        apiKey: data.apiKey || '',
        apiModel: data.apiModel || 'gpt-3.5-turbo' // Default model
      });
    });
  });
}

// Create prompt based on field information
function createPrompt(fieldInfo) {
  // Base prompt
  let prompt = "I need help filling out a form field. The page is attached.\n";

  // If there's a selected question, use it
  if (fieldInfo.selectedQuestion) {
    prompt += `The question I want to answer is: "${fieldInfo.selectedQuestion}"\n`;
    prompt += "Please provide an answer to this specific question.\n";
  } else {
    prompt += "These are the identifiers of the form field:\n";

    prompt += `The HTML element is: <${fieldInfo.tagName}${fieldInfo.type ? ` type="${fieldInfo.type}"` : ''}${fieldInfo.name ? ` name="${fieldInfo.name}"` : ''}${fieldInfo.id ? ` id="${fieldInfo.id}"` : ''}${fieldInfo.className ? ` class="${fieldInfo.className}"` : ''}${fieldInfo.placeholder ? ` placeholder="${fieldInfo.placeholder}"` : ''}${fieldInfo.ariaLabel ? ` aria-label="${fieldInfo.ariaLabel}"` : ''}>\n`;

    // Add field-specific information
    if (fieldInfo.labelText) {
      prompt += `The field label is "${fieldInfo.labelText}". \n`;
    }

    if (fieldInfo.name) {
      prompt += `The field name is "${fieldInfo.name}". \n`;
    }

    if (fieldInfo.placeholder) {
      prompt += `The placeholder text is "${fieldInfo.placeholder}". \n`;
    }

    if (fieldInfo.ariaLabel) {
      prompt += `The aria-label is "${fieldInfo.ariaLabel}". \n`;
    }

    // Add surrounding text for context
    if (fieldInfo.surroundingText) {
      prompt += `Surrounding text: "${fieldInfo.surroundingText}". \n`;
    }

    if (fieldInfo.className) {
      prompt += `The class name is "${fieldInfo.className}". \n`;
    }

    if (fieldInfo.class) {
      prompt += `The class is "${fieldInfo.class}". \n`;
    }

    if (fieldInfo.id) {
      prompt += `The id is "${fieldInfo.id}". \n`;
    }
  }

  // Add constraints
  if (fieldInfo.required) {
    prompt += "This field is required. \n";
  }

  if (fieldInfo.minLength > 0) {
    prompt += `The minimum length is ${fieldInfo.minLength} characters. \n`;
  }

  if (fieldInfo.maxLength > 0) {
    prompt += `The maximum length is ${fieldInfo.maxLength} characters. \n`;
  }

  if (fieldInfo.pattern) {
    prompt += `The input must match this pattern: ${fieldInfo.pattern}. \n`;
  }

  // Handle select fields differently
  if (fieldInfo.tagName === 'SELECT' && fieldInfo.options && fieldInfo.options.length > 0) {
    prompt += `This is a dropdown field with the following options: ${fieldInfo.options.join(', ')}. `;
    prompt += "Please select the most appropriate option based on the context.";
  } else {
    // General request for text input
    if (fieldInfo.draft) {
      prompt += `I have a draft for this field: "${fieldInfo.draft}"\n`;
      prompt += "Please expand on this draft while maintaining its core meaning. Staying focused on the field's purpose. Do not add any other text before or after the actual answer.\n";
    } else {
      prompt += "Please provide a detailed and appropriate answer to fill this field ONLY based on the context provided. (don't answer other fields)";
      prompt += "The answer should be complete and meaningful, while staying focused on the field's purpose. ";
      prompt += "Make sure the response is appropriate for the field type and context and only contains the answer to the field (nothing else before or after the answer)\n";
    }
  }

  // Add previous questions and answers as context if available
  if (fieldInfo.sessionId) {
    console.log('Session ID:', fieldInfo.sessionId);
    return FormSessionManager.getSessionById(fieldInfo.sessionId)
      .then(session => {
        console.log('Session:', session);
        if (session && session.fieldsProcessed && session.fieldsProcessed.length > 0) {
          console.log('Session fields processed:', session.fieldsProcessed);
          prompt += "\nHere are the previous questions and answers from this form session:\n";
          session.fieldsProcessed.forEach((field, index) => {
            const question = field.fieldInfo.selectedQuestion || field.fieldInfo.labelText || field.fieldInfo.ariaLabel || field.fieldInfo.placeholder || `Question ${index + 1}`;
            const answer = field.aiResponse;
            prompt += `Q: ${question}\nA: ${answer}\n\n`;
          });
        }
        return prompt;
      })
      .catch(error => {
        console.error('Error getting session context:', error);
        return prompt;
      });
  }

  return Promise.resolve(prompt);
}

// Call OpenAI API
async function callOpenAiApi(prompt, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that fills out form fields. Provide only the text that should go in the field without any explanations or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'OpenAI API error');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// Call Anthropic API
async function callAnthropicApi(prompt, apiKey, body) {
  console.log('Anthropic API Prompt:', prompt);

  try {
    // Get API settings including the model
    const settings = await getApiSettings();
    const model = settings.apiModel || 'claude-3-5-sonnet-20240620'; // Default to haiku if not set

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'text',
                text: `Here is the HTML content:\n${body}`
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Anthropic API Error:', error);
      throw new Error(error.error?.message || 'Anthropic API error');
    }

    const data = await response.json();
    console.log('Anthropic API Response:', data);
    const responseText = data.content
      .map(item => item.text)
      .join('')
      .trim();

    return responseText;
  } catch (error) {
    console.error('API Call Error:', error);
    throw error;
  }
}