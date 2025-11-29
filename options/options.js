// AI Wingman - Options Page Controller
import { StorageService } from '../services/storage.js';
import { AIService } from '../services/ai-service.js';

class WingmanOptions {
  constructor() {
    this.storage = new StorageService();
    this.ai = new AIService();
    this.init();
  }

  async init() {
    this.setupNavigation();
    await this.loadAllData();
    this.bindEvents();
    this.checkHash();
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        // Update nav active state
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Show corresponding section
        const sectionId = item.dataset.section;
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId)?.classList.add('active');
        
        // Update URL hash
        window.location.hash = sectionId;
      });
    });
  }

  checkHash() {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const navItem = document.querySelector(`[data-section="${hash}"]`);
      navItem?.click();
    }
  }

  async loadAllData() {
    await Promise.all([
      this.loadApiSettings(),
      this.loadPreferences(),
      this.loadChatStyle(),
      this.loadAutoSwipeSettings(),
      this.loadStats()
    ]);
  }

  async loadApiSettings() {
    const settings = await this.storage.getSettings();
    const apiKeyInput = document.getElementById('apiKey');
    if (settings.openaiApiKey) {
      apiKeyInput.value = settings.openaiApiKey;
    }
  }

  async loadPreferences() {
    const prefs = await this.storage.getLearnedPreferences();
    const settings = await this.storage.getSettings();
    
    // Learned traits
    this.displayTags('learnedTraits', prefs.traits, 'No traits learned yet');
    this.displayTags('dealBreakers', prefs.dealBreakers, 'None detected', 'red');
    this.displayTags('mustHaves', prefs.mustHaves, 'None detected', 'green');
    
    // Manual preferences
    if (settings.ageRange) {
      document.getElementById('ageMin').value = settings.ageRange.min;
      document.getElementById('ageMax').value = settings.ageRange.max;
    }
    
    // Counts
    document.getElementById('likedCount').textContent = prefs.likedProfiles?.length || 0;
    document.getElementById('passedCount').textContent = prefs.dislikedProfiles?.length || 0;
  }

  displayTags(containerId, tags, placeholder, colorClass = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (tags && tags.length > 0) {
      container.innerHTML = tags.map(tag => `<span class="tag">${tag}</span>`).join('');
    } else {
      container.innerHTML = `<span class="tag placeholder">${placeholder}</span>`;
    }
    
    if (colorClass) {
      container.classList.add(colorClass);
    }
  }

  async loadChatStyle() {
    const style = await this.storage.getChatStyle();
    
    // Style summary
    document.getElementById('styleTone').textContent = style.tone || 'Not analyzed';
    document.getElementById('styleEmoji').textContent = style.emojiUsage || 'Not analyzed';
    document.getElementById('styleLength').textContent = style.messageLength || 'Not analyzed';
    
    // Sample count
    document.getElementById('sampleCount').textContent = style.samples?.length || 0;
    
    // Selects
    document.getElementById('toneSelect').value = style.tone || 'casual';
    document.getElementById('emojiSelect').value = style.emojiUsage || 'moderate';
  }

  async loadAutoSwipeSettings() {
    const settings = await this.storage.getSettings();
    
    document.getElementById('autoSwipeEnabled').checked = settings.autoSwipe;
    document.getElementById('swipeSpeed').value = settings.swipeSpeed || 'normal';
    document.getElementById('verifiedOnly').checked = settings.matchOnlyVerified;
    document.getElementById('dailyLimit').value = settings.dailyLimit || 100;
    
    if (settings.confidenceThreshold) {
      document.getElementById('confidenceThreshold').value = settings.confidenceThreshold;
    }
  }

  async loadStats() {
    const stats = await this.storage.getStats();
    
    document.getElementById('totalSwipes').textContent = stats.swipes || 0;
    document.getElementById('rightSwipes').textContent = stats.rightSwipes || 0;
    document.getElementById('leftSwipes').textContent = stats.leftSwipes || 0;
    document.getElementById('superLikes').textContent = stats.superLikes || 0;
    document.getElementById('chatsStarted').textContent = stats.chats || 0;
    
    // Calculate right swipe rate
    const total = stats.rightSwipes + stats.leftSwipes;
    const rate = total > 0 ? Math.round((stats.rightSwipes / total) * 100) : 0;
    document.getElementById('matchRate').textContent = `${rate}%`;
  }

  bindEvents() {
    // API Key
    document.getElementById('toggleApiKey').addEventListener('click', () => {
      const input = document.getElementById('apiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('saveApiKey').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKey').value;
      await this.storage.setApiKey(apiKey);
      this.showStatus('apiStatus', 'API key saved!', 'success');
    });

    document.getElementById('testApiKey').addEventListener('click', async () => {
      const statusEl = document.getElementById('apiStatus');
      try {
        statusEl.textContent = 'Testing connection...';
        statusEl.className = 'status-box success';
        
        // Try a simple API call
        const apiKey = await this.storage.getApiKey();
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (response.ok) {
          this.showStatus('apiStatus', '✓ Connection successful!', 'success');
        } else {
          throw new Error('Invalid API key');
        }
      } catch (error) {
        this.showStatus('apiStatus', `✗ ${error.message}`, 'error');
      }
    });

    // Preferences
    document.getElementById('savePreferences').addEventListener('click', async () => {
      const ageMin = parseInt(document.getElementById('ageMin').value);
      const ageMax = parseInt(document.getElementById('ageMax').value);
      const keywords = document.getElementById('keywords').value;
      const avoidKeywords = document.getElementById('avoidKeywords').value;
      
      await this.storage.updateSettings({
        ageRange: { min: ageMin, max: ageMax }
      });
      
      await this.storage.updatePreferences({
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        avoidKeywords: avoidKeywords.split(',').map(k => k.trim()).filter(Boolean)
      });
      
      alert('Preferences saved!');
    });

    document.getElementById('reanalyzePreferences').addEventListener('click', async () => {
      const prefs = await this.storage.getLearnedPreferences();
      if (prefs.likedProfiles.length < 5) {
        alert('Need at least 5 liked profiles to analyze preferences');
        return;
      }
      
      try {
        const analysis = await this.ai.analyzePreferences(
          prefs.likedProfiles,
          prefs.dislikedProfiles
        );
        
        if (analysis) {
          await this.storage.updatePreferences({
            traits: analysis.traits || [],
            interests: analysis.interests || [],
            dealBreakers: analysis.dealBreakers || [],
            mustHaves: analysis.mustHaves || []
          });
          
          await this.loadPreferences();
          alert('Preferences re-analyzed!');
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });

    document.getElementById('clearHistory').addEventListener('click', async () => {
      if (confirm('Clear all swipe history? This will reset preference learning.')) {
        await this.storage.updatePreferences({
          likedProfiles: [],
          dislikedProfiles: [],
          traits: [],
          dealBreakers: [],
          mustHaves: []
        });
        await this.loadPreferences();
      }
    });

    // Chat Style
    document.getElementById('addSamples').addEventListener('click', async () => {
      const samples = document.getElementById('chatSamples').value;
      const lines = samples.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        await this.storage.addChatSample(line.trim());
      }
      
      document.getElementById('chatSamples').value = '';
      await this.loadChatStyle();
      alert(`Added ${lines.length} samples!`);
    });

    document.getElementById('analyzeSamples').addEventListener('click', async () => {
      const style = await this.storage.getChatStyle();
      if (style.samples.length < 10) {
        alert('Need at least 10 message samples to analyze style');
        return;
      }
      
      try {
        const analysis = await this.ai.analyzeChatStyle(style.samples);
        if (analysis) {
          await this.storage.updateChatStyle(analysis);
          await this.loadChatStyle();
          alert('Style analyzed!');
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });

    document.getElementById('saveStyle').addEventListener('click', async () => {
      await this.storage.updateChatStyle({
        tone: document.getElementById('toneSelect').value,
        emojiUsage: document.getElementById('emojiSelect').value
      });
      await this.loadChatStyle();
      alert('Style saved!');
    });

    document.getElementById('clearSamples').addEventListener('click', async () => {
      if (confirm('Clear all chat samples?')) {
        await this.storage.updateChatStyle({ samples: [] });
        await this.loadChatStyle();
      }
    });

    // Auto-Swipe
    document.getElementById('saveAutoSwipe').addEventListener('click', async () => {
      await this.storage.updateSettings({
        autoSwipe: document.getElementById('autoSwipeEnabled').checked,
        swipeSpeed: document.getElementById('swipeSpeed').value,
        matchOnlyVerified: document.getElementById('verifiedOnly').checked,
        dailyLimit: parseInt(document.getElementById('dailyLimit').value),
        confidenceThreshold: parseInt(document.getElementById('confidenceThreshold').value)
      });
      alert('Auto-swipe settings saved!');
    });

    // Stats
    document.getElementById('resetStats').addEventListener('click', async () => {
      if (confirm('Reset all statistics?')) {
        await this.storage.updateStats({
          matches: 0,
          swipes: 0,
          chats: 0,
          rightSwipes: 0,
          leftSwipes: 0,
          superLikes: 0
        });
        await this.loadStats();
      }
    });

    // Backup
    document.getElementById('exportData').addEventListener('click', async () => {
      const data = await this.storage.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `wingman-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    });

    document.getElementById('importData').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const text = await file.text();
        try {
          await this.storage.importData(text);
          await this.loadAllData();
          alert('Data imported successfully!');
        } catch (error) {
          alert('Error importing data: ' + error.message);
        }
      }
    });

    document.getElementById('clearAllData').addEventListener('click', async () => {
      if (confirm('Are you sure? This will delete ALL your data permanently.')) {
        if (confirm('This cannot be undone. Really delete everything?')) {
          await this.storage.clearAll();
          await this.loadAllData();
          alert('All data cleared.');
        }
      }
    });
  }

  showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = `status-box ${type}`;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new WingmanOptions();
});

