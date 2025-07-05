# TTS Implementation Guide: OpenAI-Compatible Streaming TTS

This guide documents how to implement streaming Text-to-Speech (TTS) with sentence-by-sentence playback in Agent Zero, replacing the browser's Web Speech API with an OpenAI-compatible TTS service.

## Overview

The implementation replaces Agent Zero's default browser TTS with:
- OpenAI-compatible TTS API (using Kokoro model with bm_daniel voice)
- Real-time sentence detection during streaming responses
- Sequential audio playback (no overlapping speech)
- Chunk-by-chunk processing like a Python chatbot implementation

## Files Modified

### 1. Backend Settings (`python/helpers/settings.py`)

**Purpose**: Add TTS configuration to backend settings

**Changes Made**:
```python
# Added TTS configuration fields
tts_enabled: bool = Field(default=True, description="Enable/disable TTS")
tts_url: str = Field(default="http://0.0.0.0:8880/v1/audio/speech", description="TTS API URL")
tts_model: str = Field(default="kokoro", description="TTS model name")
tts_voice: str = Field(default="bm_daniel", description="TTS voice ID")
tts_speed: float = Field(default=1.0, description="TTS playback speed")
```

**Why**: Centralizes TTS configuration and makes it dynamically configurable from backend.

### 2. Backend Response Extension (`python/extensions/response_stream/_20_live_response.py`)

**Purpose**: Add TTS metadata to response logs for frontend detection

**Changes Made**:
```python
# Added TTS flag to response logs (lines 42-43)
log_item.update(kvps={"tts_trigger": True, "tts_text": parsed["tool_args"]["text"]})
```

**Why**: Provides a way for frontend to identify which messages should be spoken via TTS.

### 3. Frontend Speech Module (`webui/js/speech.js`)

**Purpose**: Replace browser Web Speech API with OpenAI-compatible TTS

**Key Changes**:

#### Constructor Updates:
```javascript
constructor() {
  this.currentAudio = null;
  this.ttsConfig = {
    enabled: false,
    url: "http://0.0.0.0:8880/v1/audio/speech",
    model: "kokoro", 
    voice: "bm_daniel",
    speed: 1.0
  };
  this.settingsLoaded = false;
  this.initializeSettings();
}
```

#### Dynamic Settings Loading:
```javascript
async loadTtsSettings() {
  try {
    const fetchFunction = window.fetchApi || fetch;
    const response = await fetchFunction('/settings');
    if (response.ok) {
      const settings = await response.json();
      this.ttsConfig.enabled = settings.tts_enabled ?? true;
      this.ttsConfig.url = settings.tts_url ?? this.ttsConfig.url;
      this.ttsConfig.model = settings.tts_model ?? this.ttsConfig.model;
      this.ttsConfig.voice = settings.tts_voice ?? this.ttsConfig.voice;
      this.ttsConfig.speed = settings.tts_speed ?? this.ttsConfig.speed;
    }
  } catch (error) {
    console.error("Failed to load TTS settings:", error);
  }
}
```

#### OpenAI API Integration:
```javascript
async speak(text) {
  // ... validation and preprocessing ...
  
  const response = await fetch(this.ttsConfig.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: this.ttsConfig.model,
      input: text,
      voice: this.ttsConfig.voice,
      speed: this.ttsConfig.speed
    })
  });
  
  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  this.currentAudio = new Audio(audioUrl);
  await this.currentAudio.play();
}
```

**Why**: Provides direct integration with OpenAI-compatible TTS services instead of browser speech synthesis.

### 4. Main Application Logic (`webui/index.js`)

**Purpose**: Implement streaming sentence detection and sequential playback

**Key Implementation**:

#### State Management:
```javascript
let responseStates = new Map(); // Track state per response ID
let ttsQueue = []; // Queue for TTS requests
let isPlaying = false; // Track if TTS is currently playing
```

#### Streaming Message Hook:
```javascript
function checkTTSInSetMessage(id, type, heading, content, temp, kvps) {
  if (localStorage.getItem("speech") !== "true") return;
  
  if (type === "response" && !temp && content && content.trim()) {
    // Initialize state for new response
    if (!responseStates.has(id)) {
      responseStates.set(id, {
        processedText: "",
        currentSentence: "",
        isComplete: false
      });
    }
    
    const state = responseStates.get(id);
    
    // Clean markdown formatting and URLs - keep link text, remove URLs
    const cleanContent = content
      .replace(/^#+\s*/gm, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
      .replace(/\*(.*?)\*/g, '$1') // Remove italic markdown
      .replace(/`(.*?)`/g, '$1') // Remove code markdown
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // Keep link text, remove URL part
      .replace(/https?:\/\/[^\s]+/g, '') // Remove standalone URLs
      .replace(/www\.[^\s]+/g, '') // Remove www URLs
      .replace(/[a-zA-Z0-9]+\.(com|org|net|io|edu|gov)[^\s]*/g, '') // Remove domain fragments
      .replace(/\s+/g, ' ') // Clean up multiple spaces
      .trim();
    
    // Process new chunks
    const newChunk = cleanContent.substring(state.processedText.length);
    if (newChunk.length > 0) {
      state.currentSentence += newChunk;
      
      // Detect complete sentences
      const sentenceEndMatch = state.currentSentence.match(/^(.*?[.!?]+)/);
      if (sentenceEndMatch) {
        const completeSentence = sentenceEndMatch[1].trim();
        if (completeSentence.length > 10) {
          queueTTS(completeSentence);
        }
        state.currentSentence = state.currentSentence.substring(sentenceEndMatch[1].length).trim();
      }
      
      state.processedText = cleanContent;
    }
  }
}
```

#### Sequential Queue System:
```javascript
function queueTTS(text) {
  ttsQueue.push(text);
  processQueue();
}

async function processQueue() {
  if (isPlaying || ttsQueue.length === 0) return;
  
  isPlaying = true;
  const text = ttsQueue.shift();
  
  try {
    await speakAndWait(text);
  } catch (error) {
    console.error("TTS queue error:", error);
  }
  
  isPlaying = false;
  processQueue(); // Process next item
}

function speakAndWait(text) {
  return new Promise((resolve, reject) => {
    speech.speak(text).then(() => {
      if (speech.currentAudio) {
        speech.currentAudio.onended = () => resolve();
        speech.currentAudio.onerror = () => reject();
      } else {
        resolve();
      }
    }).catch(reject);
  });
}
```

**Why**: 
- **Real-time Processing**: Detects sentences as they stream in
- **No Overlap**: Queue ensures sequential playback
- **Chunk-based**: Processes text incrementally like Python implementation

#### Message Interception:
```javascript
// Hook into setMessage function to intercept streaming responses
const originalSetMessage = window.setMessage;
window.setMessage = function(id, type, heading, content, temp, kvps) {
  checkTTSInSetMessage(id, type, heading, content, temp, kvps);
  return originalSetMessage.call(this, id, type, heading, content, temp, kvps);
};
```

**Why**: Captures every message update during streaming to process TTS in real-time.

## How It Works

### Flow Overview:
1. **User Input** → Agent generates streaming response
2. **Backend** → Live response extension adds TTS metadata to logs
3. **Frontend** → `setMessage` calls trigger TTS processing
4. **Sentence Detection** → Complete sentences are identified from streaming chunks
5. **Queue Management** → Sentences are queued for sequential playback
6. **Audio Playback** → TTS API generates audio, played one sentence at a time

### Key Algorithms:

#### Chunk Processing:
```
For each new content chunk:
1. Clean markdown formatting
2. Extract new text (current - previous)
3. Add to sentence buffer
4. Check for sentence endings (.!?)
5. If complete sentence found:
   - Queue for TTS
   - Remove from buffer
6. Update processed text pointer
```

#### Queue Management:
```
Queue Processing:
1. Check if currently playing → exit if yes
2. Get next sentence from queue
3. Call TTS API and wait for completion
4. Mark as finished and process next item
```

### Sentence Detection Logic:
- Uses regex `/^(.*?[.!?]+)/` to find complete sentences
- Handles streaming text by building sentences character by character
- Strips markdown formatting before processing
- Only speaks substantial sentences (>15 characters)

### URL and Link Handling:
- **Link Text Extraction**: Regex `/\[([^\]]+)\]\([^)]*\)/g, '$1'` extracts readable text from markdown links
- **URL Removal**: Multiple patterns remove standalone URLs, domain fragments, and www links
- **Smart Processing**: Speaks "Funny Adult Jokes & Humour" instead of URLs
- **No Content Skipping**: Processes entire responses instead of skipping link-heavy content

## Configuration

### Backend Settings:
- TTS can be enabled/disabled via `tts_enabled`
- API endpoint configurable via `tts_url`
- Model and voice selectable via `tts_model` and `tts_voice`
- Speed adjustable via `tts_speed`

### Frontend Control:
- TTS enabled/disabled via localStorage `"speech"` setting
- Automatic settings synchronization from backend
- Real-time configuration updates

## Debugging

### Key Log Messages:
```javascript
// Sentence detection
"*** TTS: Queueing complete sentence ***"

// Queue processing  
"*** TTS: Speaking from queue ***"

// Completion tracking
"TTS: Queue item finished playing"
```

### Debug Sequence:
1. Check `localStorage.getItem("speech")` is `"true"`
2. Verify TTS settings loaded from backend
3. Monitor sentence detection in console
4. Watch queue processing flow
5. Confirm sequential playback completion

## Comparison with Python Implementation

### Similarities:
- **Streaming Processing**: Both process text chunks as they arrive
- **Sentence Detection**: Both detect complete sentences for immediate speaking
- **Sequential Playback**: Both ensure no overlapping audio
- **Real-time Response**: Both speak during response generation, not after

### Key Differences:
- **Python**: Uses threading for concurrent processing
- **JavaScript**: Uses async/await with Promise-based queue
- **Python**: Direct audio streaming to system
- **JavaScript**: Browser Audio API with blob URLs

## Future Enhancements

### Potential Improvements:
1. **Voice Selection UI**: Frontend controls for voice/model selection
2. **Speed Controls**: Real-time speed adjustment
3. **Pause/Resume**: Ability to pause TTS queue
4. **Queue Management**: Clear queue, skip current item
5. **Error Recovery**: Better handling of TTS API failures
6. **Pronunciation**: Custom pronunciation rules
7. **SSML Support**: Advanced speech markup

### Performance Optimizations:
1. **Audio Caching**: Cache common phrases
2. **Preemptive Loading**: Start next TTS while current playing
3. **Chunk Optimization**: Adjust chunk sizes for better flow
4. **Network Optimization**: Connection pooling for TTS API

## Troubleshooting

### Common Issues:

1. **No TTS Audio**:
   - Check `localStorage.getItem("speech")` 
   - Verify TTS API accessibility
   - Check browser audio permissions

2. **Overlapping Speech**:
   - Verify queue system implementation
   - Check `isPlaying` flag management
   - Ensure proper audio completion detection

3. **Missing Sentences**:
   - Check sentence detection regex
   - Verify chunk processing logic
   - Monitor state management between updates

4. **TTS Speaking URLs Instead of Link Text**:
   - Verify link text extraction regex: `/\[([^\]]+)\]\([^)]*\)/g, '$1'`
   - Check URL removal patterns are working
   - Ensure content cleaning happens before sentence detection
   - Monitor browser console for link detection logs

5. **API Errors**:
   - Validate TTS service endpoint
   - Check request format compatibility
   - Verify network connectivity

## Files Created/Modified Summary

| File | Type | Purpose |
|------|------|---------|
| `python/helpers/settings.py` | Modified | Added TTS configuration fields |
| `python/extensions/response_stream/_20_live_response.py` | Modified | Added TTS trigger metadata |
| `webui/js/speech.js` | Modified | Replaced Web Speech API with OpenAI TTS |
| `webui/index.js` | Modified | Added streaming sentence detection and queue system |
| `TTS_IMPLEMENTATION_GUIDE.md` | Created | This documentation file |

This implementation successfully replicates the Python chatbot's streaming TTS behavior in the web interface, providing real-time sentence-by-sentence speech synthesis with proper queue management and no audio overlap.
