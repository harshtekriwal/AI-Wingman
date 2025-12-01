// AI Wingman Popup Controller
import { StorageService } from '../services/storage.js';
import { MessageService } from '../services/messages.js';

class WingmanPopup {
  constructor() {
    this.storage = new StorageService();
    this.messages = new MessageService();
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    await this.loadPreferences();
    this.bindEvents();
    this.updateStatus();
  }

  async loadSettings() {
    const settings = await this.storage.getSettings();
    
    document.getElementById('autoSwipeToggle').checked = settings.autoSwipe ?? false;
    document.getElementById('chatAssistToggle').checked = settings.chatAssist ?? false;
    document.getElementById('learnTypeToggle').checked = settings.learnType ?? true;
  }

  async loadStats() {
    const stats = await this.storage.getStats();
    
    document.getElementById('matchesCount').textContent = stats.matches ?? 0;
    document.getElementById('swipesCount').textContent = stats.swipes ?? 0;
    document.getElementById('chatsCount').textContent = stats.chats ?? 0;
  }

  async loadPreferences() {
    const preferences = await this.storage.getLearnedPreferences();
    const container = document.getElementById('preferenceTags');
    
    if (preferences && preferences.traits && preferences.traits.length > 0) {
      container.innerHTML = preferences.traits
        .slice(0, 5)
        .map((trait, i) => `<span class="tag ${i % 2 === 0 ? '' : 'accent'}">${trait}</span>`)
        .join('');
    } else {
      container.innerHTML = '<span class="tag">Start swiping to learn your type...</span>';
    }
  }

  updateStatus() {
    const autoSwipe = document.getElementById('autoSwipeToggle').checked;
    const chatAssist = document.getElementById('chatAssistToggle').checked;
    const badge = document.getElementById('statusBadge');
    const statusText = badge.querySelector('.status-text');
    
    if (autoSwipe || chatAssist) {
      badge.classList.add('active');
      statusText.textContent = 'Active';
    } else {
      badge.classList.remove('active');
      statusText.textContent = 'Inactive';
    }
  }

  bindEvents() {
    // Toggle handlers
    document.getElementById('autoSwipeToggle').addEventListener('change', async (e) => {
      await this.storage.updateSettings({ autoSwipe: e.target.checked });
      this.updateStatus();
      this.messages.sendToBackground({ type: 'TOGGLE_AUTO_SWIPE', enabled: e.target.checked });
    });

    document.getElementById('chatAssistToggle').addEventListener('change', async (e) => {
      await this.storage.updateSettings({ chatAssist: e.target.checked });
      this.updateStatus();
      this.messages.sendToBackground({ type: 'TOGGLE_CHAT_ASSIST', enabled: e.target.checked });
    });

    document.getElementById('learnTypeToggle').addEventListener('change', async (e) => {
      await this.storage.updateSettings({ learnType: e.target.checked });
      this.messages.sendToBackground({ type: 'TOGGLE_LEARN_TYPE', enabled: e.target.checked });
    });

    // Button handlers
    document.getElementById('openBumbleBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://bumble.com/app' });
    });

    document.getElementById('openTinderBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://tinder.com/app/recs' });
    });

    document.getElementById('openSettingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('viewPreferencesBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('trainStyleBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#chat-training') });
    });
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  new WingmanPopup();
});


