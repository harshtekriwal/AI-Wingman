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

        case 'LEARN_CHAT_STYLE':
          await this.learnChatStyle(payload);
          sendResponse({ success: true });
          break;

        case 'GET_CHAT_STYLE':
          const chatStyle = await this.storage.getChatStyle();
          sendResponse({ success: true, chatStyle });
          break;

        case 'GET_SETTINGS':
          const settings = await this.storage.getSettings();
          sendResponse({ success: true, settings });
          break;

        case 'PASTE_TEXT':
          await this.handlePasteText(message.text, sender.tab?.id);
          sendResponse({ success: true });
          break;

        case 'INJECT_API_INTERCEPTOR':
          console.log('📡 Received INJECT_API_INTERCEPTOR request for tab:', sender.tab?.id);
          await this.injectApiInterceptor(sender.tab?.id);
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
    
    // Trigger analysis of current profile
    if (this.activeTabId) {
      console.log('🔄 Requesting current profile analysis...');
      chrome.tabs.sendMessage(this.activeTabId, { type: 'TRIGGER_PROFILE_CHECK' }).catch(() => {});
    }
  }

  stopAutoSwipe() {
    console.log('⏹️ Auto-swipe stopped');
    this.isAutoSwiping = false;
    this.notifyContentScript({ type: 'AUTO_SWIPE_STOPPED' });
  }

  async handleProfileDetected(profile, tabId) {
    const settings = await this.storage.getSettings();
    console.log('📋 handleProfileDetected:', profile.name, 'autoSwipe:', settings.autoSwipe, 'isAutoSwiping:', this.isAutoSwiping);
    
    // If learning is enabled, we analyze the profile
    if (settings.learnType || settings.autoSwipe) {
      const analysis = await this.analyzeProfile(profile);
      
      if (settings.autoSwipe && this.isAutoSwiping) {
        console.log('🤖 Auto-swipe enabled, making decision...');
        
        try {
          // Make swipe decision
          const preferences = await this.storage.getLearnedPreferences();
          console.log('📊 Preferences:', preferences);
          
          const decision = await this.ai.shouldSwipeRight(
            { ...profile, analysis },
            preferences
          );
          console.log('🎯 AI Decision:', decision);
          
          // Send swipe command to content script
          if (tabId && decision?.direction) {
            console.log('📤 Sending EXECUTE_SWIPE:', decision.direction);
            chrome.tabs.sendMessage(tabId, {
              type: 'EXECUTE_SWIPE',
              direction: decision.direction,
              confidence: decision.confidence
            });
          } else if (tabId && decision?.decision) {
            // Handle if AI returns 'decision' instead of 'direction'
            console.log('📤 Sending EXECUTE_SWIPE:', decision.decision);
            chrome.tabs.sendMessage(tabId, {
              type: 'EXECUTE_SWIPE',
              direction: decision.decision,
              confidence: decision.confidence
            });
          }
        } catch (error) {
          console.error('❌ Auto-swipe error:', error);
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

  async injectApiInterceptor(tabId) {
    if (!tabId) {
      console.error('❌ No tab ID for API interceptor');
      return;
    }

    console.log('🔌 Injecting API interceptor into tab:', tabId);

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: () => {
          try {
            console.log('🚀 Wingman interceptor script starting...');
            
            // Don't inject twice
            if (window.__wingmanInterceptorInstalled) {
              console.log('🔌 Interceptor already installed');
              return true;
            }
            window.__wingmanInterceptorInstalled = true;

            // Helper to extract profile from response
            function extractProfile(data) {
              if (!data?.body?.[0]?.user) return null;
              
              const user = data.body[0].user;
              const profile = {
                name: user.name,
                age: user.age,
                bio: '',
                occupation: '',
                education: '',
                location: '',
                topArtists: [],
                prompts: [],
                lifestyle: {}
              };
              
              if (user.profile_fields) {
                for (const field of user.profile_fields) {
                  if (field.id === 'aboutme_text') profile.bio = field.display_value;
                  else if (field.id === 'work') profile.occupation = field.display_value;
                  else if (field.id === 'education') profile.education = field.display_value;
                  else if (field.id === 'location') profile.location = field.display_value;
                  else if (field.type === 25) profile.lifestyle[field.name] = field.display_value;
                  else if (field.type === 26) profile.prompts.push({ question: field.name, answer: field.display_value });
                }
              }
              
              if (user.music_services?.[0]?.top_artists) {
                profile.topArtists = user.music_services[0].top_artists.map(a => a.name).slice(0, 5);
              }
              
              return profile;
            }

            // Override XMLHttpRequest (Bumble uses this!)
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;
            
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              this._wingmanUrl = url;
              return originalXHROpen.apply(this, [method, url, ...rest]);
            };
            
            XMLHttpRequest.prototype.send = function(...args) {
              if (this._wingmanUrl && this._wingmanUrl.includes('SERVER_GET_USER')) {
                this.addEventListener('load', function() {
                  try {
                    console.log('🎯 XHR Intercepted SERVER_GET_USER!');
                    const data = JSON.parse(this.responseText);
                    const profile = extractProfile(data);
                    if (profile) {
                      console.log('📡 Posting profile:', profile.name, profile.bio?.substring(0, 50));
                      window.postMessage({ type: 'WINGMAN_PROFILE_DATA', profile: profile }, '*');
                    }
                  } catch (e) {
                    console.error('❌ XHR parse error:', e);
                  }
                });
              }
              return originalXHRSend.apply(this, args);
            };

            // Also override fetch just in case
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
              const response = await originalFetch.apply(this, args);
              
              try {
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
                
                if (url && url.includes('SERVER_GET_USER')) {
                  console.log('🎯 Fetch Intercepted SERVER_GET_USER!');
                  const clone = response.clone();
                  const data = await clone.json();
                  const profile = extractProfile(data);
                  if (profile) {
                    console.log('📡 Posting profile:', profile.name, profile.bio?.substring(0, 50));
                    window.postMessage({ type: 'WINGMAN_PROFILE_DATA', profile: profile }, '*');
                  }
                }
              } catch (e) {
                console.error('❌ Fetch error:', e);
              }
              
              return response;
            };
          
          // Visual confirmation
          console.log('%c🔌 WINGMAN API INTERCEPTOR INSTALLED', 'background: green; color: white; font-size: 16px; padding: 5px;');
          return true;
          } catch (err) {
            console.error('❌ Interceptor installation error:', err);
            return false;
          }
        }
      });
      console.log('✅ API interceptor injection result:', result);
    } catch (error) {
      console.error('❌ Error injecting API interceptor:', error);
    }
  }

  async handlePasteText(text, tabId) {
    if (!tabId) {
      console.error('No tab ID for paste');
      return;
    }

    console.log('📝 Pasting text via execCommand:', text.substring(0, 50) + '...');

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: (textToPaste) => {
          // Find the textarea
          const input = document.querySelector('textarea.textarea__input') ||
                       document.querySelector('.message-field textarea') ||
                       document.querySelector('textarea[placeholder*="chatting"]');
          
          if (!input) {
            console.log('❌ Textarea not found');
            return false;
          }

          // Focus and select the input
          input.focus();
          input.select();

          // Use execCommand which works with React inputs
          const success = document.execCommand('insertText', false, textToPaste);
          
          if (success) {
            console.log('✅ Text pasted via execCommand');
          } else {
            console.log('❌ execCommand failed');
          }

          return success;
        },
        args: [text]
      });
    } catch (error) {
      console.error('Error pasting text:', error);
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
    
    // Check for API key
    const apiKey = await this.storage.getApiKey();
    if (!apiKey) {
      throw new Error('Please add your OpenAI API key in settings');
    }
    
    if (payload.isOpener) {
      console.log('🎯 Generating opener for:', payload.match?.name);
      return await this.ai.generateOpener(payload.match || payload.profile, chatStyle);
    }
    
    const isFollowUp = payload.isFollowUp || payload.lastMessageFrom === 'me';
    console.log('💭 Generating', isFollowUp ? 'FOLLOW-UP' : 'REPLY', '- conversation length:', payload.conversation?.length);
    
    // Format conversation for AI
    const conversationText = payload.conversation
      ?.map(m => `${m.sender === 'me' ? 'You' : payload.match?.name || 'Them'}: ${m.text}`)
      .join('\n') || '';
    
    return await this.ai.generateChatResponse(
      conversationText,
      chatStyle,
      payload.match || payload.matchProfile,
      isFollowUp // Pass the follow-up flag
    );
  }

  async learnChatStyle(payload) {
    const { message } = payload;
    
    if (!message || message.length < 2) return;
    
    console.log('📝 Learning from message:', message.substring(0, 30));
    
    // Store the message sample
    await this.storage.addChatSample(message);
    
    // Get current samples
    const style = await this.storage.getChatStyle();
    
    // If we have enough samples, analyze the style
    if (style.samples.length >= 10 && style.samples.length % 5 === 0) {
      console.log('🔄 Analyzing chat style with', style.samples.length, 'samples');
      
      try {
        const analysis = await this.ai.analyzeChatStyle(style.samples);
        
        if (analysis) {
          await this.storage.updateChatStyle({
            tone: analysis.tone || style.tone,
            emojiUsage: analysis.emojiUsage || style.emojiUsage,
            messageLength: analysis.messageLength,
            patterns: analysis.patterns || [],
            vocabulary: analysis.vocabulary || []
          });
          
          console.log('✅ Chat style updated:', analysis.tone, analysis.emojiUsage);
        }
      } catch (error) {
        console.error('Style analysis error:', error);
      }
    }
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

