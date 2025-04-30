// Load session management
let currentFormSession = null;

// Global variables
let activeField = null;
let selectedQuestion = '';

// Set up message listener
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Content received message:', {
    action: request.action,
    sender: sender,
    timestamp: new Date().toISOString()
  });

  // Create a wrapper for sendResponse that logs the response
  const wrappedSendResponse = (response) => {
    console.log('Content sending response:', {
      action: request.action,
      response: response,
      timestamp: new Date().toISOString()
    });
    sendResponse(response);
  };

  if (request.action === "fillCurrentField") {
    handleFillCurrentField(wrappedSendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === "fillAllFields") {
    handleFillAllFields(wrappedSendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === "textSelected") {
    selectedQuestion = request.text;
    // Show a notification that text is selected
    showNotification(`Question selected: "${selectedQuestion}"`);
    wrappedSendResponse({success: true});
    return false;
  } else if (request.action === "getSelectedText") {
    wrappedSendResponse({text: selectedQuestion});
    return false;
  } else if (request.action === "expandDraft") {
    handleDraftExpansion(request.draft);
    wrappedSendResponse({success: true});
    return false;
  } else if (request.action === "getCurrentSession") {
    wrappedSendResponse({
      hasActiveSession: currentFormSession !== null,
      sessionId: currentFormSession ? currentFormSession.id : null
    });
    return false;
  } else if (request.action === "startNewSession") {
    startNewFormSession();
    wrappedSendResponse({success: true, message: "New form session started"});
    return false;
  } else if (request.action === "endCurrentSession") {
    if (currentFormSession) {
      currentFormSession.endSession();
      currentFormSession = null;
      wrappedSendResponse({success: true, message: "Form session ended"});
    } else {
      wrappedSendResponse({success: false, message: "No active form session"});
    }
    return false;
  }
});

// Monitor for field focus to track active field
document.addEventListener('focusin', function(e) {
  if (isFormField(e.target)) {
    activeField = e.target;

    // If no active session, try to create one based on the form
    if (!currentFormSession && activeField) {
      const parentForm = findParentForm(activeField);
      if (parentForm) {
        startNewFormSession(parentForm);
      }
    }
  }
});

// Also track right-click on form fields
document.addEventListener('contextmenu', function(e) {
  if (isFormField(e.target)) {
    activeField = e.target;
  }
});
// Start a new form session
function startNewFormSession(formElement) {
  // If formElement not provided, find one from activeField or page
  if (!formElement) {
    if (activeField) {
      formElement = findParentForm(activeField);
    }

    // If still no form, use the first form on the page
    if (!formElement) {
      formElement = document.querySelector('form');
    }
  }

  // Create new session if we have a form
  if (formElement) {
    currentFormSession = new FormSession(formElement, window.location.href);

    // Add initial form context
    const formFields = Array.from(formElement.querySelectorAll('input, textarea, select')).filter(isFormField);

    currentFormSession.addFormContext('fieldCount', formFields.length);
    currentFormSession.addFormContext('formAction', formElement.action || window.location.href);
    currentFormSession.addFormContext('formMethod', formElement.method || 'get');
    currentFormSession.addFormContext('pageTitle', document.title);

    // Try to determine form purpose from fields or action
    const formPurpose = determineFormPurpose(formElement);
    if (formPurpose) {
      currentFormSession.addFormContext('formPurpose', formPurpose);
    }

    console.log('New form session started:', currentFormSession.id);
    return currentFormSession;
  }

  return null;
}

// Try to determine the purpose of a form
function determineFormPurpose(formElement) {
  // Check form ID, class, and action for clues
  const formId = formElement.id ? formElement.id.toLowerCase() : '';
  const formClass = formElement.className ? formElement.className.toLowerCase() : '';
  const formAction = formElement.action ? formElement.action.toLowerCase() : '';

  // Check for common form types
  if (formId.includes('login') || formClass.includes('login') || formAction.includes('login')) {
    return 'login';
  }

  if (formId.includes('register') || formClass.includes('register') || formAction.includes('register')) {
    return 'registration';
  }

  if (formId.includes('contact') || formClass.includes('contact') || formAction.includes('contact')) {
    return 'contact';
  }

  if (formId.includes('checkout') || formClass.includes('checkout') || formAction.includes('checkout')) {
    return 'checkout';
  }

  if (formId.includes('search') || formClass.includes('search') || formAction.includes('search')) {
    return 'search';
  }

  // Check form fields for clues
  const fields = Array.from(formElement.elements);
  const fieldNames = fields.map(field => field.name ? field.name.toLowerCase() : '');

  if (fieldNames.some(name => name.includes('password'))) {
    if (fieldNames.some(name => name.includes('confirm') || name.includes('verify'))) {
      return 'registration';
    }
    return 'login';
  }

  if (fieldNames.some(name => name.includes('email') || name.includes('mail'))) {
    if (fieldNames.some(name => name.includes('message') || name.includes('comment'))) {
      return 'contact';
    }
  }

  // Default to generic form
  return 'general';
}

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
      console.error('No active field found');
      sendResponse({success: false, message: "No field selected. Click on a form field first."});
      return;
    }

    console.log('Active field found:', {
      field: activeField,
      fieldType: activeField.tagName,
      fieldId: activeField.id,
      fieldName: activeField.name,
      currentValue: activeField.value
    });

    // Show loading spinner
    showLoadingSpinner(activeField);

    // Get field context
    const fieldInfo = getFieldInfo(activeField);
    console.log('Field info gathered:', fieldInfo);

    // Send to background script for API processing
    const aiResponse = await requestAiCompletion(fieldInfo);

    // Fill the field with AI response
    if (aiResponse) {
      console.log('Filling field with AI response:', {
        field: activeField,
        response: aiResponse
      });
      fillField(activeField, aiResponse);

      // Record the processed field in the session
      if (currentFormSession) {
        currentFormSession.recordFieldProcessed(fieldInfo, aiResponse);
      }

      sendResponse({success: true, message: "Field filled successfully!"});
    } else {
      throw new Error("Failed to generate answer");
    }
  } catch (error) {
    console.error("Error filling field:", error);
    sendResponse({success: false, message: `Error: ${error.message}`});
    fillField(activeField, "Failed to generate answer");
  } finally {
    // Always hide loading spinner
    hideLoadingSpinner(activeField);
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

      // Show loading spinner for current field
      showLoadingSpinner(field);

      try {
        const fieldInfo = getFieldInfo(field);
        const aiResponse = await requestAiCompletion(fieldInfo);

        if (aiResponse && aiResponse.text) {
          fillField(field, aiResponse.text);
          filledCount++;
        } else {
          fillField(field, "Failed to generate answer");
        }
      } catch (error) {
        console.error(`Error filling field ${field.name || field.id}:`, error);
        fillField(field, "Failed to generate answer");
      } finally {
        // Hide loading spinner for current field
        hideLoadingSpinner(field);
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
      console.log('Content sending message:', {
        action: 'getAiCompletion',
        fieldInfo: fieldInfo,
        timestamp: new Date().toISOString()
      });

      chrome.runtime.sendMessage(
        {action: "getAiCompletion", fieldInfo},
        function(response) {
          console.log('Content received response:', {
            action: 'getAiCompletion',
            response: response,
            lastError: chrome.runtime.lastError,
            timestamp: new Date().toISOString()
          });

          if (chrome.runtime.lastError) {
            console.error('Message channel error:', chrome.runtime.lastError);
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`Retrying message send (attempt ${retryCount}/${maxRetries})...`);
              setTimeout(sendMessage, 1000); // Wait 1 second before retrying
            } else {
              reject(new Error(`Failed to connect to background script after ${maxRetries} attempts: ${chrome.runtime.lastError.message}`));
            }
          } else if (response && response.success) {
            console.log('AI completion successful:', {
              text: response.text,
              textLength: response.text.length
            });
            // Extract the text from the response
            resolve(response.text);
          } else {
            reject(new Error(response?.error || "Failed to get AI response"));
          }
        }
      );
    }

    sendMessage();
  });
}

// Fill field with AI-generated text
function fillField(field, text) {
  console.log('Attempting to fill field:', {
    field: field,
    fieldType: field.tagName,
    fieldId: field.id,
    fieldName: field.name,
    currentValue: field.textContent || field.value,
    newValue: text
  });

  // Handle different field types
  if (field.tagName === 'SELECT') {
    // For select fields, find the closest matching option
    const options = Array.from(field.options);
    const bestMatch = options.reduce((best, option) => {
      const currentSimilarity = getStringSimilarity(option.text.toLowerCase(), text.toLowerCase());
      const bestSimilarity = getStringSimilarity(best.text.toLowerCase(), text.toLowerCase());
      return currentSimilarity > bestSimilarity ? option : best;
    }, options[0]);

    console.log('Select field best match:', {
      selectedOption: bestMatch,
      selectedValue: bestMatch.value
    });

    field.value = bestMatch.value;
  } else if (field.tagName === 'TEXTAREA') {
    // For textarea elements, focus the field first
    field.focus();

    // Clear existing content
    field.value = '';
    field.textContent = '';

    // Set the new content
    field.value = text;
    field.textContent = text;

    // Set data-initial-value if it exists
    if (field.hasAttribute('data-initial-value')) {
      field.setAttribute('data-initial-value', text);
    }

    // Trigger Google's custom events
    if (field.jsaction) {
      const actions = field.jsaction.split(';');
      actions.forEach(action => {
        const [eventName] = action.split(':');
        if (eventName) {
          const customEvent = new Event(eventName.trim(), { bubbles: true });
          field.dispatchEvent(customEvent);
        }
      });
    }

    // Trigger input event
    const inputEvent = new Event('input', { bubbles: true });
    field.dispatchEvent(inputEvent);

    // Trigger change event
    const changeEvent = new Event('change', { bubbles: true });
    field.dispatchEvent(changeEvent);

    // Force a blur event to trigger any validation
    const blurEvent = new Event('blur', { bubbles: true });
    field.dispatchEvent(blurEvent);

    // Try to trigger Google's custom input handler
    if (field.jscontroller) {
      const controllerEvent = new Event('input', { bubbles: true });
      field.dispatchEvent(controllerEvent);
    }
  } else {
    // For regular input fields
    console.log('Filling input field:', {
      field: field,
      value: text
    });
    field.value = text;
  }

  // Verify the value was set
  console.log('Field value after filling:', {
    field: field,
    value: field.textContent || field.value,
    valueLength: (field.textContent || field.value).length,
    dataInitialValue: field.getAttribute('data-initial-value')
  });
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

// Initialize: Check for active form on the page
document.addEventListener('DOMContentLoaded', function() {
  // Wait for DOM to be ready
  setTimeout(() => {
    // Find a form
    const form = document.querySelector('form');
    if (form) {
      // Don't auto-start a session, but prepare for one
      console.log('Form found on page, session will start when user interacts with a field');
    }
  }, 1000);
});

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

// Show loading spinner in field
function showLoadingSpinner(field) {
  console.log('Showing loading spinner for field:', {
    field: field,
    fieldType: field.tagName,
    fieldId: field.id,
    parentNode: field.parentNode ? 'exists' : 'null'
  });

  // First, try to remove any existing spinner
  hideLoadingSpinner(field);

  // Create a loading indicator element with a unique ID
  const spinnerId = 'formbot-spinner-' + Date.now();
  const spinner = document.createElement('div');
  spinner.id = spinnerId;
  spinner.style.position = 'absolute';
  spinner.style.right = '8px';
  spinner.style.top = '50%';
  spinner.style.transform = 'translateY(-50%)';
  spinner.style.width = '20px';
  spinner.style.height = '20px';
  spinner.style.backgroundImage = 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 24 24\'><path fill=\'%234285f4\' d=\'M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z\'><animateTransform attributeName=\'transform\' type=\'rotate\' from=\'0 12 12\' to=\'360 12 12\' dur=\'1s\' repeatCount=\'indefinite\'/></path></svg>")';
  spinner.style.backgroundRepeat = 'no-repeat';
  spinner.style.pointerEvents = 'none';
  spinner.style.zIndex = '1000';

  // Add padding to the field to make room for the spinner
  field.style.paddingRight = '30px';

  // Add the spinner to the field's parent
  if (field.parentNode) {
    field.parentNode.style.position = 'relative';
    field.parentNode.appendChild(spinner);
    console.log('Spinner added to DOM:', spinnerId);
  } else {
    console.error('Cannot add spinner: field has no parent node');
  }

  // Store spinner reference
  field.dataset.spinnerId = spinnerId;
}

// Hide loading spinner
function hideLoadingSpinner(field) {
  if (!field) {
    console.error('hideLoadingSpinner called with null field');
    return;
  }

  console.log('Hiding loading spinner for field:', {
    field: field,
    fieldType: field.tagName,
    fieldId: field.id,
    spinnerId: field.dataset.spinnerId
  });

  // Try to remove spinner by ID first
  const spinnerId = field.dataset.spinnerId;
  if (spinnerId) {
    const spinner = document.getElementById(spinnerId);
    if (spinner) {
      console.log('Removing spinner by ID:', spinnerId);
      spinner.remove();
    }
  }

  // Also try to remove any spinner stored in dataset
  const spinner = field.dataset.spinner;
  if (spinner && spinner.parentNode) {
    console.log('Removing spinner from dataset reference');
    spinner.parentNode.removeChild(spinner);
  }

  // Clean up references
  delete field.dataset.spinnerId;
  delete field.dataset.spinner;

  // Remove padding
  if (field.style) {
    field.style.paddingRight = '';
  }

  // Clean up parent positioning if no other spinners
  if (field.parentNode && field.parentNode.style) {
    const hasOtherSpinners = Array.from(field.parentNode.children).some(
      child => child !== field && (child.id && child.id.startsWith('formbot-spinner-'))
    );
    if (!hasOtherSpinners) {
      field.parentNode.style.position = '';
    }
  }

  // Double check if any spinners are still in the DOM
  const remainingSpinners = document.querySelectorAll('[id^="formbot-spinner-"]');
  if (remainingSpinners.length > 0) {
    console.warn('Found remaining spinners in DOM:', remainingSpinners.length);
    remainingSpinners.forEach(spinner => spinner.remove());
  }
}

// Handle draft expansion
async function handleDraftExpansion(draft) {
  try {
    // If no field is active, look for a focused field
    if (!activeField) {
      activeField = document.querySelector('input:focus, textarea:focus, select:focus');
    }

    // If still no active field, respond with error
    if (!activeField) {
      showNotification("No field selected. Click on a form field first.");
      return;
    }

    // Show loading spinner
    showLoadingSpinner(activeField);

    // Get field context
    const fieldInfo = getFieldInfo(activeField);

    // Add draft to field info
    fieldInfo.draft = draft;

    // Send to background script for API processing
    const aiResponse = await requestAiCompletion(fieldInfo);

    // Fill the field with AI response
    if (aiResponse) {
      // Clear the field first
      if (activeField.tagName === 'TEXTAREA') {
        activeField.value = 'Adding answer...';
        activeField.textContent = 'Adding answer...';
      } else {
        activeField.value = 'Adding answer...';
      }

      // Then fill with new content
      fillField(activeField, aiResponse);

      // Record the processed field in the session
      if (currentFormSession) {
        currentFormSession.recordFieldProcessed(fieldInfo, aiResponse);
      }

      showNotification("Draft expanded successfully!");
    } else {
      throw new Error("Failed to generate answer");
    }
  } catch (error) {
    console.error("Error expanding draft:", error);
    showNotification("Error expanding draft: " + error.message);
    fillField(activeField, "Failed to generate answer");
  } finally {
    // Always hide loading spinner
    hideLoadingSpinner(activeField);
  }
}