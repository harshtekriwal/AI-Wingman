// AI Wingman - Background Service Worker
import { StorageService } from '../services/storage.js';
import { AIService } from '../services/ai-service.js';
import { MessageTypes } from '../services/messages.js';

class WingmanBackground {
  constructor() {
    this.storage = new StorageService();
    this.ai = new AIService();
    this.activeTabId = null;
    this.isAutoSwiping = false;
    this.init();
  }

  init() {
    // Listen for messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep channel open for async
    });

    // Track active tab
    chrome.tabs.onActivated.addListener(({ tabId }) => {
      this.activeTabId = tabId;
    });

    // Handle extension install
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.onFirstInstall();
      }
    });

    console.log('🎯 AI Wingman Background Service Started');
  }

  async onFirstInstall() {
    // Initialize default settings
    await this.storage.updateSettings({
      autoSwipe: false,
      chatAssist: false,
      learnType: true
    });
    
    // Open options page for setup
    chrome.runtime.openOptionsPage();
  }

  async handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;
    
    try {
      switch (type) {
        case MessageTypes.TOGGLE_AUTO_SWIPE:
          await this.handleAutoSwipeToggle(message.enabled);
          sendResponse({ success: true });
          break;

        case MessageTypes.TOGGLE_CHAT_ASSIST:
          await this.storage.updateSettings({ chatAssist: message.enabled });
          this.notifyContentScript({ type: 'CHAT_ASSIST_CHANGED', enabled: message.enabled });
          sendResponse({ success: true });
          break;

        case MessageTypes.TOGGLE_LEARN_TYPE:
          await this.storage.updateSettings({ learnType: message.enabled });
          sendResponse({ success: true });
          break;

        case MessageTypes.PROFILE_DETECTED:
        case 'PROFILE_DETECTED':
          console.log('Profile detected:', payload?.name);
          await this.handleProfileDetected(payload, sender.tab?.id);
          sendResponse({ success: true });
          break;

        case MessageTypes.ANALYZE_PROFILE:
        case 'ANALYZE_PROFILE':
          console.log('Analyzing profile:', payload);
          try {
            const analysis = await this.analyzeProfile(payload);
            console.log('Analysis result:', analysis);
            sendResponse({ success: true, analysis });
          } catch (error) {
            console.error('Analysis error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;

        case 'EXECUTE_SWIPE_IN_PAGE':
          await this.executeSwipeInPage(message.direction, sender.tab?.id);
          sendResponse({ success: true });
          break;

        case MessageTypes.SWIPE_RIGHT:
          await this.handleSwipe('right', payload);
          sendResponse({ success: true });
          break;

        case MessageTypes.SWIPE_LEFT:
          await this.handleSwipe('left', payload);
          sendResponse({ success: true });
          break;

        case MessageTypes.SUPER_LIKE:
          await this.handleSwipe('super', payload);
          sendResponse({ success: true });
          break;

        case MessageTypes.GENERATE_RESPONSE:
          const response = await this.generateResponse(payload);
          sendResponse({ success: true, response });
          break;

        case MessageTypes.CHAT_OPENED:
          await this.handleChatOpened(payload, sender.tab?.id);
          sendResponse({ success: true });
          break;

        case MessageTypes.MESSAGE_RECEIVED:
          await this.handleMessageReceived(payload, sender.tab?.id);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleAutoSwipeToggle(enabled) {
    await this.storage.updateSettings({ autoSwipe: enabled });
    this.isAutoSwiping = enabled;
    
    if (enabled) {
      this.startAutoSwipe();
    } else {
      this.stopAutoSwipe();
    }
  }

  async startAutoSwipe() {
    console.log('🎯 Auto-swipe started');
    this.notifyContentScript({ type: 'AUTO_SWIPE_STARTED' });
  }

  stopAutoSwipe() {
    console.log('⏹️ Auto-swipe stopped');
    this.isAutoSwiping = false;
    this.notifyContentScript({ type: 'AUTO_SWIPE_STOPPED' });
  }

  async handleProfileDetected(profile, tabId) {
    const settings = await this.storage.getSettings();
    
    // If learning is enabled, we analyze the profile
    if (settings.learnType || settings.autoSwipe) {
      const analysis = await this.analyzeProfile(profile);
      
      if (settings.autoSwipe && this.isAutoSwiping) {
        // Make swipe decision
        const preferences = await this.storage.getLearnedPreferences();
        const decision = await this.ai.shouldSwipeRight(
          { ...profile, analysis },
          preferences
        );
        
        // Send swipe command to content script
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_SWIPE',
            direction: decision.decision,
            confidence: decision.confidence
          });
        }
      }
    }
  }

  async analyzeProfile(profile) {
    let analysis = {};
    
    console.log('Starting profile analysis for:', profile.name);
    console.log('Has image:', !!profile.imageUrl);
    console.log('Has bio:', !!profile.bio);
    console.log('Image URL:', profile.imageUrl?.substring(0, 50));
    
    // Check if API key is configured
    const apiKey = await this.storage.getApiKey();
    if (!apiKey) {
      console.log('No API key configured - skipping AI analysis');
      return { error: 'No API key configured' };
    }
    
    try {
      // Try image analysis - skip for protected CDN URLs (Bumble/Tinder protect their images)
      if (profile.imageUrl && !profile.imageUrl.includes('bumbcdn.com') && !profile.imageUrl.includes('gotinder.com')) {
        console.log('Analyzing image...');
        try {
          analysis.image = await this.ai.analyzeProfileImage(profile.imageUrl);
          console.log('Image analysis result:', analysis.image);
        } catch (imgError) {
          console.error('Image analysis failed:', imgError.message);
          analysis.imageError = imgError.message;
        }
      } else if (profile.imageUrl) {
        console.log('Skipping image analysis - protected CDN URL');
        analysis.image = { 
          vibe: 'Photo detected (protected URL)',
          note: 'Bumble images are protected - using bio analysis only'
        };
      }
      
      // Try bio analysis
      if (profile.bio && profile.bio.length > 10) {
        console.log('Analyzing bio...');
        try {
          analysis.bio = await this.ai.analyzeProfileBio(profile.bio);
          console.log('Bio analysis result:', analysis.bio);
        } catch (bioError) {
          console.error('Bio analysis failed:', bioError.message);
          analysis.bioError = bioError.message;
        }
      }
      
      // If no bio, try to generate basic info from name/age
      if (!profile.bio && profile.name) {
        analysis.bio = {
          interests: [],
          personality: ['Unknown - no bio'],
          greenFlags: profile.imageUrl ? ['Has photos'] : [],
          redFlags: ['No bio provided'],
          conversation_starters: [
            `Hey ${profile.name}! Love your photos, what do you like to do for fun?`,
            `Hi ${profile.name}! What brings you to Bumble?`
          ]
        };
      }
      
    } catch (error) {
      console.error('Profile analysis error:', error);
      analysis.error = error.message;
    }
    
    console.log('Final analysis:', analysis);
    return analysis;
  }

  async handleSwipe(direction, profile) {
    const settings = await this.storage.getSettings();
    
    // Update stats
    await this.storage.incrementStat('swipes');
    if (direction === 'right') {
      await this.storage.incrementStat('rightSwipes');
    } else if (direction === 'left') {
      await this.storage.incrementStat('leftSwipes');
    } else if (direction === 'super') {
      await this.storage.incrementStat('superLikes');
    }
    
    // If learning is enabled, store the profile
    if (settings.learnType && profile) {
      if (direction === 'right' || direction === 'super') {
        await this.storage.addLikedProfile(profile);
      } else {
        await this.storage.addDislikedProfile(profile);
      }
      
      // Periodically update preference analysis
      const prefs = await this.storage.getLearnedPreferences();
      if ((prefs.likedProfiles.length + prefs.dislikedProfiles.length) % 10 === 0) {
        this.updatePreferenceAnalysis();
      }
    }
  }

  async executeSwipeInPage(direction, tabId) {
    if (!tabId) {
      console.error('No tab ID for swipe execution');
      return;
    }

    const voteCode = direction === 'right' ? 2 : (direction === 'left' ? 3 : 7);
    const qaRole = direction === 'right' ? 'encounters-action-like' : 
                  (direction === 'left' ? 'encounters-action-dislike' : 'encounters-action-superswipe');

    console.log(`Executing swipe in page context: ${direction} (voteCode: ${voteCode})`);

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',  // Execute in page context, not isolated world
        func: (qaRole, voteCode, direction) => {
          const btn = document.querySelector(`[data-qa-role="${qaRole}"]`);
          if (!btn) {
            console.log('❌ Button not found for:', direction);
            return false;
          }
          
          const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
          if (!fiberKey) {
            console.log('❌ No React fiber found');
            return false;
          }
          
          let node = btn[fiberKey];
          while (node) {
            if (node.stateNode && typeof node.stateNode.voteUser === 'function') {
              node.stateNode.voteUser(voteCode, 1);
              console.log(`✅ ${direction.toUpperCase()} executed via voteUser(${voteCode}, 1)`);
              return true;
            }
            node = node.return;
          }
          
          console.log('❌ voteUser not found in fiber tree');
          return false;
        },
        args: [qaRole, voteCode, direction]
      });
    } catch (error) {
      console.error('Error executing swipe in page:', error);
    }
  }

  async updatePreferenceAnalysis() {
    const prefs = await this.storage.getLearnedPreferences();
    
    if (prefs.likedProfiles.length > 5) {
      try {
        const analysis = await this.ai.analyzePreferences(
          prefs.likedProfiles,
          prefs.dislikedProfiles
        );
        
        if (analysis) {
          await this.storage.updatePreferences({
            traits: analysis.traits || [],
            interests: analysis.interests || [],
            physicalPreferences: analysis.physicalPreferences || [],
            dealBreakers: analysis.dealBreakers || [],
            mustHaves: analysis.mustHaves || []
          });
        }
      } catch (error) {
        console.error('Preference analysis error:', error);
      }
    }
  }

  async handleChatOpened(payload, tabId) {
    await this.storage.incrementStat('chats');
  }

  async handleMessageReceived(payload, tabId) {
    const settings = await this.storage.getSettings();
    
    if (settings.chatAssist) {
      const chatStyle = await this.storage.getChatStyle();
      const response = await this.ai.generateChatResponse(
        payload.conversation,
        chatStyle,
        payload.matchProfile
      );
      
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: MessageTypes.RESPONSE_READY,
          response
        });
      }
    }
  }

  async generateResponse(payload) {
    const chatStyle = await this.storage.getChatStyle();
    
    if (payload.isOpener) {
      return await this.ai.generateOpener(payload.profile, chatStyle);
    }
    
    return await this.ai.generateChatResponse(
      payload.conversation,
      chatStyle,
      payload.matchProfile
    );
  }

  notifyContentScript(message) {
    if (this.activeTabId) {
      chrome.tabs.sendMessage(this.activeTabId, message).catch(() => {
        // Tab might not have content script loaded
      });
    }
  }
}

// Initialize background service
new WingmanBackground();

