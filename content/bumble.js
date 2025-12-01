// AI Wingman - Bumble Content Script
(function() {
  'use strict';

  const SELECTORS = {
    // REAL Bumble selectors from inspecting the page
    profileCard: '[data-qa-role="encounters-user"], .encounters-user, [class*="encounters-user"]',
    userControls: '.encounters-user__controls, [class*="encounters-user__controls"]',
    userFrame: '.encounters-user__frame, [class*="encounters-user__frame"]',
    album: '.encounters-album, [class*="encounters-album"]',
    
    // Action buttons - EXACT selectors from Bumble's accessibility tree
    likeButtons: [
      'button[aria-label="Like"]',
      '[data-qa-role="encounters-action-like"]',
      '.encounters-action--like'
    ],
    passButtons: [
      'button[aria-label="Pass"]',
      '[data-qa-role="encounters-action-dislike"]',
      '.encounters-action--dislike'
    ],
    superLikeButtons: [
      'button[aria-label="Super"]',
      'button[aria-label*="Super"]',
      '[data-qa-role="encounters-action-superswipe"]'
    ],
    
    // Chat elements - ACTUAL Bumble selectors from inspection
    chatContainer: '.page--chat, [class*="messenger"], [class*="chat-room"]',
    chatHeader: '.messages-header, .messages-header__inner',
    messageInput: '.message-field textarea, textarea[placeholder*="Start chatting"], textarea[placeholder*="message"]',
    messageInputWrapper: '.message-field',
    sendButton: '.message-field button[type="submit"], .message-field .send-button',
    messagesList: '.messages-list',
    messageItem: '.message, [class*="message-item"]',
    myMessage: '.message--out, .message--mine, [class*="from-me"]',
    theirMessage: '.message--in, .message--theirs, [class*="from-them"]',
    messageText: '.message__text, .message-text, [class*="message__content"]',
    matchName: '.messages-header__name .header-2, .messages-header__name',
    matchPhoto: '.messages-header__avatar img, .messages-header__avatar',
    typingIndicator: '[class*="typing"]'
  };

  class BumbleWingman {
    constructor() {
      this.isAutoSwiping = false;
      this.settings = {};
      this.overlay = null;
      this.chatOverlay = null;
      this.currentView = 'swipe'; // 'swipe' or 'chat'
      this.viewInitialized = false;
      this.currentChatMatch = null;
      this.conversationHistory = [];
      this.isGeneratingResponse = false;
      this.switchingConversation = false;
      this.lastMessageCount = 0;
      this.chatObserver = null;
      this.conversationSwitchObserver = null;
      this.conversationSwitchInterval = null;
      this.lastMatchName = '';
      this.init();
    }

    init() {
      console.log('💘 AI Wingman loaded on Bumble');
      this.createOverlay();
      this.createChatOverlay();
      this.loadSettings();
      this.setupMessageListener();
      this.observeProfileChanges();
      this.observeViewChanges();
      this.detectCurrentView();
    }

    createOverlay() {
      // Create floating UI overlay
      this.overlay = document.createElement('div');
      this.overlay.id = 'wingman-overlay';
      this.overlay.innerHTML = `
        <div class="wingman-panel">
          <div class="wingman-header">
            <span class="wingman-logo">💘 AI Wingman</span>
            <button class="wingman-toggle" id="wingman-minimize">−</button>
          </div>
          <div class="wingman-content">
            <div class="wingman-status">
              <span class="status-indicator"></span>
              <span class="status-text">Ready</span>
            </div>
            <div class="wingman-analysis" id="wingman-analysis">
              <p>Waiting for profile...</p>
            </div>
            <div class="wingman-suggestion" id="wingman-suggestion"></div>
            <div class="wingman-actions">
              <button class="wingman-btn pass" id="wingman-pass">👎 Pass</button>
              <button class="wingman-btn like" id="wingman-like">❤️ Like</button>
              <button class="wingman-btn super" id="wingman-super">⭐ Super</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this.overlay);
      this.bindOverlayEvents();
    }

    bindOverlayEvents() {
      // Minimize toggle
      document.getElementById('wingman-minimize').addEventListener('click', () => {
        this.overlay.classList.toggle('minimized');
      });

      // Manual swipe buttons
      document.getElementById('wingman-pass').addEventListener('click', () => {
        this.executeSwipe('left');
      });

      document.getElementById('wingman-like').addEventListener('click', () => {
        this.executeSwipe('right');
      });

      document.getElementById('wingman-super').addEventListener('click', () => {
        this.executeSwipe('super');
      });
    }

    async loadSettings() {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      this.settings = response?.settings || {};
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
          case 'AUTO_SWIPE_STARTED':
            this.startAutoSwipe();
            break;
          case 'AUTO_SWIPE_STOPPED':
            this.stopAutoSwipe();
            break;
          case 'EXECUTE_SWIPE':
            this.executeSwipe(message.direction, message.confidence);
            break;
          case 'TRIGGER_PROFILE_CHECK':
            // Force re-check of current profile for auto-swipe
            console.log('🔄 Triggered profile check for auto-swipe');
            this.lastProfileId = null; // Reset to force re-detection
            this.checkForNewProfile();
            break;
          case 'CHAT_ASSIST_CHANGED':
            this.settings.chatAssist = message.enabled;
            break;
          case 'RESPONSE_READY':
            this.showSuggestedResponse(message.response);
            break;
        }
        sendResponse({ received: true });
      });
    }

    observeProfileChanges() {
      this.lastProfileId = null;
      
      // Watch for new profiles appearing
      const observer = new MutationObserver((mutations) => {
        this.checkForNewProfile();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      // Initial check
      setTimeout(() => {
        this.checkForNewProfile();
      }, 1000);
      
      // Also check periodically in case observer misses changes
      setInterval(() => {
        this.checkForNewProfile();
      }, 2000);
    }
    
    checkForNewProfile() {
      const profileCard = document.querySelector(SELECTORS.profileCard);
      if (!profileCard) return;
      
      // Get current profile identifier (use user ID or name+age combo)
      const userElement = document.querySelector('[data-qa-role="encounters-user"]');
      const currentId = userElement?.textContent?.substring(0, 50) || '';
      
      // Only process if profile changed
      if (currentId && currentId !== this.lastProfileId) {
        console.log('🔄 New profile detected!');
        this.lastProfileId = currentId;
        this.onNewProfile(profileCard);
      }
    }

    async onNewProfile(profileCard) {
      // Wait for Bumble to fully load the profile content
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Don't use the passed profileCard - get fresh data from DOM
      let profile = this.extractProfileData(null);
      
      // If name not found, retry with longer delays
      let retries = 0;
      while (profile.name === 'Unknown' && retries < 3) {
        retries++;
        console.log(`Name not found, retry ${retries}/3...`);
        await new Promise(resolve => setTimeout(resolve, 600));
        profile = this.extractProfileData(null);
      }
      
      // Show what we found
      const container = document.getElementById('wingman-analysis');
      console.log('Displaying profile in overlay:', profile.name, profile.age, profile.bio?.substring(0, 30));
      
      let displayHtml = `<p><strong>${profile.name || 'Unknown'}</strong>${profile.age ? ', ' + profile.age : ''}</p>`;
      if (profile.bio && profile.bio.length > 5) {
        // Clean up the bio - remove repeated words and limit length
        let cleanBio = profile.bio.replace(/About [A-Z]/i, '').substring(0, 80);
        displayHtml += `<p style="font-size: 11px; color: #94a3b8;">${cleanBio}...</p>`;
      }
      displayHtml += `<p style="color: #4ecdc4; font-size: 11px;">📊 Analyzing...</p>`;
      container.innerHTML = displayHtml;

      // Notify background script
      chrome.runtime.sendMessage({
        type: 'PROFILE_DETECTED',
        payload: profile
      });

      // Request analysis
      try {
        this.updateAnalysisUI(`Analyzing ${profile.name}...`);
        
        const response = await chrome.runtime.sendMessage({
          type: 'ANALYZE_PROFILE',
          payload: profile
        });

        console.log('Analysis response:', response);

        if (response?.success && response?.analysis) {
          this.displayAnalysis(response.analysis, profile);
        } else if (response?.error) {
          console.error('Analysis error:', response.error);
          this.updateAnalysisUI(`Error: ${response.error}`);
        } else {
          // Show basic info even without AI analysis
          this.displayBasicProfile(profile);
        }
      } catch (error) {
        console.error('Failed to analyze:', error);
        this.displayBasicProfile(profile);
      }
    }

    displayBasicProfile(profile) {
      const container = document.getElementById('wingman-analysis');
      let html = `<p><strong>${profile.name || 'Unknown'}</strong>${profile.age ? ', ' + profile.age : ''}</p>`;
      
      if (profile.bio && profile.bio.length > 10) {
        html += `<p style="font-size: 11px; opacity: 0.8;">${profile.bio.substring(0, 80)}...</p>`;
      } else {
        html += `<p style="color: #f59e0b;">⚠ No bio provided</p>`;
      }
      
      if (profile.imageUrl) {
        html += `<p style="color: #4ecdc4;">📸 Photo detected</p>`;
      }
      
      container.innerHTML = html;
    }

    extractProfileData(profileCard = null) {
      let name = 'Unknown';
      let age = '';
      let bio = '';
      let images = [];

      // Search the ENTIRE page for profile data (don't rely on profileCard)
      const pageText = document.body.innerText;
      
      // Method 1: Find all text that looks like "Name, Age" pattern
      const allElements = document.querySelectorAll('span, div, p, h1, h2');
      for (const el of allElements) {
        // Skip sidebar and our overlay
        if (el.closest('.page__sidebar') || el.closest('#wingman-overlay')) continue;
        
        const text = el.textContent.trim();
        // Match patterns like "M, 22" or "Sarah, 25"
        const match = text.match(/^([A-Z][a-zA-Z]{0,20}),\s*(\d{2})$/);
        if (match && text.length < 30) {
          name = match[1];
          age = match[2];
          console.log('✓ Found name/age from element:', name, age, '- element:', el.tagName, el.className);
          break;
        }
      }

      // Method 2: Try encounters-user section
      if (name === 'Unknown') {
        const userSection = document.querySelector('[data-qa-role="encounters-user"], [class*="encounters-user"]');
        if (userSection) {
          const text = userSection.textContent;
          console.log('User section text:', text.substring(0, 100));
          const nameAgeMatch = text.match(/([A-Z][a-zA-Z]*),?\s*(\d{2})/);
          if (nameAgeMatch) {
            name = nameAgeMatch[1];
            age = nameAgeMatch[2];
            console.log('✓ Found from user section:', name, age);
          }
        }
      }
      
      // Method 3: Look for any "X, YY" pattern in the right side of page
      if (name === 'Unknown') {
        const rightContent = document.querySelector('[class*="page__content"]');
        if (rightContent) {
          const text = rightContent.textContent;
          const match = text.match(/([A-Z][a-zA-Z]*),\s*(\d{2})/);
          if (match) {
            name = match[1];
            age = match[2];
            console.log('✓ Found from page content:', name, age);
          }
        }
      }

      // Find bio/about section and job info
      const bioSelectors = [
        '[class*="encounters-story__about"]',
        '[class*="encounters-user__bio"]',
        '[class*="about"]',
        '[class*="bio"]',
        '[class*="description"]',
        '[class*="occupation"]',
        '[class*="job"]'
      ];
      
      for (const sel of bioSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 3) {
          bio = el.textContent.trim();
          console.log('Found bio:', bio.substring(0, 50));
          break;
        }
      }

      // Also look for job/occupation near the name (like "Researcher")
      if (!bio || bio.length < 10) {
        const userSection = document.querySelector('[class*="encounters-user"]');
        if (userSection) {
          const text = userSection.textContent;
          // Get text after the age that might be a job title
          const jobMatch = text.match(/\d{2}\s+([A-Za-z\s]+?)(?:\s|$)/);
          if (jobMatch && jobMatch[1] && jobMatch[1].length > 2) {
            bio = jobMatch[1].trim();
            console.log('Found job/bio:', bio);
          }
        }
      }

      // Find profile images
      const imgSelectors = [
        '[class*="encounters-story"] img',
        '[class*="photo"] img',
        '[class*="media"] img', 
        '[class*="profile"] img',
        'img[src*="images"]',
        'img[src*="photo"]',
        '.keen-slider img',
        'picture img',
        'img'
      ];

      for (const sel of imgSelectors) {
        const imgs = document.querySelectorAll(sel);
        imgs.forEach(img => {
          if (img.src && 
              img.src.includes('http') && 
              !img.src.includes('icon') && 
              !img.src.includes('logo') &&
              !img.src.includes('emoji') &&
              img.width > 100) {
            images.push(img.src);
          }
        });
        if (images.length > 0) break;
      }

      const profileData = {
        name,
        age,
        bio,
        imageUrl: images[0] || null,
        images: [...new Set(images)], // Remove duplicates
        timestamp: Date.now(),
        platform: 'bumble'
      };

      console.log('Extracted profile data:', profileData);
      return profileData;
    }

    displayAnalysis(analysis, profile = {}) {
      const container = document.getElementById('wingman-analysis');
      const suggestionBox = document.getElementById('wingman-suggestion');
      
      console.log('Displaying analysis:', analysis);
      
      let html = '';
      
      // Show name/age header
      if (profile.name) {
        html += `<p><strong>${profile.name}</strong>${profile.age ? ', ' + profile.age : ''}</p>`;
      }
      
      // Bio analysis
      if (analysis.bio) {
        if (analysis.bio.interests?.length) {
          html += `<p>🎯 <strong>Into:</strong> ${analysis.bio.interests.slice(0, 4).join(', ')}</p>`;
        }
        if (analysis.bio.personality?.length) {
          html += `<p>✨ <strong>Vibe:</strong> ${analysis.bio.personality.slice(0, 3).join(', ')}</p>`;
        }
        if (analysis.bio.greenFlags?.length) {
          html += `<p class="green">✓ ${analysis.bio.greenFlags.slice(0, 2).join(', ')}</p>`;
        }
        if (analysis.bio.redFlags?.length) {
          html += `<p class="red">⚠ ${analysis.bio.redFlags.slice(0, 2).join(', ')}</p>`;
        }
        if (analysis.bio.lookingFor) {
          html += `<p>💕 <strong>Looking for:</strong> ${analysis.bio.lookingFor}</p>`;
        }
      }
      
      // Image analysis
      if (analysis.image) {
        if (analysis.image.vibe) {
          html += `<p>📸 <strong>Vibe:</strong> ${analysis.image.vibe}</p>`;
        }
        if (analysis.image.interests?.length) {
          html += `<p>🎨 ${analysis.image.interests.slice(0, 3).join(', ')}</p>`;
        }
      }

      // If we have no analysis content, show that
      if (!html) {
        html = '<p>Analysis complete</p>';
        if (!profile.bio && !profile.imageUrl) {
          html += '<p style="font-size: 11px; color: #f59e0b;">No bio/photos found to analyze</p>';
        }
      }

      container.innerHTML = html;

      // Show conversation starters
      if (analysis.bio?.conversation_starters?.length) {
        suggestionBox.innerHTML = `
          <strong>💬 Openers:</strong>
          <ul>${analysis.bio.conversation_starters.slice(0, 3).map(s => `<li>${s}</li>`).join('')}</ul>
        `;
      } else {
        suggestionBox.innerHTML = '';
      }
    }

    updateAnalysisUI(text) {
      const container = document.getElementById('wingman-analysis');
      container.innerHTML = `<p>${text}</p>`;
    }

    findButton(selectors) {
      // Try each selector until we find a button
      for (const selector of selectors) {
        try {
          const button = document.querySelector(selector);
          if (button) {
            console.log('Found button with selector:', selector);
            return button;
          }
        } catch (e) {
          // Some selectors might not be valid, skip them
          continue;
        }
      }
      return null;
    }

    findButtonByPosition(type) {
      // Fallback: find buttons by their position in the action area
      // Pass is usually on the left (X icon), Like on the right (checkmark)
      const allButtons = document.querySelectorAll('button');
      const actionButtons = Array.from(allButtons).filter(btn => {
        const rect = btn.getBoundingClientRect();
        // Look for buttons in the lower portion of the screen (action area)
        return rect.bottom > window.innerHeight * 0.7 && 
               rect.width > 40 && rect.width < 200 &&
               rect.height > 40 && rect.height < 200;
      });

      console.log('Found action buttons:', actionButtons.length);

      if (actionButtons.length >= 2) {
        // Sort by x position
        actionButtons.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
        
        if (type === 'pass') {
          return actionButtons[0]; // Leftmost = Pass
        } else if (type === 'like') {
          return actionButtons[actionButtons.length - 1]; // Rightmost = Like
        }
      }
      return null;
    }

    executeSwipe(direction, confidence = 100) {
      console.log('🎯 Executing swipe:', direction);
      
      // Record the swipe first
      const profileCard = document.querySelector(SELECTORS.profileCard);
      if (profileCard) {
        const profile = this.extractProfileData(profileCard);
        chrome.runtime.sendMessage({
          type: direction === 'left' ? 'SWIPE_LEFT' : (direction === 'super' ? 'SUPER_LIKE' : 'SWIPE_RIGHT'),
          payload: profile
        });
      }

      // Visual feedback
      this.showSwipeFeedback(direction, confidence);

      // Ask background script to execute swipe in page context
      chrome.runtime.sendMessage({
        type: 'EXECUTE_SWIPE_IN_PAGE',
        direction: direction
      });
    }

    simulateKeyPress(direction) {
      // Bumble/Tinder often support keyboard shortcuts
      const keyMappings = {
        left: ['ArrowLeft', 'Left'],
        right: ['ArrowRight', 'Right'], 
        super: ['ArrowUp', 'Up']
      };

      const keys = keyMappings[direction] || [];
      
      keys.forEach((key, index) => {
        setTimeout(() => {
          console.log('Simulating key press:', key);
          
          // Dispatch to document
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: key,
            code: key,
            keyCode: key === 'ArrowLeft' ? 37 : (key === 'ArrowRight' ? 39 : 38),
            which: key === 'ArrowLeft' ? 37 : (key === 'ArrowRight' ? 39 : 38),
            bubbles: true,
            cancelable: true
          }));
          
          document.dispatchEvent(new KeyboardEvent('keyup', {
            key: key,
            code: key,
            keyCode: key === 'ArrowLeft' ? 37 : (key === 'ArrowRight' ? 39 : 38),
            which: key === 'ArrowLeft' ? 37 : (key === 'ArrowRight' ? 39 : 38),
            bubbles: true,
            cancelable: true
          }));

          // Also try on body
          document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: key,
            code: key,
            bubbles: true
          }));
        }, index * 50);
      });
    }

    simulateRealClick(element) {
      // Get element position for realistic event coordinates
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX,
        screenY: centerY,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      };

      // Focus the element first
      element.focus();

      // Dispatch pointer events (modern browsers)
      try {
        element.dispatchEvent(new PointerEvent('pointerdown', eventOptions));
        element.dispatchEvent(new PointerEvent('pointerup', eventOptions));
      } catch (e) {
        console.log('PointerEvent not supported');
      }

      // Dispatch mouse events
      element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      element.dispatchEvent(new MouseEvent('click', eventOptions));

      // Also try the native click
      element.click();

      // Try triggering via touch events (some sites check for these)
      try {
        const touch = new Touch({
          identifier: Date.now(),
          target: element,
          clientX: centerX,
          clientY: centerY,
          screenX: centerX,
          screenY: centerY,
          pageX: centerX + window.scrollX,
          pageY: centerY + window.scrollY,
          radiusX: 2.5,
          radiusY: 2.5,
          rotationAngle: 0,
          force: 1
        });

        element.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch]
        }));

        element.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touch]
        }));
      } catch (e) {
        // Touch events might not work on desktop
        console.log('Touch simulation skipped');
      }

      console.log('Full click simulation complete');
    }

    showSwipeFeedback(direction, confidence) {
      const feedback = document.createElement('div');
      feedback.className = `wingman-feedback ${direction}`;
      feedback.innerHTML = direction === 'right' ? '❤️' : (direction === 'super' ? '⭐' : '👎');
      document.body.appendChild(feedback);
      
      setTimeout(() => feedback.remove(), 1000);
    }

    startAutoSwipe() {
      this.isAutoSwiping = true;
      this.updateStatus('Auto-swiping...', 'active');
      console.log('🤖 Auto-swipe mode activated');
    }

    stopAutoSwipe() {
      this.isAutoSwiping = false;
      this.updateStatus('Ready', 'ready');
      console.log('⏹️ Auto-swipe mode deactivated');
    }

    updateStatus(text, state) {
      const statusText = this.overlay.querySelector('.status-text');
      const statusIndicator = this.overlay.querySelector('.status-indicator');
      
      if (statusText) statusText.textContent = text;
      if (statusIndicator) {
        statusIndicator.className = `status-indicator ${state}`;
      }
    }

    showSuggestedResponse(response) {
      const suggestionBox = document.getElementById('wingman-suggestion');
      suggestionBox.innerHTML = `
        <strong>Suggested reply:</strong>
        <p class="suggested-message">${response}</p>
        <button class="wingman-btn copy" onclick="navigator.clipboard.writeText('${response.replace(/'/g, "\\'")}')">📋 Copy</button>
      `;
    }

    // ============================================
    // CHAT FEATURE - New Implementation
    // ============================================

    createChatOverlay() {
      this.chatOverlay = document.createElement('div');
      this.chatOverlay.id = 'wingman-chat-overlay';
      this.chatOverlay.innerHTML = `
        <div class="wingman-chat-panel">
          <div class="wingman-chat-header">
            <span class="wingman-logo">💬 Chat Wingman</span>
            <button class="wingman-toggle" id="wingman-chat-minimize">−</button>
          </div>
          <div class="wingman-chat-content">
            <div class="chat-match-info" id="chat-match-info">
              <div class="match-avatar" id="match-avatar"></div>
              <div class="match-details">
                <span class="match-name" id="match-name">Select a chat</span>
                <span class="match-status" id="match-status">Waiting...</span>
              </div>
            </div>
            
            <div class="chat-conversation-preview" id="chat-preview">
              <p class="preview-placeholder">Open a conversation to get AI assistance</p>
            </div>
            
            <div class="chat-suggestions" id="chat-suggestions">
              <div class="suggestion-header">
                <span>✨ AI Suggestions</span>
                <button class="refresh-btn" id="refresh-suggestions" title="Get new suggestions">🔄</button>
              </div>
              <div class="suggestion-list" id="suggestion-list">
                <!-- AI suggestions will appear here -->
              </div>
            </div>
            
            <div class="chat-actions">
              <button class="wingman-btn opener" id="generate-opener">💫 Generate Opener</button>
              <button class="wingman-btn reply" id="generate-reply">💭 Suggest Reply</button>
            </div>
            
            <div class="chat-style-section" id="chat-style-section">
              <div class="style-header">
                <span>📝 Your Style</span>
                <span class="style-status" id="style-status">Learning...</span>
              </div>
              <div class="style-info" id="style-info">
                <p>Send messages to help AI learn your style</p>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this.chatOverlay);
      this.bindChatOverlayEvents();
      
      // Initially hidden
      this.chatOverlay.style.display = 'none';
    }

    bindChatOverlayEvents() {
      // Minimize toggle
      document.getElementById('wingman-chat-minimize')?.addEventListener('click', () => {
        this.chatOverlay.classList.toggle('minimized');
      });

      // Generate opener button
      document.getElementById('generate-opener')?.addEventListener('click', () => {
        this.generateOpener();
      });

      // Generate reply button
      document.getElementById('generate-reply')?.addEventListener('click', () => {
        this.generateReply();
      });

      // Refresh suggestions
      document.getElementById('refresh-suggestions')?.addEventListener('click', () => {
        this.generateReply();
      });
    }

    // Detect if we're in swipe view or chat view
    detectCurrentView() {
      const isInChat = this.isInChatView();
      const newView = isInChat ? 'chat' : 'swipe';
      
      // Always update on first run or when view changes
      if (newView !== this.currentView || !this.viewInitialized) {
        console.log(`📍 View changed: ${this.currentView} → ${newView}`);
        this.currentView = newView;
        this.viewInitialized = true;
        this.updateOverlayVisibility();
        
        if (isInChat) {
          this.onEnterChat();
        }
      }
    }

    isInChatView() {
      const url = window.location.href;
      
      // Simple URL-based detection:
      // /app/connections = chat mode
      // /app (without connections) = swipe mode
      
      if (url.includes('/app/connections')) {
        console.log('💬 CHAT mode (URL: /app/connections)');
        return true;
      }
      
      console.log('💘 SWIPE mode (URL: /app)');
      return false;
    }

    updateOverlayVisibility() {
      console.log('📍 Updating overlay visibility. Current view:', this.currentView);
      
      if (this.currentView === 'chat') {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.chatOverlay) this.chatOverlay.style.display = 'block';
        console.log('💬 Showing CHAT overlay');
      } else {
        if (this.overlay) this.overlay.style.display = 'block';
        if (this.chatOverlay) this.chatOverlay.style.display = 'none';
        console.log('💘 Showing SWIPE overlay');
      }
    }

    observeViewChanges() {
      let lastUrl = window.location.href;
      
      // Check URL every 500ms - simple and reliable for SPAs
      setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          console.log('🔗 URL changed:', currentUrl);
          lastUrl = currentUrl;
          this.detectCurrentView();
        }
      }, 500);

      // Also listen for popstate (back/forward navigation)
      window.addEventListener('popstate', () => {
        console.log('⬅️ Popstate navigation');
        setTimeout(() => this.detectCurrentView(), 100);
      });
    }

    onEnterChat() {
      console.log('💬 Entered chat view');
      this.extractMatchInfo();
      this.setupChatObserver();
      this.loadConversation();
      this.watchForConversationSwitch();
      
      // Notify background
      chrome.runtime.sendMessage({
        type: 'CHAT_OPENED',
        payload: { match: this.currentChatMatch }
      });
    }

    watchForConversationSwitch() {
      // Watch for changes in the chat header (when user switches conversations)
      if (this.conversationSwitchObserver) {
        this.conversationSwitchObserver.disconnect();
      }
      if (this.conversationSwitchInterval) {
        clearInterval(this.conversationSwitchInterval);
      }

      this.lastMatchName = this.currentChatMatch?.name || '';

      // Check periodically if the match name changed
      this.conversationSwitchInterval = setInterval(() => {
        const nameEl = document.querySelector('.messages-header__name .header-2, .messages-header__name');
        const currentName = nameEl?.textContent?.trim()?.split(',')[0] || '';
        
        if (currentName && currentName !== this.lastMatchName) {
          console.log('🔄 Conversation switched:', this.lastMatchName, '→', currentName);
          this.lastMatchName = currentName;
          this.onConversationSwitch();
        }
      }, 500);

      // Also use MutationObserver on the header area
      const headerArea = document.querySelector('.messages-header, .page--chat');
      if (headerArea) {
        this.conversationSwitchObserver = new MutationObserver((mutations) => {
          const nameEl = document.querySelector('.messages-header__name .header-2');
          const currentName = nameEl?.textContent?.trim() || '';
          
          if (currentName && currentName !== this.lastMatchName) {
            console.log('🔄 Conversation switched (observer):', this.lastMatchName, '→', currentName);
            this.lastMatchName = currentName;
            this.onConversationSwitch();
          }
        });

        this.conversationSwitchObserver.observe(headerArea, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    }

    onConversationSwitch() {
      console.log('💬 Switching conversation...');
      
      // STOP any ongoing generation
      this.isGeneratingResponse = false;
      this.switchingConversation = true; // Flag to prevent race conditions
      
      // IMPORTANT: Clear ALL old data immediately
      this.conversationHistory = [];
      this.lastMessageCount = 0;
      this.currentChatMatch = null; // Clear old match!
      
      // Update UI to show loading
      const previewEl = document.getElementById('chat-preview');
      if (previewEl) {
        previewEl.innerHTML = '<p class="preview-placeholder">Loading new conversation...</p>';
      }
      
      // Clear old suggestions completely
      const suggestionList = document.getElementById('suggestion-list');
      if (suggestionList) {
        suggestionList.innerHTML = '<div class="suggestion-loading"><span class="loading-spinner">⏳</span><span>Switching chat...</span></div>';
      }
      
      // Clear match display
      const nameEl = document.getElementById('match-name');
      if (nameEl) nameEl.textContent = 'Loading...';

      // Wait LONGER for Bumble to fully switch the conversation in DOM
      setTimeout(() => {
        console.log('💬 Extracting new conversation data...');
        
        // Now extract match info (should be new person)
        this.extractMatchInfo();
        
        // Verify we got the right person before continuing
        console.log('👤 New match detected:', this.currentChatMatch?.name);
        
        this.setupChatObserver();
        
        // Load conversation with retry logic
        this.loadConversation();
        
        // Mark switching as complete
        this.switchingConversation = false;

        // Notify background
        chrome.runtime.sendMessage({
          type: 'CHAT_OPENED',
          payload: { match: this.currentChatMatch }
        });
      }, 1200); // Wait 1.2 seconds for Bumble to fully update DOM
    }

    extractMatchInfo() {
      // Get match name - using ACTUAL Bumble selectors
      const nameSelectors = [
        '.messages-header__name .header-2',
        '.messages-header__name',
        '[class*="header-2"]'
      ];
      
      let matchName = 'Unknown';
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          matchName = el.textContent.trim().split(',')[0];
          console.log('✅ Found match name:', matchName, 'using selector:', sel);
          break;
        }
      }

      // Get match photo - using ACTUAL Bumble selectors
      const photoSelectors = [
        '.messages-header__avatar img',
        '.messages-header img',
        '.page--chat img[class*="avatar"]'
      ];
      
      let matchPhoto = null;
      for (const sel of photoSelectors) {
        const el = document.querySelector(sel);
        if (el && el.src && !el.src.includes('icon') && !el.src.includes('emoji')) {
          matchPhoto = el.src;
          console.log('✅ Found match photo:', sel);
          break;
        }
      }

      this.currentChatMatch = {
        name: matchName,
        photo: matchPhoto,
        timestamp: Date.now()
      };

      // Update UI
      const nameEl = document.getElementById('match-name');
      const avatarEl = document.getElementById('match-avatar');
      const statusEl = document.getElementById('match-status');
      
      if (nameEl) nameEl.textContent = matchName;
      if (statusEl) statusEl.textContent = 'Ready to assist';
      if (avatarEl && matchPhoto) {
        avatarEl.innerHTML = `<img src="${matchPhoto}" alt="${matchName}">`;
      } else if (avatarEl) {
        avatarEl.innerHTML = `<span class="avatar-placeholder">${matchName.charAt(0)}</span>`;
      }

      console.log('👤 Match info:', this.currentChatMatch);
    }

    setupChatObserver() {
      // Disconnect any existing observer
      if (this.chatObserver) {
        this.chatObserver.disconnect();
      }

      this.chatObserver = new MutationObserver((mutations) => {
        this.onChatUpdate();
      });

      // Find the chat/message container
      const chatContainerSelectors = [
        '[class*="messenger-messages"]',
        '[class*="chat-messages"]',
        '[class*="conversation-messages"]',
        '[class*="message-list"]',
        SELECTORS.chatContainer
      ];

      for (const sel of chatContainerSelectors) {
        const container = document.querySelector(sel);
        if (container) {
          this.chatObserver.observe(container, { 
            childList: true, 
            subtree: true,
            characterData: true
          });
          console.log('👀 Watching chat container:', sel);
          break;
        }
      }

      // Also watch the input field for when user types
      this.watchMessageInput();
    }

    watchMessageInput() {
      const inputSelectors = [
        '.message-field textarea',
        'textarea[placeholder*="Start chatting"]',
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Message"]'
      ];

      for (const sel of inputSelectors) {
        const input = document.querySelector(sel);
        if (input) {
          // Avoid duplicate listeners
          if (input.dataset.wingmanWatching) return;
          input.dataset.wingmanWatching = 'true';
          
          // Watch for sent messages (to learn style)
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              const message = input.value.trim();
              if (message) {
                this.onMessageSent(message);
              }
            }
          });

          // Also watch the send button
          const sendBtn = document.querySelector('.message-field button, button[type="submit"]');
          if (sendBtn && !sendBtn.dataset.wingmanWatching) {
            sendBtn.dataset.wingmanWatching = 'true';
            sendBtn.addEventListener('click', () => {
              const message = input.value.trim();
              if (message) {
                this.onMessageSent(message);
              }
            });
          }

          console.log('⌨️ Watching input field:', sel);
          break;
        }
      }
    }

    onMessageSent(message) {
      console.log('📤 You sent:', message);
      
      // Learn from user's message (for style)
      chrome.runtime.sendMessage({
        type: 'LEARN_CHAT_STYLE',
        payload: { message, timestamp: Date.now() }
      });

      // Add to conversation history
      this.conversationHistory.push({
        sender: 'me',
        text: message,
        timestamp: Date.now()
      });

      // Update UI
      this.updateConversationPreview();
      this.updateStyleStatus();
      this.updateSuggestionContext();
      
      // Auto-generate follow-up suggestion after sending
      console.log('🤖 Auto-generating follow-up after your message...');
      setTimeout(() => {
        this.generateReply(); // This will detect it's a follow-up since you sent last
      }, 1000); // Wait 1 second before suggesting follow-up
    }

    onChatUpdate() {
      const messages = this.extractMessages();
      
      // Check if new messages arrived
      if (messages.length > this.lastMessageCount) {
        const newMessages = messages.slice(this.lastMessageCount);
        console.log('📩 New messages:', newMessages.length);
        
        // Check if the last message is from them (needs reply)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.sender === 'them') {
          this.onNewMessageFromMatch(lastMsg);
        }
        
        this.lastMessageCount = messages.length;
        this.conversationHistory = messages;
        this.updateConversationPreview();
      }
    }

    extractMessages() {
      const messages = [];
      
      // Try to find all message elements using ACTUAL Bumble selectors
      const messageSelectors = [
        '.message',
        '[class*="message-bubble"]',
        '.messages-list [class*="message"]'
      ];

      let messageElements = [];
      for (const sel of messageSelectors) {
        messageElements = document.querySelectorAll(sel);
        if (messageElements.length > 0) {
          console.log('✅ Found messages with selector:', sel, 'count:', messageElements.length);
          break;
        }
      }

      messageElements.forEach(el => {
        // Find the actual text content
        const textEl = el.querySelector('.message__text, .message-text, [class*="text"]') || el;
        const text = textEl.textContent?.trim();
        if (!text || text.length < 1) return;
        
        // Skip if it's a timestamp or system message
        if (text.includes('hour') && text.includes('ago')) return;
        if (text.includes('Conversation expires')) return;
        if (text.includes('hours left to start')) return;
        if (text.includes('before they disa')) return;
        if (text.includes('You matched')) return;
        if (text.includes('Start a chat')) return;
        if (text.includes('Introduce yourself')) return;
        if (text.includes('Make a move')) return;
        if (text.includes('only have') && text.includes('hours')) return;
        if (text.includes('respond before')) return;
        if (text.length < 3) return; // Skip very short text

        // Determine if it's from me or them based on class names
        // Check the element itself AND its parent containers
        let checkEl = el;
        let isFromMe = false;
        
        // Walk up the DOM to find sender indicators
        while (checkEl && checkEl !== document.body) {
          const classes = checkEl.className || '';
          
          // Bumble uses different class patterns for sent vs received
          // "out" or "from-me" = I sent it
          // "in" or "from-them" = They sent it
          if (classes.includes('--out') || classes.includes('from-me') || classes.includes('is-outgoing')) {
            isFromMe = true;
            break;
          }
          if (classes.includes('--in') || classes.includes('from-them') || classes.includes('is-incoming')) {
            isFromMe = false;
            break;
          }
          
          checkEl = checkEl.parentElement;
        }
        
        // Also check by position - messages on right are usually "me"
        if (!isFromMe) {
          const rect = el.getBoundingClientRect();
          const parentRect = el.closest('.messages-list')?.getBoundingClientRect();
          if (parentRect) {
            const centerX = rect.left + rect.width / 2;
            const parentCenterX = parentRect.left + parentRect.width / 2;
            // If message is more to the right, it's likely from me
            if (centerX > parentCenterX + 50) {
              isFromMe = true;
            }
          }
        }

        console.log(`📝 Message: "${text.substring(0, 30)}..." - From: ${isFromMe ? 'ME' : 'THEM'}`);

        messages.push({
          sender: isFromMe ? 'me' : 'them',
          text: text.substring(0, 500),
          timestamp: Date.now()
        });
      });

      console.log('📨 Extracted messages:', messages.length);
      return messages;
    }

    onNewMessageFromMatch(message) {
      console.log(`💌 ${this.currentChatMatch?.name || 'Match'} says:`, message.text);
      
      // Update status
      const statusEl = document.getElementById('match-status');
      if (statusEl) statusEl.textContent = '💬 New message! Generating reply...';

      // Update conversation preview
      this.updateConversationPreview();

      // AUTO-GENERATE reply when receiving a new message (always, not just when chat assist is on)
      console.log('🤖 Auto-generating reply to new message...');
      this.generateReply();

      // Notify background
      chrome.runtime.sendMessage({
        type: 'MESSAGE_RECEIVED',
        payload: {
          match: this.currentChatMatch,
          message: message,
          conversation: this.conversationHistory
        }
      });
    }

    updateConversationPreview() {
      const previewEl = document.getElementById('chat-preview');
      if (!previewEl) return;

      const recentMessages = this.conversationHistory.slice(-5);
      
      if (recentMessages.length === 0) {
        previewEl.innerHTML = '<p class="preview-placeholder">No messages yet - start the conversation!</p>';
        return;
      }

      const html = recentMessages.map(msg => `
        <div class="preview-message ${msg.sender === 'me' ? 'from-me' : 'from-them'}">
          <span class="msg-sender">${msg.sender === 'me' ? 'You' : this.currentChatMatch?.name || 'Them'}:</span>
          <span class="msg-text">${msg.text.substring(0, 60)}${msg.text.length > 60 ? '...' : ''}</span>
        </div>
      `).join('');

      previewEl.innerHTML = html;
    }

    async generateOpener() {
      if (this.isGeneratingResponse) return;
      
      this.isGeneratingResponse = true;
      this.updateSuggestionUI('loading', 'Crafting the perfect opener...');

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_RESPONSE',
          payload: {
            isOpener: true,
            match: this.currentChatMatch,
            conversation: []
          }
        });

        if (response?.success && response?.response) {
          this.displaySuggestions([response.response], 'opener');
        } else {
          this.updateSuggestionUI('error', response?.error || 'Failed to generate opener');
        }
      } catch (error) {
        console.error('Opener generation error:', error);
        this.updateSuggestionUI('error', 'Failed to connect to AI');
      }

      this.isGeneratingResponse = false;
    }

    async generateReply() {
      if (this.isGeneratingResponse) return;
      
      this.isGeneratingResponse = true;
      
      // Determine context - who sent the last message?
      const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
      const isFollowUp = lastMsg?.sender === 'me';
      
      const loadingText = isFollowUp 
        ? 'Thinking of a follow-up...' 
        : 'Crafting the perfect reply...';
      
      this.updateSuggestionUI('loading', loadingText);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_RESPONSE',
          payload: {
            isOpener: false,
            isFollowUp: isFollowUp, // NEW: Tell AI if this is a follow-up
            match: this.currentChatMatch,
            conversation: this.conversationHistory,
            lastMessageFrom: lastMsg?.sender || 'them'
          }
        });

        if (response?.success && response?.response) {
          const label = isFollowUp ? 'follow-up' : 'reply';
          this.displaySuggestions([response.response], label);
        } else {
          this.updateSuggestionUI('error', response?.error || 'Failed to generate');
        }
      } catch (error) {
        console.error('Reply generation error:', error);
        this.updateSuggestionUI('error', 'Failed to connect to AI');
      }

      this.isGeneratingResponse = false;
    }

    updateSuggestionUI(state, message) {
      const listEl = document.getElementById('suggestion-list');
      if (!listEl) return;

      if (state === 'loading') {
        listEl.innerHTML = `
          <div class="suggestion-loading">
            <span class="loading-spinner">⏳</span>
            <span>${message}</span>
          </div>
        `;
      } else if (state === 'error') {
        listEl.innerHTML = `
          <div class="suggestion-error">
            <span>❌</span>
            <span>${message}</span>
          </div>
        `;
      }
    }

    displaySuggestions(suggestions, type) {
      const listEl = document.getElementById('suggestion-list');
      if (!listEl) return;

      const html = suggestions.map((suggestion, index) => `
        <div class="suggestion-item" data-index="${index}">
          <p class="suggestion-text">${suggestion}</p>
          <div class="suggestion-actions">
            <button class="copy-btn" data-text="${suggestion.replace(/"/g, '&quot;')}" title="Copy to clipboard">📋 Copy</button>
            <button class="use-btn" data-text="${suggestion.replace(/"/g, '&quot;')}" title="Paste into input">✍️ Use</button>
          </div>
        </div>
      `).join('');

      listEl.innerHTML = html;

      // Bind click handlers
      listEl.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = btn.dataset.text;
          console.log('📋 Copy clicked, text:', text.substring(0, 50) + '...');
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '✅ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy', 2000);
          }).catch(err => {
            console.error('❌ Copy failed:', err);
            // Fallback: create temp textarea
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = '✅ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy', 2000);
          });
        });
      });

      listEl.querySelectorAll('.use-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = btn.dataset.text;
          console.log('✍️ Use clicked, text:', text.substring(0, 50) + '...');
          this.pasteIntoInput(text);
        });
      });
    }

    pasteIntoInput(text) {
      // Find the message input - EXACT Bumble selectors from DOM inspection
      const inputSelectors = [
        'textarea.textarea__input',           // Primary - exact class from Bumble
        '.chat-input textarea',               // Backup
        '.message-field_input textarea',      // Backup
        'textarea[placeholder*="Start chatting"]',
      ];

      let input = null;
      for (const sel of inputSelectors) {
        input = document.querySelector(sel);
        if (input) {
          console.log('📝 Found input with selector:', sel);
          break;
        }
      }

      if (!input) {
        console.error('❌ Could not find message input');
        alert('Could not find the message input. Please click on the text box first and try again.');
        return;
      }

      // This function sets value in a way React can detect
      this.setReactInputValue(input, text);

      // Visual feedback
      const useBtn = document.querySelector('.use-btn');
      if (useBtn) {
        useBtn.textContent = '✅ Pasted!';
        setTimeout(() => useBtn.textContent = '✍️ Use', 2000);
      }
    }

    setReactInputValue(input, value) {
      // Focus the input first
      input.focus();
      
      // Send message to background script to execute paste in MAIN world
      // This bypasses CSP restrictions
      chrome.runtime.sendMessage({
        type: 'PASTE_TEXT',
        text: value
      }, (response) => {
        if (response?.success) {
          console.log('✍️ Pasted suggestion via background script');
        } else {
          console.error('❌ Paste failed:', response?.error);
        }
      });
    }

    updateStyleStatus() {
      chrome.runtime.sendMessage({ type: 'GET_CHAT_STYLE' }, (response) => {
        const styleSection = document.getElementById('chat-style-section');
        const styleInfo = document.getElementById('style-info');
        const styleStatus = document.getElementById('style-status');
        
        if (response?.chatStyle) {
          const style = response.chatStyle;
          const sampleCount = style.samples?.length || 0;
          
          if (styleStatus) {
            if (sampleCount >= 10) {
              styleStatus.textContent = '✅ Active';
              styleStatus.style.color = '#22c55e';
            } else {
              styleStatus.textContent = 'Learning...';
              styleStatus.style.color = '#f59e0b';
            }
          }
          
          if (styleInfo) {
            if (sampleCount >= 5) {
              styleInfo.innerHTML = `
                <p>Tone: <strong>${style.tone || 'casual'}</strong> • Emojis: <strong>${style.emojiUsage || 'moderate'}</strong></p>
              `;
            } else {
              styleInfo.innerHTML = `<p>Send ${10 - sampleCount} more messages to learn your style</p>`;
            }
          }
        }
      });
    }

    loadConversation() {
      // Wait for Bumble to fully load the new conversation
      // Use multiple attempts to ensure we get the right messages
      let attempts = 0;
      const maxAttempts = 5;
      
      const tryLoadMessages = () => {
        attempts++;
        console.log(`📚 Loading conversation attempt ${attempts}/${maxAttempts}...`);
        
        const messages = this.extractMessages();
        
        // Check if messages seem valid for this conversation
        // If we got messages, or we've tried enough times, proceed
        if (messages.length > 0 || attempts >= maxAttempts) {
          this.conversationHistory = messages;
          this.lastMessageCount = messages.length;
          this.updateConversationPreview();
          this.updateStyleStatus();
          
          console.log(`📚 Loaded ${messages.length} messages after ${attempts} attempts`);
          
          // Update UI based on who sent last message
          this.updateSuggestionContext();
          
          // AUTO-GENERATE suggestion when conversation loads
          setTimeout(() => {
            this.autoGenerateSuggestion();
          }, 300); // Small extra delay before generating
        } else {
          // No messages yet, try again
          setTimeout(tryLoadMessages, 500);
        }
      };
      
      // Start trying after initial delay for DOM to update
      setTimeout(tryLoadMessages, 1000);
    }

    autoGenerateSuggestion() {
      // Don't auto-generate if already generating or switching conversations
      if (this.isGeneratingResponse) {
        console.log('⏳ Already generating, skipping...');
        return;
      }
      if (this.switchingConversation) {
        console.log('⏳ Still switching conversation, skipping...');
        return;
      }
      if (!this.currentChatMatch?.name) {
        console.log('⏳ No match info yet, skipping...');
        return;
      }
      
      // Filter out any remaining system messages
      const realMessages = this.conversationHistory.filter(msg => {
        const text = msg.text.toLowerCase();
        if (text.includes('hours left')) return false;
        if (text.includes('introduce yourself')) return false;
        if (text.includes('start a chat')) return false;
        if (text.includes('make a move')) return false;
        if (text.includes('matched')) return false;
        return true;
      });
      
      const hasMessages = realMessages.length > 0;
      const lastMsg = realMessages[realMessages.length - 1];
      
      console.log(`📊 Generating for: ${this.currentChatMatch.name} | Real messages: ${realMessages.length}, Last from: ${lastMsg?.sender || 'none'}`);
      
      if (!hasMessages) {
        // No real messages - generate opener
        console.log(`🤖 Auto-generating OPENER for ${this.currentChatMatch.name}...`);
        this.generateOpener();
      } else if (lastMsg?.sender === 'them') {
        // They sent last message - generate reply
        console.log(`🤖 Auto-generating REPLY for ${this.currentChatMatch.name}...`);
        this.generateReply();
      } else {
        // I sent last message - generate follow-up
        console.log(`🤖 Auto-generating FOLLOW-UP for ${this.currentChatMatch.name}...`);
        this.generateReply();
      }
    }

    updateSuggestionContext() {
      const statusEl = document.getElementById('match-status');
      const lastMsg = this.conversationHistory[this.conversationHistory.length - 1];
      
      if (!lastMsg) {
        if (statusEl) statusEl.textContent = 'No messages yet - send an opener!';
        return;
      }
      
      if (lastMsg.sender === 'me') {
        // I sent the last message - waiting for their reply or need a follow-up
        if (statusEl) statusEl.textContent = 'Your turn sent - need a follow-up?';
      } else {
        // They sent the last message - I need to reply
        if (statusEl) statusEl.textContent = 'They replied - your turn!';
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BumbleWingman());
  } else {
    new BumbleWingman();
  }
})();

