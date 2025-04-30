// Global variable to store selected text
let selectedText = '';

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
  }
});

// Listen for message from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getAiCompletion") {
    handleAiCompletion(request.fieldInfo)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({error: error.message}));
    return true; // Keep the message channel open for async response
  } else if (request.action === "getSelectedText") {
    sendResponse({text: selectedText});
    return true;
  }
});

// Handle API calls to AI services
async function handleAiCompletion(fieldInfo) {
  try {
    // Get API settings
    const settings = await getApiSettings();

    if (!settings.apiType || !settings.apiKey) {
      throw new Error("API credentials not configured. Please check settings.");
    }

    // Create appropriate prompt for the field
    const prompt = createPrompt(fieldInfo);

    // Call the appropriate API
    let response;
    if (settings.apiType === 'openai') {
      response = await callOpenAiApi(prompt, settings.apiKey);
    } else if (settings.apiType === 'anthropic') {
      response = await callAnthropicApi(prompt, settings.apiKey, fieldInfo.bodyText);
    } else {
      throw new Error("Unsupported API type");
    }

    return {text: response};
  } catch (error) {
    console.error("AI Completion Error:", error);
    throw error;
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
    prompt += "Please provide a detailed and appropriate answer to fill this field ONLY based on the context provided. (don't answer other fields)";
    prompt += "The answer should be complete and meaningful, while staying focused on the field's purpose. ";
    prompt += "Make sure the response is appropriate for the field type and context and only contains the answer to the field (nothing else before or after the answer)\n";
  }

  return prompt;
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
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