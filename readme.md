# FormBot Chrome Extension

A Chrome extension that helps you automatically fill out web forms using AI models (OpenAI's GPT or Anthropic's Claude).

## Features

- Fill form fields with AI-generated content appropriate to the context
- Works with text inputs, textareas, and select dropdowns
- Fill a single field or an entire form at once
- Support for both OpenAI (ChatGPT) and Anthropic (Claude) APIs
- Smart field context detection (labels, surrounding text, etc.)
- User-friendly settings page for API configuration

## Installation

### Local Development

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the extension directory
5. The extension icon should appear in your browser toolbar

### From Chrome Web Store (Future)

1. Visit the Chrome Web Store (link to be added)
2. Click "Add to Chrome"
3. Confirm the installation

## Setup

1. Click the extension icon in your browser toolbar to open the popup
2. Click "Settings" link at the bottom of the popup
3. Choose your preferred AI provider (OpenAI or Anthropic)
4. Enter your API key and select the model
5. Click "Save Settings"

## Usage

1. Navigate to any webpage with a form
2. Click on a form field you want to fill
3. Click the extension icon to open the popup
4. Select "Fill Current Field" to fill only the active field, or "Fill All Fields" to fill the entire form
5. The AI will generate appropriate text based on the field context

## API Keys

- For OpenAI: Get your API key from the [OpenAI Platform](https://platform.openai.com/account/api-keys)
- For Anthropic: Get your API key from the [Anthropic Console](https://console.anthropic.com/account/keys)

## Privacy & Security

- Your API keys are stored securely in Chrome's extension storage
- Form data is processed only when you explicitly request it
- No form data is saved or stored after processing
- All API calls are made directly from your browser to the respective AI service

## Development

The extension is built with vanilla JavaScript and uses the Chrome Extension Manifest V3 format. Main components:

- `manifest.json`: Extension configuration
- `popup.html/js`: Extension popup interface
- `content.js`: Content script to interact with web pages
- `background.js`: Background service worker for API calls
- `settings.html/js`: Settings page for API configuration

## License

MIT License