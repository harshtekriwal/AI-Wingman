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
      'button[aria-label="Like"]',           // Exact match from accessibility tree
      '[data-qa-role="encounters-action-like"]',
      '.encounters-action--like'
    ],
    passButtons: [
      'button[aria-label="Pass"]',           // Exact match from accessibility tree  
      '[data-qa-role="encounters-action-dislike"]',
      '.encounters-action--dislike'
    ],
    superLikeButtons: [
      'button[aria-label="Super"]',          // Exact match
      'button[aria-label*="Super"]',
      '[data-qa-role="encounters-action-superswipe"]'
    ],
    
    // Chat elements
    chatContainer: '[class*="chat"], [class*="conversation"]',
    messageInput: '[class*="messenger-field"], textarea, [contenteditable="true"]',
    messages: '[class*="message__content"], [class*="message-text"]',
    matchInfo: '[class*="chat-header"], [class*="match-header"]'
  };

  class BumbleWingman {
    constructor() {
      this.isAutoSwiping = false;
      this.settings = {};
      this.overlay = null;
      this.init();
    }

    init() {
      console.log('💘 AI Wingman loaded on Bumble');
      this.createOverlay();
      this.loadSettings();
      this.setupMessageListener();
      this.observeProfileChanges();
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
      // Watch for new profiles appearing
      const observer = new MutationObserver((mutations) => {
        const profileCard = document.querySelector(SELECTORS.profileCard);
        if (profileCard && !profileCard.dataset.wingmanAnalyzed) {
          profileCard.dataset.wingmanAnalyzed = 'true';
          this.onNewProfile(profileCard);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Initial check
      setTimeout(() => {
        const profileCard = document.querySelector(SELECTORS.profileCard);
        if (profileCard) {
          this.onNewProfile(profileCard);
        }
      }, 1000);
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

      // Vote codes: Like=2, Pass=3, SuperLike=7
      const voteCode = direction === 'right' ? 2 : (direction === 'left' ? 3 : 7);
      
      // Find React component and call voteUser directly
      const qaRole = direction === 'right' ? 'encounters-action-like' : 
                    (direction === 'left' ? 'encounters-action-dislike' : 'encounters-action-superswipe');
      
      console.log('Looking for button with qa-role:', qaRole);
      const btn = document.querySelector(`[data-qa-role="${qaRole}"]`);
      
      if (!btn) {
        console.log('✗ Button not found for:', direction);
        return;
      }
      
      console.log('✓ Found button:', btn);
      
      try {
        const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
        console.log('Fiber key:', fiberKey);
        
        if (!fiberKey) {
          console.log('✗ No React fiber found on button');
          return;
        }
        
        let node = btn[fiberKey];
        let found = false;
        let depth = 0;
        
        while (node && depth < 50) {
          depth++;
          if (node.stateNode && typeof node.stateNode.voteUser === 'function') {
            console.log('✓ Found voteUser at depth:', depth);
            node.stateNode.voteUser(voteCode, 1);
            console.log(`✅ ${direction.toUpperCase()} executed with voteUser(${voteCode}, 1)`);
            found = true;
            break;
          }
          node = node.return;
        }
        
        if (!found) {
          console.log('✗ voteUser not found after traversing', depth, 'nodes');
        }
      } catch (error) {
        console.error('Error executing swipe:', error);
      }
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

    // Chat monitoring
    setupChatObserver() {
      const chatObserver = new MutationObserver((mutations) => {
        if (this.settings.chatAssist) {
          this.onChatUpdate();
        }
      });

      const chatContainer = document.querySelector(SELECTORS.chatContainer);
      if (chatContainer) {
        chatObserver.observe(chatContainer, { childList: true, subtree: true });
      }
    }

    async onChatUpdate() {
      const messages = Array.from(document.querySelectorAll(SELECTORS.messages));
      const conversation = messages.map(m => m.textContent).join('\n');
      
      chrome.runtime.sendMessage({
        type: 'MESSAGE_RECEIVED',
        payload: { conversation }
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BumbleWingman());
  } else {
    new BumbleWingman();
  }
})();

