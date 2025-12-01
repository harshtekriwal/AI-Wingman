// AI Service - Handles all OpenAI API interactions
import { StorageService } from './storage.js';

export class AIService {
  constructor() {
    this.storage = new StorageService();
    this.baseUrl = 'https://api.openai.com/v1';
  }

  // Get API key from storage
  async getApiKey() {
    return await this.storage.getApiKey();
  }

  // Make API request
  async request(endpoint, body) {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please add your key in settings.');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    return response.json();
  }

  // Analyze a profile image to extract features
  async analyzeProfileImage(imageUrl) {
    const result = await this.request('/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a dating profile analyzer. Analyze the profile photo and extract relevant dating characteristics.
          Return a JSON object with:
          - estimatedAge: number
          - physicalTraits: array of strings (hair color, style, etc)
          - vibe: string (adventurous, artistic, professional, sporty, etc)
          - interests: array of strings (visible hobbies, activities, settings)
          - attractivenessFactors: array of strings (smile, style, confidence, etc)
          Be respectful and objective.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this dating profile photo:' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500
    });

    const content = result.choices[0]?.message?.content;
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return { rawAnalysis: content };
    }
  }

  // Analyze profile bio text
  async analyzeProfileBio(bio) {
    const result = await this.request('/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze this dating profile bio and extract:
          - personality: array of traits
          - interests: array of hobbies/interests mentioned
          - lookingFor: what they seem to want
          - redFlags: any concerning patterns (be objective)
          - greenFlags: positive indicators
          - humor: boolean, do they seem funny
          - conversation_starters: 2-3 topics you could talk about based on the bio
          Return as JSON.`
        },
        {
          role: 'user',
          content: bio
        }
      ],
      max_tokens: 500
    });

    const content = result.choices[0]?.message?.content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return { rawAnalysis: content };
    }
  }

  // Decide whether to swipe right based on preferences
  async shouldSwipeRight(profile, preferences) {
    const result = await this.request('/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a dating assistant helping someone find matches. Based on their learned preferences and the current profile, decide if they would like this person.
          
          User's preferences and patterns:
          ${JSON.stringify(preferences, null, 2)}
          
          Return JSON with:
          - decision: "right" | "left" | "super"
          - confidence: 0-100
          - reasons: array of strings explaining why
          - matchPercentage: estimated compatibility 0-100`
        },
        {
          role: 'user',
          content: `Profile to evaluate:\n${JSON.stringify(profile, null, 2)}`
        }
      ],
      max_tokens: 300
    });

    const content = result.choices[0]?.message?.content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : { decision: 'left', confidence: 50 };
    } catch {
      return { decision: 'left', confidence: 50, reasons: ['Could not analyze'] };
    }
  }

  // Generate a chat response in user's style
  async generateChatResponse(conversation, chatStyle, matchProfile, isFollowUp = false) {
    const styleSamples = chatStyle.samples
      ?.slice(-20)
      .map(s => s.text)
      .join('\n') || '';

    const contextInstruction = isFollowUp
      ? `The user sent the LAST message and hasn't gotten a reply yet. Generate a FOLLOW-UP message to:
         - Re-engage the conversation
         - Ask a question or share something interesting
         - NOT repeat what was already said
         - Keep it light and not desperate`
      : `The match sent the last message. Generate a REPLY that:
         - Responds to what they said
         - Keeps the conversation flowing
         - Shows genuine interest`;

    const result = await this.request('/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are helping someone chat on a dating app. Generate a response that matches their texting style.
          
          Their texting style samples:
          ${styleSamples}
          
          Style characteristics:
          - Tone: ${chatStyle.tone || 'casual'}
          - Emoji usage: ${chatStyle.emojiUsage || 'moderate'}
          
          Match's profile info:
          ${matchProfile ? JSON.stringify(matchProfile) : 'Not available'}
          
          CONTEXT: ${contextInstruction}
          
          Rules:
          - Match their typing style (length, punctuation, emoji usage)
          - Be natural and conversational
          - Don't be creepy or too forward too fast
          - Build rapport and find common interests
          - Keep it interesting and engaging
          - Return ONLY the message text, nothing else`
        },
        {
          role: 'user',
          content: `Conversation so far:\n${conversation}\n\nGenerate my next ${isFollowUp ? 'follow-up' : 'response'}:`
        }
      ],
      max_tokens: 150
    });

    return result.choices[0]?.message?.content?.trim() || '';
  }

  // Generate opening line based on profile
  async generateOpener(profile, chatStyle) {
    const result = await this.request('/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Generate a creative, personalized opening message for a dating app. 
          
          Style: ${chatStyle.tone || 'casual'}
          Emoji usage: ${chatStyle.emojiUsage || 'moderate'}
          
          Rules:
          - Reference something specific from their profile
          - Be unique, not generic
          - Show genuine interest
          - Keep it short (1-2 sentences)
          - Don't use corny pickup lines
          - Return ONLY the message text`
        },
        {
          role: 'user',
          content: `Their profile:\n${JSON.stringify(profile, null, 2)}`
        }
      ],
      max_tokens: 100
    });

    return result.choices[0]?.message?.content?.trim() || '';
  }

  // Learn user preferences from swipe history
  async analyzePreferences(likedProfiles, dislikedProfiles) {
    const result = await this.request('/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Analyze the user's dating preferences based on their swipe history. Compare liked vs disliked profiles to find patterns.
          
          Return JSON with:
          - traits: array of preferred characteristics
          - interests: common interests they're attracted to
          - physicalPreferences: patterns in physical attributes
          - dealBreakers: things that made them swipe left
          - mustHaves: things consistently present in right swipes
          - type: one sentence describing their "type"`
        },
        {
          role: 'user',
          content: `Liked profiles:\n${JSON.stringify(likedProfiles.slice(-30), null, 2)}\n\nDisliked profiles:\n${JSON.stringify(dislikedProfiles.slice(-30), null, 2)}`
        }
      ],
      max_tokens: 500
    });

    const content = result.choices[0]?.message?.content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return null;
    }
  }

  // Analyze user's chat style from samples
  async analyzeChatStyle(samples) {
    const result = await this.request('/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze this person's texting style from their message samples.
          
          Return JSON with:
          - tone: primary tone (casual, flirty, funny, sincere, witty)
          - messageLength: short, medium, long
          - emojiUsage: none, minimal, moderate, heavy
          - punctuationStyle: proper, casual, none
          - patterns: array of notable patterns
          - vocabulary: array of frequently used words/phrases
          - humor: boolean
          - responseTime: quick, thoughtful (based on message complexity)`
        },
        {
          role: 'user',
          content: `Message samples:\n${samples.map(s => s.text || s).join('\n')}`
        }
      ],
      max_tokens: 400
    });

    const content = result.choices[0]?.message?.content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return null;
    }
  }
}


