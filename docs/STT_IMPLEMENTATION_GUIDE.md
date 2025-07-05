# STT Implementation Guide: OpenAI-Compatible Speech-to-Text

This guide documents how to replace Agent Zero's local Whisper STT with an OpenAI-compatible Speech-to-Text API service.

## Overview

The implementation replaces Agent Zero's default local Whisper model with:
- OpenAI-compatible STT API (using Systran/faster-whisper-medium model)
- Real-time audio processing maintained from original implementation
- External API integration for transcription processing
- Dynamic settings configuration from backend

## Files Modified

### 1. Backend Settings (`python/helpers/settings.py`)

**Purpose**: Replace local Whisper settings with OpenAI-compatible STT API configuration

**Changes Made**:
```python
# Replaced stt_model_size with new API fields
stt_enabled: bool = Field(default=True, description="Enable/disable STT")
stt_url: str = Field(default="http://0.0.0.0:7000/v1/audio/transcriptions", description="STT API URL")
stt_model: str = Field(default="Systran/faster-whisper-medium", description="STT model name")
stt_language: str = Field(default="en", description="STT language code")
stt_silence_threshold: float = Field(default=0.3, description="Audio level threshold")
stt_silence_duration: int = Field(default=1000, description="Silence duration before stopping")
stt_waiting_timeout: int = Field(default=2000, description="Timeout after silence")
```

**Settings UI Fields Updated**:
```python
# Added new STT configuration fields
stt_fields.append({
    "id": "stt_enabled",
    "title": "Enable STT",
    "description": "Enable or disable speech-to-text functionality",
    "type": "checkbox",
    "value": settings["stt_enabled"],
})

stt_fields.append({
    "id": "stt_url", 
    "title": "STT API URL",
    "description": "OpenAI-compatible STT API endpoint",
    "type": "text",
    "value": settings["stt_url"],
})

stt_fields.append({
    "id": "stt_model",
    "title": "STT Model", 
    "description": "STT model name",
    "type": "text",
    "value": settings["stt_model"],
})
```

**Default Settings**:
```python
# Updated default configuration
stt_enabled=True,
stt_url="http://0.0.0.0:7000/v1/audio/transcriptions",
stt_model="Systran/faster-whisper-medium", 
stt_language="en",
```

**Removed Local Whisper Dependency**:
```python
# Replaced whisper model preloading with comment
# STT now uses external API, no local model preloading needed
```

**Why**: Eliminates dependency on local Whisper models and enables external API integration.

### 2. Backend Transcribe API (`python/api/transcribe.py`)

**Purpose**: Replace local Whisper transcription with OpenAI-compatible API calls

**Complete Replacement**:
```python
from python.helpers.api import ApiHandler
from flask import Request, Response
import aiohttp
import base64
import io

from python.helpers import runtime, settings

class Transcribe(ApiHandler):
    async def process(self, input: dict, request: Request) -> dict | Response:
        audio = input.get("audio")
        ctxid = input.get("ctxid", "")

        context = self.get_context(ctxid)
        set = settings.get_settings()
        
        # Check if STT is enabled
        if not set.get("stt_enabled", True):
            return {"text": "", "error": "STT is disabled"}
        
        try:
            # Decode base64 audio
            audio_bytes = base64.b64decode(audio)
            
            # Call OpenAI-compatible STT API
            async with aiohttp.ClientSession() as session:
                # Create form data
                data = aiohttp.FormData()
                data.add_field('file', io.BytesIO(audio_bytes), filename='audio.wav', content_type='audio/wav')
                data.add_field('model', set.get("stt_model", "Systran/faster-whisper-medium"))
                data.add_field('language', set.get("stt_language", "en"))
                
                async with session.post(set.get("stt_url", "http://0.0.0.0:7000/v1/audio/transcriptions"), data=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        return result
                    else:
                        error_text = await response.text()
                        context.log.log(type="error", content=f"STT API error: {response.status} - {error_text}")
                        return {"text": "", "error": f"STT API error: {response.status}"}
                        
        except Exception as e:
            context.log.log(type="error", content=f"STT transcription error: {str(e)}")
            return {"text": "", "error": str(e)}
```

**Key Changes**:
- **Removed**: Local Whisper model loading and processing
- **Added**: HTTP form data submission to external API
- **Added**: Error handling for API failures
- **Added**: Settings-based configuration
- **Maintained**: Same input/output format for frontend compatibility

**Why**: Provides external API integration while maintaining the same interface for the frontend.

### 3. Frontend Speech Module (`webui/js/speech.js`)

**Purpose**: Update STT settings to work with new backend configuration

**Settings Object Updated**:
```javascript
const micSettings = {
  stt_enabled: true,
  stt_url: "http://0.0.0.0:7000/v1/audio/transcriptions",
  stt_model: "Systran/faster-whisper-medium",
  stt_language: "en",
  stt_silence_threshold: 0.05,
  stt_silence_duration: 1000,
  stt_waiting_timeout: 2000,
};
```

**Added STT Enable Check**:
```javascript
microphoneButton.addEventListener("click", async () => {
  if (isProcessingClick) return;
  isProcessingClick = true;

  // Check if STT is enabled
  if (!micSettings.stt_enabled) {
    if (window.toast) {
      window.toast("Speech-to-text is disabled in settings", "warning");
    }
    isProcessingClick = false;
    return;
  }
  
  // ... rest of microphone handling
});
```

**Settings Loading Maintained**:
- Existing `loadMicSettings()` function automatically loads new settings structure
- Dynamic field loading supports the new API-based configuration
- No changes needed to audio processing pipeline

**Why**: Maintains all existing audio capture and processing while adding API-based configuration.

## How It Works

### Flow Overview:
1. **Audio Capture** → Browser MediaRecorder captures audio chunks
2. **Voice Detection** → Real-time analysis detects speech/silence
3. **Audio Processing** → Audio converted to base64 and sent to backend
4. **API Call** → Backend calls OpenAI-compatible STT service
5. **Transcription** → External service returns transcribed text
6. **UI Update** → Text appears in chat input and message is sent

### Key Algorithms:

#### Audio Processing (Unchanged):
```
Voice Activity Detection:
1. Analyze audio RMS levels in real-time
2. Detect speech above threshold
3. Start recording when speech detected
4. Stop recording after silence duration
5. Process accumulated audio chunks
```

#### API Integration (New):
```
STT API Call:
1. Decode base64 audio to bytes
2. Create multipart form data:
   - file: audio.wav
   - model: configured model name
   - language: configured language
3. POST to external STT API
4. Parse JSON response for transcribed text
5. Return text to frontend
```

### External API Format:
The implementation expects OpenAI-compatible STT API with:
- **Endpoint**: POST to `/v1/audio/transcriptions`
- **Input**: Multipart form with `file`, `model`, `language` fields
- **Output**: JSON with `text` field containing transcription

## Configuration

### Backend Settings:
- STT can be enabled/disabled via `stt_enabled`
- API endpoint configurable via `stt_url`
- Model selectable via `stt_model`
- Language configurable via `stt_language`
- Audio processing settings preserved

### Frontend Behavior:
- STT disabled if `stt_enabled` is false
- Dynamic settings loading from backend
- Real-time audio processing maintained
- Voice activity detection unchanged

## Dependencies

### Added Requirements:
- **aiohttp**: For async HTTP requests to external API (already present)
- **base64, io**: For audio data processing (built-in)

### Removed Dependencies:
- **whisper**: Local Whisper model processing removed
- **torch**: No longer needed for local inference (if not used elsewhere)

## Error Handling

### API Failures:
```python
# Backend handles API errors gracefully
if response.status != 200:
    error_text = await response.text()
    context.log.log(type="error", content=f"STT API error: {response.status} - {error_text}")
    return {"text": "", "error": f"STT API error: {response.status}"}
```

### Network Issues:
```python
# Exception handling for network problems
except Exception as e:
    context.log.log(type="error", content=f"STT transcription error: {str(e)}")
    return {"text": "", "error": str(e)}
```

### Frontend Fallbacks:
```javascript
// User notification when STT is disabled
if (!micSettings.stt_enabled) {
    window.toast("Speech-to-text is disabled in settings", "warning");
    return;
}
```

## Debugging

### Key Log Messages:
```python
# Backend STT processing
context.log.log(type="error", content=f"STT API error: {response.status}")
context.log.log(type="error", content=f"STT transcription error: {str(e)}")
```

```javascript
// Frontend audio processing (existing)
console.log("Speech started");
console.log("Audio chunk received, total chunks:", audioChunks.length);
console.log("Transcription:", result.text);
```

### Debug Sequence:
1. Check `micSettings.stt_enabled` is `true`
2. Verify STT API accessibility via curl
3. Monitor audio chunk collection in browser console
4. Check backend logs for API call results
5. Verify transcription response format

## Comparison with Local Whisper

### Advantages of External API:
- **No Model Loading**: Eliminates large model downloads and memory usage
- **Better Performance**: External service optimized for STT processing
- **Scalability**: Can handle multiple concurrent requests
- **Model Updates**: External service can update models without Agent Zero changes
- **Resource Efficiency**: Reduces Agent Zero memory and CPU usage

### Maintained Features:
- **Real-time Processing**: Voice activity detection and audio capture unchanged
- **Same Interface**: Frontend continues to work exactly the same
- **Settings Integration**: STT configuration remains in Agent Zero settings
- **Error Handling**: Graceful fallbacks for API failures

## Testing

### STT API Verification:
```bash
# Test API accessibility
curl -X POST http://0.0.0.0:7000/v1/audio/transcriptions

# Expected response: 422 with missing file field error
{"detail":[{"type":"missing","loc":["body","file"],"msg":"Field required","input":null}]}
```

### Agent Zero STT Test:
1. Open Agent Zero web interface
2. Click microphone button (should show listening state)
3. Speak clearly into microphone
4. Verify transcription appears in chat input
5. Check backend logs for successful API calls

## Future Enhancements

### Potential Improvements:
1. **Multiple STT Providers**: Support for different STT services
2. **Audio Format Options**: Support for different audio formats beyond WAV
3. **Streaming STT**: Real-time streaming transcription during speech
4. **Language Detection**: Automatic language detection from audio
5. **Confidence Scores**: Display transcription confidence levels
6. **Custom Models**: Support for custom-trained STT models

### Performance Optimizations:
1. **Audio Compression**: Compress audio before sending to API
2. **Connection Pooling**: Reuse HTTP connections for multiple requests
3. **Chunked Processing**: Send audio in smaller chunks for faster response
4. **Caching**: Cache common phrases or vocabulary

## Troubleshooting

### Common Issues:

1. **No Audio Transcription**:
   - Check `stt_enabled` setting
   - Verify microphone permissions
   - Test STT API accessibility
   - Check browser console for errors

2. **API Connection Errors**:
   - Verify STT service is running
   - Check network connectivity to API
   - Validate API endpoint URL
   - Review backend error logs

3. **Poor Transcription Quality**:
   - Verify correct model configuration
   - Check language setting matches spoken language
   - Test audio quality and microphone settings
   - Adjust silence threshold if needed

## Files Created/Modified Summary

| File | Type | Purpose |
|------|------|---------|
| `python/helpers/settings.py` | Modified | Added STT API configuration fields |
| `python/api/transcribe.py` | Modified | Replaced Whisper with OpenAI-compatible API calls |
| `webui/js/speech.js` | Modified | Updated settings object and added enable check |
| `STT_IMPLEMENTATION_GUIDE.md` | Created | This documentation file |

This implementation successfully replaces local Whisper STT with an external OpenAI-compatible service while maintaining all existing audio processing functionality and user experience.