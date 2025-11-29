# 💘 AI Wingman - Dating App Assistant

An AI-powered Chrome extension that helps you with dating apps like Bumble and Tinder. It learns your preferences, assists with auto-swiping, and helps you chat more effectively.

![AI Wingman](./assets/preview.png)

## ✨ Features

### 🎯 Preference Learning
- **Learn Your Type**: The AI analyzes profiles you like and dislike to understand your preferences
- **Smart Matching**: Identifies patterns in who you're attracted to
- **Deal Breaker Detection**: Learns what makes you swipe left

### 👆 Auto-Swipe
- **AI-Powered Decisions**: Automatically swipe based on learned preferences
- **Confidence Scoring**: Only swipes when the AI is confident about a match
- **Speed Control**: Adjustable swipe speeds to look natural
- **Daily Limits**: Set limits to avoid app restrictions

### 💬 Chat Assistant
- **Learn Your Style**: Train the AI on your texting patterns
- **Generate Responses**: Get AI-suggested replies in your voice
- **Opening Lines**: Personalized openers based on the match's profile
- **Emoji Matching**: Matches your emoji usage patterns

### 📊 Analytics
- Track your swipes, matches, and chat statistics
- See your right-swipe rate
- Export your data anytime

## 🚀 Installation

### From Source (Developer Mode)

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/yourusername/dating-ai-wingman.git
   ```

2. **Convert SVG icons to PNG** (required for Chrome)
   - Use an online converter or image editor
   - Create `icon16.png`, `icon48.png`, `icon128.png` in the `icons` folder

3. **Load the extension in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dating-ai-wingman` folder

4. **Configure the extension**
   - Click the extension icon
   - Go to Settings
   - Add your OpenAI API key

## ⚙️ Configuration

### OpenAI API Key
You'll need an OpenAI API key for AI features:
1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add it in the extension settings

### Estimated Costs
- Profile analysis: ~$0.01 per profile
- Chat response: ~$0.005 per message
- Preference learning: ~$0.02 per analysis

## 📁 Project Structure

```
dating-ai-wingman/
├── manifest.json           # Extension manifest
├── popup/                  # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/                # Settings page
│   ├── options.html
│   ├── options.css
│   └── options.js
├── background/             # Background service worker
│   └── service-worker.js
├── content/                # Content scripts for dating apps
│   ├── bumble.js
│   ├── tinder.js
│   └── overlay.css
├── services/               # Shared services
│   ├── storage.js
│   ├── messages.js
│   └── ai-service.js
└── icons/                  # Extension icons
```

## 🎮 Usage

### On Bumble/Tinder
1. Open Bumble or Tinder in your browser
2. The AI Wingman overlay appears in the top right
3. Toggle features using the popup or overlay

### Auto-Swipe Mode
1. Enable "Learn My Type" and manually swipe some profiles
2. After 10+ swipes, enable "Auto-Swipe"
3. The AI will start making decisions for you
4. Adjust confidence threshold in settings

### Chat Assistant
1. Add your message samples in Settings > Chat Style
2. Enable "AI Chat Assistant"
3. When you receive a message, the AI suggests a reply
4. Click to copy or insert the suggestion

## ⚠️ Disclaimers

- **Terms of Service**: Auto-swiping may violate dating app ToS. Use at your own risk.
- **Privacy**: Your data is stored locally. The only external calls are to OpenAI.
- **No Guarantees**: This is a helper tool, not a magic bullet. Be genuine!

## 🔧 Development

### Prerequisites
- Chrome browser
- OpenAI API key
- Basic knowledge of Chrome extensions

### Testing
1. Make changes to the code
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension
4. Test on Bumble/Tinder

### Common Issues

**Extension not showing on dating apps?**
- Make sure you're on the correct URL (bumble.com or tinder.com)
- Refresh the page after loading the extension

**API errors?**
- Check your OpenAI API key is valid
- Ensure you have API credits

## 📝 License

MIT License - feel free to modify and use as you wish!

## 🤝 Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

---

**Made with ❤️ for all the single people out there!**

