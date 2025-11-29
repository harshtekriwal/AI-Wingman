// AI Wingman - Tinder Content Script
(function() {
  'use strict';

  const SELECTORS = {
    // Profile elements
    profileCard: '[class*="Expand"]',
    profileName: '[class*="Typs(display-1-strong)"]',
    profileAge: '[class*="Typs(display-1-strong)"] + span',
    profileBio: '[class*="BreakWord"]',
    profileImages: '.profileCard__slider img, [class*="keen-slider"] img',
    
    // Action buttons
    likeButton: '[class*="button"][class*="Like"], button[aria-label="Like"]',
    passButton: '[class*="button"][class*="Nope"], button[aria-label="Nope"]',
    superLikeButton: '[class*="button"][class*="Super"], button[aria-label="Super Like"]',
    
    // Chat elements
    chatContainer: '[class*="messageList"]',
    messageInput: '[class*="chat"] textarea',
    messages: '[class*="message"]',
    matchInfo: '[class*="matchHeaderContent"]',
    
    // Alternative selectors (Tinder updates frequently)
    profileCardAlt: '.recsCardboard__card',
    nameAlt: '.Ov\\(h\\).Fxs\\(1\\)',
    bioAlt: '.Fz\\(\\$s\\).C\\(\\$c-secondary\\)'
  };

  class TinderWingman {
    constructor() {
      this.isAutoSwiping = false;
      this.settings = {};
      this.overlay = null;
      this.lastProfile = null;
      this.init();
    }

    init() {
      console.log('🔥 AI Wingman loaded on Tinder');
      this.createOverlay();
      this.loadSettings();
      this.setupMessageListener();
      this.observeProfileChanges();
      this.setupKeyboardShortcuts();
    }

    createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.id = 'wingman-overlay';
      this.overlay.innerHTML = `
        <div class="wingman-panel">
          <div class="wingman-header">
            <span class="wingman-logo">🔥 AI Wingman</span>
            <button class="wingman-toggle" id="wingman-minimize">−</button>
          </div>
          <div class="wingman-content">
            <div class="wingman-status">
              <span class="status-indicator"></span>
              <span class="status-text">Ready</span>
            </div>
            <div class="wingman-match-score" id="wingman-score">
              <span class="score-value">--</span>
              <span class="score-label">Match Score</span>
            </div>
            <div class="wingman-analysis" id="wingman-analysis">
              <p>Waiting for profile...</p>
            </div>
            <div class="wingman-suggestion" id="wingman-suggestion"></div>
            <div class="wingman-actions">
              <button class="wingman-btn pass" id="wingman-pass">✖ Pass</button>
              <button class="wingman-btn like" id="wingman-like">💚 Like</button>
              <button class="wingman-btn super" id="wingman-super">💙 Super</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this.overlay);
      this.bindOverlayEvents();
    }

    bindOverlayEvents() {
      document.getElementById('wingman-minimize').addEventListener('click', () => {
        this.overlay.classList.toggle('minimized');
      });

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

    setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Only if not typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // Alt + A = Auto analyze
        if (e.altKey && e.key === 'a') {
          const card = this.findProfileCard();
          if (card) this.onNewProfile(card);
        }
        
        // Alt + R = Generate response (in chat)
        if (e.altKey && e.key === 'r') {
          this.generateChatResponse();
        }
      });
    }

    async loadSettings() {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
        this.settings = response?.settings || {};
      } catch (e) {
        console.log('Could not load settings');
      }
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
        return true;
      });
    }

    findProfileCard() {
      return document.querySelector(SELECTORS.profileCard) || 
             document.querySelector(SELECTORS.profileCardAlt) ||
             document.querySelector('[class*="gamepad"]');
    }

    observeProfileChanges() {
      const observer = new MutationObserver((mutations) => {
        const profileCard = this.findProfileCard();
        if (profileCard) {
          const profileHash = this.getProfileHash(profileCard);
          if (profileHash !== this.lastProfile) {
            this.lastProfile = profileHash;
            this.onNewProfile(profileCard);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Initial check
      setTimeout(() => {
        const profileCard = this.findProfileCard();
        if (profileCard) {
          this.onNewProfile(profileCard);
        }
      }, 2000);
    }

    getProfileHash(profileCard) {
      const name = this.extractName(profileCard);
      const age = this.extractAge(profileCard);
      return `${name}-${age}`;
    }

    extractName(profileCard) {
      const nameEl = profileCard.querySelector(SELECTORS.profileName) ||
                    profileCard.querySelector(SELECTORS.nameAlt) ||
                    profileCard.querySelector('[itemprop="name"]');
      return nameEl?.textContent?.trim() || 'Unknown';
    }

    extractAge(profileCard) {
      const ageEl = profileCard.querySelector(SELECTORS.profileAge);
      return ageEl?.textContent?.trim() || '';
    }

    async onNewProfile(profileCard) {
      const profile = this.extractProfileData(profileCard);
      this.updateAnalysisUI('Analyzing profile...');
      this.updateScoreUI('--');

      // Notify background script
      chrome.runtime.sendMessage({
        type: 'PROFILE_DETECTED',
        payload: profile
      });

      // Request analysis
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'ANALYZE_PROFILE',
          payload: profile
        });

        if (response?.analysis) {
          this.displayAnalysis(response.analysis, profile);
        }
      } catch (e) {
        this.updateAnalysisUI('Could not analyze profile');
      }
    }

    extractProfileData(profileCard) {
      const name = this.extractName(profileCard);
      const age = this.extractAge(profileCard);
      
      const bioEl = profileCard.querySelector(SELECTORS.profileBio) ||
                   profileCard.querySelector(SELECTORS.bioAlt);
      const bio = bioEl?.textContent?.trim() || '';
      
      const imageEls = profileCard.querySelectorAll(SELECTORS.profileImages);
      const images = Array.from(imageEls).map(img => img.src).filter(Boolean);

      return {
        name,
        age,
        bio,
        imageUrl: images[0] || null,
        images,
        timestamp: Date.now(),
        platform: 'tinder'
      };
    }

    displayAnalysis(analysis, profile) {
      const container = document.getElementById('wingman-analysis');
      const suggestionBox = document.getElementById('wingman-suggestion');
      
      let html = `<p><strong>${profile.name}</strong>, ${profile.age}</p>`;
      
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
      }
      
      if (analysis.image?.vibe) {
        html += `<p>📸 ${analysis.image.vibe}</p>`;
      }

      container.innerHTML = html || '<p>Analysis complete</p>';

      // Match score simulation (will be real when AI decides)
      if (analysis.bio?.greenFlags?.length > analysis.bio?.redFlags?.length) {
        this.updateScoreUI('85%');
      } else if (analysis.bio?.redFlags?.length > 0) {
        this.updateScoreUI('45%');
      } else {
        this.updateScoreUI('70%');
      }

      // Conversation starters
      if (analysis.bio?.conversation_starters) {
        suggestionBox.innerHTML = `
          <strong>💬 Openers:</strong>
          <ul>${analysis.bio.conversation_starters.map(s => `<li>${s}</li>`).join('')}</ul>
        `;
      }
    }

    updateAnalysisUI(text) {
      const container = document.getElementById('wingman-analysis');
      container.innerHTML = `<p>${text}</p>`;
    }

    updateScoreUI(score) {
      const scoreEl = document.querySelector('.score-value');
      if (scoreEl) scoreEl.textContent = score;
    }

    findButton(direction) {
      // Tinder changes their DOM frequently, try multiple selectors
      const selectors = {
        left: [
          '[class*="button"][class*="Nope"]',
          'button[aria-label="Nope"]',
          '[class*="recsCardboard__button--dislike"]',
          '.recsGamepad button:first-child'
        ],
        right: [
          '[class*="button"][class*="Like"]',
          'button[aria-label="Like"]',
          '[class*="recsCardboard__button--like"]',
          '.recsGamepad button:last-child'
        ],
        super: [
          '[class*="button"][class*="Super"]',
          'button[aria-label="Super Like"]',
          '[class*="recsCardboard__button--super"]'
        ]
      };

      for (const selector of selectors[direction] || []) {
        const button = document.querySelector(selector);
        if (button) return button;
      }
      return null;
    }

    executeSwipe(direction, confidence = 100) {
      const button = this.findButton(direction);

      if (button) {
        // Record the swipe
        const profile = this.extractProfileData(this.findProfileCard());
        chrome.runtime.sendMessage({
          type: direction === 'left' ? 'SWIPE_LEFT' : (direction === 'super' ? 'SUPER_LIKE' : 'SWIPE_RIGHT'),
          payload: profile
        });

        // Visual feedback
        this.showSwipeFeedback(direction, confidence);

        // Click
        setTimeout(() => button.click(), 150);
      } else {
        console.log('Could not find swipe button');
        // Try keyboard as fallback
        this.simulateKeyPress(direction);
      }
    }

    simulateKeyPress(direction) {
      const keyMap = {
        left: 'ArrowLeft',
        right: 'ArrowRight',
        super: 'ArrowUp'
      };
      
      const event = new KeyboardEvent('keydown', {
        key: keyMap[direction],
        code: keyMap[direction],
        bubbles: true
      });
      document.dispatchEvent(event);
    }

    showSwipeFeedback(direction, confidence) {
      const feedback = document.createElement('div');
      feedback.className = `wingman-feedback ${direction}`;
      
      const icons = {
        left: '✖',
        right: '💚',
        super: '💙'
      };
      
      feedback.innerHTML = `${icons[direction]}${confidence ? ` ${confidence}%` : ''}`;
      document.body.appendChild(feedback);
      
      setTimeout(() => feedback.remove(), 800);
    }

    startAutoSwipe() {
      this.isAutoSwiping = true;
      this.updateStatus('Auto-swiping...', 'active');
    }

    stopAutoSwipe() {
      this.isAutoSwiping = false;
      this.updateStatus('Ready', 'ready');
    }

    updateStatus(text, state) {
      const statusText = this.overlay?.querySelector('.status-text');
      const statusIndicator = this.overlay?.querySelector('.status-indicator');
      
      if (statusText) statusText.textContent = text;
      if (statusIndicator) {
        statusIndicator.className = `status-indicator ${state}`;
      }
    }

    showSuggestedResponse(response) {
      const suggestionBox = document.getElementById('wingman-suggestion');
      if (!suggestionBox) return;
      
      suggestionBox.innerHTML = `
        <strong>💬 Reply:</strong>
        <p class="suggested-message">${response}</p>
        <button class="wingman-btn copy" id="copy-response">📋 Copy</button>
        <button class="wingman-btn insert" id="insert-response">✏️ Insert</button>
      `;

      document.getElementById('copy-response')?.addEventListener('click', () => {
        navigator.clipboard.writeText(response);
        this.showToast('Copied!');
      });

      document.getElementById('insert-response')?.addEventListener('click', () => {
        this.insertIntoChat(response);
      });
    }

    insertIntoChat(text) {
      const input = document.querySelector(SELECTORS.messageInput) ||
                   document.querySelector('textarea');
      if (input) {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
    }

    showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'wingman-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    async generateChatResponse() {
      const messages = Array.from(document.querySelectorAll(SELECTORS.messages));
      const conversation = messages.map(m => m.textContent?.trim()).filter(Boolean).join('\n');
      
      if (conversation) {
        this.updateStatus('Generating reply...', 'active');
        chrome.runtime.sendMessage({
          type: 'MESSAGE_RECEIVED',
          payload: { conversation }
        });
      }
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new TinderWingman());
  } else {
    new TinderWingman();
  }
})();

