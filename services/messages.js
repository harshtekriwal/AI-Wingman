// Message Service - Handles communication between extension components
export class MessageService {
  
  // Send message to background service worker
  sendToBackground(message) {
    return chrome.runtime.sendMessage(message);
  }

  // Send message to active tab's content script
  async sendToActiveTab(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      return chrome.tabs.sendMessage(tab.id, message);
    }
    return null;
  }

  // Send message to specific tab
  sendToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  }

  // Listen for messages
  onMessage(callback) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const result = callback(message, sender);
      if (result instanceof Promise) {
        result.then(sendResponse);
        return true; // Keep channel open for async response
      }
      if (result !== undefined) {
        sendResponse(result);
      }
      return false;
    });
  }

  // Create a typed message
  static createMessage(type, payload = {}) {
    return {
      type,
      payload,
      timestamp: Date.now()
    };
  }
}

// Message Types
export const MessageTypes = {
  // Settings
  TOGGLE_AUTO_SWIPE: 'TOGGLE_AUTO_SWIPE',
  TOGGLE_CHAT_ASSIST: 'TOGGLE_CHAT_ASSIST',
  TOGGLE_LEARN_TYPE: 'TOGGLE_LEARN_TYPE',
  GET_SETTINGS: 'GET_SETTINGS',
  
  // Actions
  SWIPE_RIGHT: 'SWIPE_RIGHT',
  SWIPE_LEFT: 'SWIPE_LEFT',
  SUPER_LIKE: 'SUPER_LIKE',
  SEND_MESSAGE: 'SEND_MESSAGE',
  
  // Profile
  PROFILE_DETECTED: 'PROFILE_DETECTED',
  ANALYZE_PROFILE: 'ANALYZE_PROFILE',
  PROFILE_ANALYZED: 'PROFILE_ANALYZED',
  
  // Chat
  CHAT_OPENED: 'CHAT_OPENED',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  GENERATE_RESPONSE: 'GENERATE_RESPONSE',
  GENERATE_OPENER: 'GENERATE_OPENER',
  RESPONSE_READY: 'RESPONSE_READY',
  
  // Chat Style Learning
  LEARN_CHAT_STYLE: 'LEARN_CHAT_STYLE',
  GET_CHAT_STYLE: 'GET_CHAT_STYLE',
  STYLE_ANALYZED: 'STYLE_ANALYZED',
  
  // Learning
  PREFERENCE_UPDATED: 'PREFERENCE_UPDATED',
  STYLE_LEARNED: 'STYLE_LEARNED',
  
  // Status
  STATUS_UPDATE: 'STATUS_UPDATE',
  ERROR: 'ERROR'
};


