// Storage Service - Handles all Chrome storage operations
export class StorageService {
  
  // Default settings
  static DEFAULTS = {
    settings: {
      autoSwipe: false,
      chatAssist: false,
      learnType: true,
      swipeSpeed: 'normal', // slow, normal, fast
      matchOnlyVerified: false,
      ageRange: { min: 18, max: 40 },
      maxDistance: 50,
      openaiApiKey: ''
    },
    stats: {
      matches: 0,
      swipes: 0,
      chats: 0,
      rightSwipes: 0,
      leftSwipes: 0,
      superLikes: 0,
      sessionsCount: 0,
      lastActive: null
    },
    preferences: {
      traits: [],
      interests: [],
      physicalPreferences: [],
      conversationTopics: [],
      dealBreakers: [],
      mustHaves: [],
      likedProfiles: [],
      dislikedProfiles: []
    },
    chatStyle: {
      samples: [],
      tone: 'casual', // casual, flirty, funny, sincere
      openingLines: [],
      responsePatterns: [],
      emojiUsage: 'moderate' // none, minimal, moderate, heavy
    }
  };

  // Get settings
  async getSettings() {
    const result = await chrome.storage.local.get('settings');
    return { ...StorageService.DEFAULTS.settings, ...result.settings };
  }

  // Update settings
  async updateSettings(updates) {
    const current = await this.getSettings();
    const newSettings = { ...current, ...updates };
    await chrome.storage.local.set({ settings: newSettings });
    return newSettings;
  }

  // Get stats
  async getStats() {
    const result = await chrome.storage.local.get('stats');
    return { ...StorageService.DEFAULTS.stats, ...result.stats };
  }

  // Update stats
  async updateStats(updates) {
    const current = await this.getStats();
    const newStats = { ...current, ...updates };
    await chrome.storage.local.set({ stats: newStats });
    return newStats;
  }

  // Increment a stat
  async incrementStat(statName, amount = 1) {
    const stats = await this.getStats();
    if (typeof stats[statName] === 'number') {
      stats[statName] += amount;
      await chrome.storage.local.set({ stats });
    }
    return stats;
  }

  // Get learned preferences
  async getLearnedPreferences() {
    const result = await chrome.storage.local.get('preferences');
    return { ...StorageService.DEFAULTS.preferences, ...result.preferences };
  }

  // Update preferences
  async updatePreferences(updates) {
    const current = await this.getLearnedPreferences();
    const newPreferences = { ...current, ...updates };
    await chrome.storage.local.set({ preferences: newPreferences });
    return newPreferences;
  }

  // Add a liked profile for learning
  async addLikedProfile(profile) {
    const prefs = await this.getLearnedPreferences();
    prefs.likedProfiles.push({
      ...profile,
      timestamp: Date.now()
    });
    // Keep last 100 profiles
    if (prefs.likedProfiles.length > 100) {
      prefs.likedProfiles = prefs.likedProfiles.slice(-100);
    }
    await chrome.storage.local.set({ preferences: prefs });
    return prefs;
  }

  // Add a disliked profile for learning
  async addDislikedProfile(profile) {
    const prefs = await this.getLearnedPreferences();
    prefs.dislikedProfiles.push({
      ...profile,
      timestamp: Date.now()
    });
    // Keep last 100 profiles
    if (prefs.dislikedProfiles.length > 100) {
      prefs.dislikedProfiles = prefs.dislikedProfiles.slice(-100);
    }
    await chrome.storage.local.set({ preferences: prefs });
    return prefs;
  }

  // Get chat style settings
  async getChatStyle() {
    const result = await chrome.storage.local.get('chatStyle');
    return { ...StorageService.DEFAULTS.chatStyle, ...result.chatStyle };
  }

  // Update chat style
  async updateChatStyle(updates) {
    const current = await this.getChatStyle();
    const newStyle = { ...current, ...updates };
    await chrome.storage.local.set({ chatStyle: newStyle });
    return newStyle;
  }

  // Add chat sample for training
  async addChatSample(message) {
    const style = await this.getChatStyle();
    style.samples.push({
      text: message,
      timestamp: Date.now()
    });
    // Keep last 200 samples
    if (style.samples.length > 200) {
      style.samples = style.samples.slice(-200);
    }
    await chrome.storage.local.set({ chatStyle: style });
    return style;
  }

  // Get OpenAI API key
  async getApiKey() {
    const settings = await this.getSettings();
    return settings.openaiApiKey || '';
  }

  // Set OpenAI API key
  async setApiKey(apiKey) {
    await this.updateSettings({ openaiApiKey: apiKey });
  }

  // Clear all data
  async clearAll() {
    await chrome.storage.local.clear();
  }

  // Export data for backup
  async exportData() {
    const data = await chrome.storage.local.get(null);
    return JSON.stringify(data, null, 2);
  }

  // Import data from backup
  async importData(jsonString) {
    const data = JSON.parse(jsonString);
    await chrome.storage.local.set(data);
    return data;
  }
}


