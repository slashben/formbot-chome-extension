// Global variables
let activeField = null;
let selectedQuestion = '';

// Set up message listener
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "fillCurrentField") {
    handleFillCurrentField(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === "fillAllFields") {
    handleFillAllFields(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === "textSelected") {
    selectedQuestion = request.text;
    // Show a notification that text is selected
    showNotification(`Question selected: "${selectedQuestion}"`);
    return true;
  } else if (request.action === "getSelectedText") {
    sendResponse({text: selectedQuestion});
    return true;
  }
});

// Monitor for field focus to track active field
document.addEventListener('focusin', function(e) {
  if (isFormField(e.target)) {
    activeField = e.target;
  }
});

// Also track right-click on form fields
document.addEventListener('contextmenu', function(e) {
  if (isFormField(e.target)) {
    activeField = e.target;
  }
});

// Check if element is a form field
function isFormField(element) {
  const formFieldTypes = ['INPUT', 'TEXTAREA', 'SELECT'];
  if (!element || !element.tagName) return false;

  // For INPUT elements, exclude certain types
  if (element.tagName === 'INPUT') {
    const excludedTypes = ['button', 'submit', 'reset', 'file', 'image', 'radio', 'checkbox'];
    return !excludedTypes.includes(element.type);
  }

  return formFieldTypes.includes(element.tagName);
}

// Handle filling the current field
async function handleFillCurrentField(sendResponse) {
  try {
    // If no field is active, look for a focused field
    if (!activeField) {
      activeField = document.querySelector('input:focus, textarea:focus, select:focus');
    }

    // If still no active field, respond with error
    if (!activeField) {
      sendResponse({success: false, message: "No field selected. Click on a form field first."});
      return;
    }

    // Get field context
    const fieldInfo = getFieldInfo(activeField);

    // Send to background script for API processing
    const aiResponse = await requestAiCompletion(fieldInfo);

    // Fill the field with AI response
    if (aiResponse && aiResponse.text) {
      fillField(activeField, aiResponse.text);
      sendResponse({success: true, message: "Field filled successfully!"});
    } else {
      sendResponse({success: false, message: "Failed to get AI response"});
    }
  } catch (error) {
    console.error("Error filling field:", error);
    sendResponse({success: false, message: `Error: ${error.message}`});
  }
}

// Handle filling all fields in a form
async function handleFillAllFields(sendResponse) {
  try {
    // First, identify the form that contains the active field
    const currentForm = activeField ? findParentForm(activeField) : document.querySelector('form');

    if (!currentForm) {
      sendResponse({success: false, message: "No form found on this page"});
      return;
    }

    // Find all form fields
    const formFields = Array.from(currentForm.querySelectorAll('input, textarea, select')).filter(isFormField);

    if (formFields.length === 0) {
      sendResponse({success: false, message: "No form fields found"});
      return;
    }

    // Process fields sequentially
    let filledCount = 0;
    for (const field of formFields) {
      // Skip fields that already have values
      if (field.value && field.value.trim() !== '') continue;

      const fieldInfo = getFieldInfo(field);
      const aiResponse = await requestAiCompletion(fieldInfo);

      if (aiResponse && aiResponse.text) {
        fillField(field, aiResponse.text);
        filledCount++;
      }
    }

    sendResponse({success: true, message: `Successfully filled ${filledCount} fields`});
  } catch (error) {
    console.error("Error filling all fields:", error);
    sendResponse({success: false, message: `Error: ${error.message}`});
  }
}

// Find parent form element
function findParentForm(element) {
  let current = element;
  while (current && current.tagName !== 'FORM') {
    current = current.parentElement;
  }
  return current;
}

// Get field context information
function getFieldInfo(field) {
  const fieldInfo = {
    tagName: field.tagName,
    type: field.type || "",
    id: field.id || "",
    name: field.name || "",
    placeholder: field.placeholder || "",
    className: field.className || "",
    class: field.class || "",
    ariaLabel: field.getAttribute('aria-label') || "",
    required: field.required || false,
    minLength: field.minLength || 0,
    maxLength: field.maxLength || 0,
    pattern: field.pattern || "",
    pageTitle: document.title,
    pageUrl: window.location.href,
    surroundingText: getSurroundingText(field),
    bodyText: getBodyText(field),
    labelText: getLabelText(field),
    selectedQuestion: selectedQuestion // Add the selected question to field info
  };

  // For select fields, include options
  if (field.tagName === 'SELECT') {
    fieldInfo.options = Array.from(field.options).map(option => option.text);
  }

  return fieldInfo;
}

function getBodyText(field) {
  const body = document.body;
  return body.textContent.trim();
}

// Get text from associated label
function getLabelText(field) {
  let labelText = "";

  // Try to find label by for attribute
  if (field.id) {
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) {
      labelText = label.textContent.trim();
    }
  }

  // If no label found and field is inside a label
  if (!labelText) {
    const parentLabel = field.closest('label');
    if (parentLabel) {
      // Get text while excluding the field itself
      const clone = parentLabel.cloneNode(true);
      const fieldInClone = clone.querySelector(`#${field.id}`);
      if (fieldInClone) fieldInClone.remove();
      labelText = clone.textContent.trim();
    }
  }

  return labelText;
}

// Get surrounding text context
function getSurroundingText(field) {
  let context = [];

  console.log('Surrounding text field:', field);

  // 1. Get text from parent containers (expanded range)
  const parentContainers = field.closest('div, form, section, fieldset, article, main, aside, nav, header, footer, li, td, th');
  if (parentContainers) {
    const clone = parentContainers.cloneNode(true);
    // Remove all form fields and buttons from the clone
    const interactiveElements = clone.querySelectorAll('input, textarea, select, button, a');
    interactiveElements.forEach(el => el.remove());
    console.log('Surrounding text clone:', clone.textContent.trim());
    context.push(clone.textContent.trim());
  }

  // 2. Get text from previous siblings (expanded)
  let prevSibling = field.previousElementSibling;
  let prevCount = 0;
  while (prevSibling && prevCount < 3) { // Look at up to 3 previous siblings
    if (!prevSibling.matches('input, textarea, select, button')) {
      context.push(prevSibling.textContent.trim());
    }
    prevSibling = prevSibling.previousElementSibling;
    prevCount++;
  }

  // 3. Get text from next siblings (expanded)
  let nextSibling = field.nextElementSibling;
  let nextCount = 0;
  while (nextSibling && nextCount < 3) { // Look at up to 3 next siblings
    if (!nextSibling.matches('input, textarea, select, button')) {
      context.push(nextSibling.textContent.trim());
    }
    nextSibling = nextSibling.nextElementSibling;
    nextCount++;
  }

  // 4. Get text from associated labels and descriptions
  if (field.id) {
    // Look for labels with matching for attribute
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) {
      context.push(label.textContent.trim());
    }

    // Look for aria-describedby elements
    const describedBy = field.getAttribute('aria-describedby');
    if (describedBy) {
      const describedElements = describedBy.split(' ').map(id => document.getElementById(id));
      describedElements.forEach(el => {
        if (el) context.push(el.textContent.trim());
      });
    }
  }

  // 5. Get text from parent label if field is inside one
  const parentLabel = field.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    const fieldInClone = clone.querySelector(`#${field.id}`);
    if (fieldInClone) fieldInClone.remove();
    context.push(clone.textContent.trim());
  }

  // 6. Get text from fieldset legend if field is inside a fieldset
  const fieldset = field.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) {
      context.push(legend.textContent.trim());
    }
  }

  // 7. Get text from nearby headings
  const headings = field.closest('div, section, article, form')?.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings) {
    Array.from(headings).forEach(heading => {
      context.push(heading.textContent.trim());
    });
  }

  // Combine all context, remove duplicates and empty strings
  const uniqueContext = [...new Set(context.filter(text => text.length > 0))];

  console.log('Unique context:', uniqueContext);

  // Join with spaces and limit total length
  return uniqueContext.join(' ').replace(/\s+/g, ' ').slice(0, 1000); // Increased limit to 1000 chars
}

// Request AI completion via background script
async function requestAiCompletion(fieldInfo) {
  return new Promise((resolve, reject) => {
    const maxRetries = 3;
    let retryCount = 0;

    function sendMessage() {
      chrome.runtime.sendMessage(
        {action: "getAiCompletion", fieldInfo},
        function(response) {
          if (chrome.runtime.lastError) {
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying message send (attempt ${retryCount}/${maxRetries})...`);
              setTimeout(sendMessage, 1000); // Wait 1 second before retrying
            } else {
              reject(new Error(`Failed to connect to background script after ${maxRetries} attempts: ${chrome.runtime.lastError.message}`));
            }
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        }
      );
    }

    sendMessage();
  });
}

// Fill field with AI-generated text
function fillField(field, text) {
  // Handle different field types
  if (field.tagName === 'SELECT') {
    // For select fields, find the closest matching option
    const options = Array.from(field.options);
    const bestMatch = options.reduce((best, option) => {
      const currentSimilarity = getStringSimilarity(option.text.toLowerCase(), text.toLowerCase());
      const bestSimilarity = getStringSimilarity(best.text.toLowerCase(), text.toLowerCase());
      return currentSimilarity > bestSimilarity ? option : best;
    }, options[0]);

    field.value = bestMatch.value;
  } else {
    // For text inputs and textareas
    field.value = text;
  }

  // Dispatch input event to trigger any listeners
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

// Simple string similarity metric (Levenshtein distance based)
function getStringSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;

  const len1 = str1.length;
  const len2 = str2.length;

  // Quick short-circuit for empty strings
  if (len1 === 0 || len2 === 0) return 0.0;

  // If one is a substring of the other, return a partial match
  if (str1.includes(str2)) return str2.length / str1.length;
  if (str2.includes(str1)) return str1.length / str2.length;

  // Count matching characters (simplified)
  let matches = 0;
  const minLen = Math.min(len1, len2);

  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) matches++;
  }

  return matches / Math.max(len1, len2);
}

// Show notification function
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.padding = '10px 20px';
  notification.style.backgroundColor = '#4285f4';
  notification.style.color = 'white';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '9999';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}