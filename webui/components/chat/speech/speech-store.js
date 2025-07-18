import { createStore } from "/js/AlpineStore.js";
import { updateChatInput, sendMessage } from "/index.js";
import { sleep } from "/js/sleep.js";
import { store as microphoneSettingStore } from "/components/settings/speech/microphone-setting-store.js";

const Status = {
  INACTIVE: "inactive",
  ACTIVATING: "activating",
  LISTENING: "listening",
  RECORDING: "recording",
  WAITING: "waiting",
  PROCESSING: "processing",
};

// Create the speech store
const model = {
  // STT Settings
  stt_model_size: "tiny",
  stt_language: "en",
  stt_silence_threshold: 0.05,
  stt_silence_duration: 1000,
  stt_waiting_timeout: 2000,

  // TTS Settings
  tts_kokoro: true,

  // TTS State
  isSpeaking: false,
  speakingId: "",
  speakingText: "",
  currentAudio: null,
  audioContext: null,
  userHasInteracted: false,
  stopSpeechChain: false,
  ttsStream: null,
  audioCache: new Map(),
  maxCacheSize: 50,

  // STT State
  microphoneInput: null,
  isProcessingClick: false,
  selectedDevice: null,

  // Getter for micStatus - delegates to microphoneInput
  get micStatus() {
    return this.microphoneInput?.status || Status.INACTIVE;
  },

  updateMicrophoneButtonUI() {
    const microphoneButton = document.getElementById("microphone-button");
    if (!microphoneButton) return;
    const status = this.micStatus;
    microphoneButton.classList.remove(
      "mic-inactive",
      "mic-activating",
      "mic-listening",
      "mic-recording",
      "mic-waiting",
      "mic-processing"
    );
    microphoneButton.classList.add(`mic-${status.toLowerCase()}`);
    microphoneButton.setAttribute("data-status", status);
  },

  async handleMicrophoneClick() {
    if (this.isProcessingClick) return;
    this.isProcessingClick = true;
    try {

      // reset mic input if device has changed in settings
      const device = microphoneSettingStore.getSelectedDevice();
      if(device!=this.selectedDevice){
        this.selectedDevice = device;
        this.microphoneInput = null;
        console.log("Device changed, microphoneInput reset");
      }

      if (!this.microphoneInput) {
        await this.initMicrophone();
      }

      if (this.microphoneInput) {
        await this.microphoneInput.toggle();
      }
    } finally {
      setTimeout(() => {
        this.isProcessingClick = false;
      }, 300);
    }
  },

  // Initialize speech functionality
  async init() {
    console.log("Initializing speech store...");
    await this.loadSettings();
    this.setupBrowserTTS();
    this.setupUserInteractionHandling();
    console.log("Speech store initialized successfully");
  },

  // Load settings from server
  async loadSettings() {
    try {
      console.log("Loading speech settings...");
      if (typeof window.fetchApi !== 'function') {
        console.error("fetchApi is not available globally");
        return;
      }
      const response = await window.fetchApi("/settings_get", { method: "POST" });
      const data = await response.json();
      const speechSection = data.settings.sections.find(
        (s) => s.title === "Speech"
      );

      if (speechSection) {
        speechSection.fields.forEach((field) => {
          if (this.hasOwnProperty(field.id)) {
            this[field.id] = field.value;
          }
        });
        console.log("Speech settings loaded successfully");
      } else {
        console.warn("No speech section found in settings");
      }
    } catch (error) {
      console.error("Failed to load speech settings:", error);
      if (window.toastFetchError) {
        window.toastFetchError("Failed to load speech settings", error);
      }
    }
  },

  // Setup browser TTS
  setupBrowserTTS() {
    this.synth = window.speechSynthesis;
    this.browserUtterance = null;
  },

  // Setup user interaction handling for autoplay policy
  setupUserInteractionHandling() {
    const enableAudio = () => {
      if (!this.userHasInteracted) {
        this.userHasInteracted = true;
        console.log("User interaction detected - audio playback enabled");

        // Create a dummy audio context to "unlock" audio
        try {
          this.audioContext = new (window.AudioContext ||
            window.webkitAudioContext)();
          this.audioContext.resume();
        } catch (e) {
          console.log("AudioContext not available");
        }
      }
    };

    // Listen for any user interaction
    const events = ["click", "touchstart", "keydown", "mousedown", "scroll"];
    events.forEach((event) => {
      document.addEventListener(event, enableAudio, {
        once: true,
        passive: true,
      });
    });
    
    // Auto-enable if user already interacted (page reload)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(() => {
        if (!this.userHasInteracted) {
          this.userHasInteracted = true;
          console.log("Auto-enabling audio playback");
          try {
            this.audioContext = new (window.AudioContext ||
              window.webkitAudioContext)();
            this.audioContext.resume();
          } catch (e) {
            console.log("AudioContext not available");
          }
        }
      }, 1000);
    }
  },

  // main speak function, allows to speak a stream of text that is generated piece by piece
  async speakStream(id, text, finished = false) {
    console.log("speakStream called with:", { id, text: text.substring(0, 100) + "...", finished });

    // if already running the same stream with same text and finished state, do nothing
    if (
      this.ttsStream &&
      this.ttsStream.id === id &&
      this.ttsStream.text === text &&
      this.ttsStream.finished === finished
    ) {
      console.log("Stream unchanged, skipping");
      return;
    }

    // if user has not interacted (after reload), do not play audio
    if (!this.userHasInteracted) {
      console.log("User has not interacted, showing permission prompt");
      return this.showAudioPermissionPrompt();
    }

    // new stream
    if (!this.ttsStream || this.ttsStream.id !== id) {
      // this.stop(); // stop potential previous stream
      // create new stream data
      this.ttsStream = {
        id,
        text,
        finished,
        running: false,
        lastSpokenCharIndex: 0, // Track character position instead of chunk index
        stopped: false,
        spokenText: "", // Track what we've already spoken
        processing: false,
      };
    } else {
      // update existing stream data
      this.ttsStream.finished = finished;
      this.ttsStream.text = text;
    }

    // cleanup text
    const cleanText = this.cleanText(text);
    if (!cleanText.trim()) return;

    // Store the clean text
    this.ttsStream.cleanText = cleanText;

    // terminator function to kill the stream if new stream has started
    const terminator = () =>
      this.ttsStream?.id !== id || this.ttsStream?.stopped;

    // if stream was already running, we need to continue processing new chunks
    if (this.ttsStream.running) {
      console.log("Stream already running, processing new text...");
      // Don't return - let it fall through to process new chunks
    } else {
      this.ttsStream.running = true; // proceed to running phase
    }

    // Start processing chunks asynchronously only if not already processing
    if (!this.ttsStream.processing) {
      this.ttsStream.processing = true;
      this.processChunksAsync(id, terminator);
    }
  },

  // Process chunks asynchronously
  async processChunksAsync(streamId, terminator) {
    console.log(`Starting processChunksAsync for stream ${streamId}`);
    
    // Keep processing while this stream is active
    while (this.ttsStream && this.ttsStream.id === streamId && !terminator()) {
      const currentText = this.ttsStream.cleanText;
      const lastSpokenIndex = this.ttsStream.lastSpokenCharIndex;
      
      // Get unspoken text
      const unspokenText = currentText.substring(lastSpokenIndex);
      
      console.log(`Current position: ${lastSpokenIndex}/${currentText.length}, unspoken: ${unspokenText.length} chars`);
      
      if (unspokenText.length === 0) {
        // Nothing new to speak
        if (this.ttsStream.finished) {
          console.log("All text processed and stream finished");
          break;
        }
        // Wait for more text
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
      
      // Find a good chunk to speak from the unspoken text
      let chunkToSpeak = "";
      let chunkEndIndex = lastSpokenIndex;
      
      // Look for sentence boundaries in the unspoken text
      const sentenceMatch = unspokenText.match(/^[^.!?]+[.!?]+\s*/);
      
      if (sentenceMatch) {
        // Found a complete sentence
        chunkToSpeak = sentenceMatch[0].trim();
        chunkEndIndex = lastSpokenIndex + sentenceMatch[0].length;
      } else if (this.ttsStream.finished) {
        // Stream is finished, speak whatever is left
        chunkToSpeak = unspokenText.trim();
        chunkEndIndex = currentText.length;
      } else if (unspokenText.length > 90) {
        // Text is getting long, find a good break point
        // Try to break at punctuation or space
        let breakPoint = 90;
        
        // Look for punctuation
        const punctMatch = unspokenText.substring(0, 90).match(/.*[,;:]\s*/);
        if (punctMatch) {
          breakPoint = punctMatch[0].length;
        } else {
          // Look for last space before 90 chars
          const lastSpace = unspokenText.substring(0, 90).lastIndexOf(' ');
          if (lastSpace > 50) {
            breakPoint = lastSpace + 1;
          }
        }
        
        chunkToSpeak = unspokenText.substring(0, breakPoint).trim();
        chunkEndIndex = lastSpokenIndex + breakPoint;
      } else if (unspokenText.length < 10 && !this.ttsStream.finished) {
        // Too short and more text might come, wait
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
      
      if (chunkToSpeak) {
        console.log(`Speaking text from ${lastSpokenIndex} to ${chunkEndIndex}: "${chunkToSpeak.substring(0, 50)}..."`);
        
        // Update position BEFORE speaking to prevent re-speaking
        this.ttsStream.lastSpokenCharIndex = chunkEndIndex;
        this.ttsStream.spokenText += chunkToSpeak + " ";
        
        try {
          // Speak the chunk and wait for it to complete
          await this._speak(chunkToSpeak, true, () => terminator());
          console.log(`Completed speaking chunk`);
        } catch (error) {
          console.error(`Error speaking chunk:`, error);
          // Continue to next chunk even if this one failed
        }
        
        // Check if we should stop
        if (terminator()) {
          console.log("Terminator triggered, stopping");
          break;
        }
      }
      
      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    // Mark stream as not running
    if (this.ttsStream && this.ttsStream.id === streamId) {
      this.ttsStream.running = false;
      this.ttsStream.processing = false;
      console.log("Stream processing completed");
    }
  },


  // simplified speak function, speak a single finished piece of text
  async speak(text) {
    const id = Math.random();
    return await this.speakStream(id, text, true);
  },

  // speak wrapper
  async _speak(text, waitForPrevious, terminator) {
    console.log("_speak called with tts_kokoro:", this.tts_kokoro);
    
    // default browser speech
    if (!this.tts_kokoro) {
      console.log("Using browser TTS");
      return await this.speakWithBrowser(text, waitForPrevious, terminator);
    }

    // kokoro tts
    try {
      console.log("Attempting Kokoro TTS");
      await this.speakWithKokoro(text, waitForPrevious, terminator);
    } catch (error) {
      console.error("Kokoro TTS failed, falling back to browser TTS:", error);
      return await this.speakWithBrowser(text, waitForPrevious, terminator);
    }
  },

  chunkText(text, { maxChunkLength = 90, lineSeparator = "..." } = {}) {
    const chunks = [];
    
    // Simple sentence-based chunking for streaming
    // Split by sentence endings followed by space
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    
    let currentChunk = "";
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      // If adding this sentence would exceed max length, flush current chunk
      if (currentChunk && (currentChunk.length + trimmedSentence.length + 1) > maxChunkLength) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence;
      } else {
        // Add sentence to current chunk
        currentChunk += (currentChunk ? " " : "") + trimmedSentence;
      }
      
      // If current chunk is getting close to max length, flush it
      if (currentChunk.length >= maxChunkLength * 0.8) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    console.log(`Chunked text into ${chunks.length} chunks:`, chunks.map(c => c.substring(0, 30) + "..."));
    
    return chunks;
  },

  // Show a prompt to user to enable audio
  showAudioPermissionPrompt() {
    console.log("Showing audio permission prompt");
    if (window.toast) {
      window.toast("Click anywhere to enable audio playback", "info", 5000);
    } else {
      console.log("Please click anywhere on the page to enable audio playback");
    }
  },

  // Browser TTS with optimized streaming
  async speakWithBrowser(text, waitForPrevious = false, terminator = null) {
    console.log("speakWithBrowser called with text:", text.substring(0, 100) + "...");
    
    // wait for previous to finish if requested
    while (waitForPrevious && this.isSpeaking) {
      await sleep(10); // Reduced sleep for faster response
      if (terminator && terminator()) return;
    }

    // stop previous if any
    this.stopAudio();

    if (!this.synth) {
      console.error("Speech synthesis not available");
      return;
    }

    this.browserUtterance = new SpeechSynthesisUtterance(text);
    this.browserUtterance.rate = 1.1; // Slightly faster rate for responsiveness
    this.browserUtterance.onstart = () => {
      console.log("Browser TTS started");
      this.isSpeaking = true;
    };
    this.browserUtterance.onend = () => {
      console.log("Browser TTS ended");
      this.isSpeaking = false;
    };
    this.browserUtterance.onerror = (event) => {
      console.error("Browser TTS error:", event);
      this.isSpeaking = false;
    };
    
    console.log("Starting browser TTS with utterance:", this.browserUtterance);
    this.synth.speak(this.browserUtterance);
  },

  // Kokoro TTS with enhanced streaming and caching
  async speakWithKokoro(text, waitForPrevious = false, terminator = null) {
    console.log(`speakWithKokoro called with text: "${text.substring(0, 50)}..."`);
    
    try {
      // Check cache first for faster playback
      const cacheKey = `kokoro_${text}`;
      let response = this.audioCache.get(cacheKey);
      
      if (!response) {
        // Start synthesis immediately without waiting
        if (typeof window.sendJsonData !== 'function') {
          throw new Error("sendJsonData is not available globally");
        }
        console.log("Synthesizing audio for text chunk...");
        const synthesisPromise = window.sendJsonData("/synthesize", { text });
        response = await synthesisPromise;
        
        // Cache the result for future use
        if (response.success) {
          this.audioCache.set(cacheKey, response);
          // Maintain cache size limit
          if (this.audioCache.size > this.maxCacheSize) {
            const firstKey = this.audioCache.keys().next().value;
            this.audioCache.delete(firstKey);
          }
        }
      } else {
        console.log("Using cached audio for text chunk");
      }

      // wait for previous to finish if requested
      while (waitForPrevious && this.isSpeaking) {
        await sleep(10); // Reduced sleep for faster response
        if (terminator && terminator()) return;
      }

      if (terminator && terminator()) return;

      // stop previous if any
      this.stopAudio();

      if (response.success) {
        if (response.audio_parts) {
          // Multiple chunks - play sequentially with minimal delay
          console.log(`Playing ${response.audio_parts.length} audio parts`);
          for (let i = 0; i < response.audio_parts.length; i++) {
            if (terminator && terminator()) {
              console.log("Terminator triggered during audio parts playback");
              return;
            }
            console.log(`Playing audio part ${i + 1}/${response.audio_parts.length}`);
            await this.playAudio(response.audio_parts[i]);
            
            // Only add delay between parts, not after the last one
            if (i < response.audio_parts.length - 1) {
              await sleep(50); // Reduced pause for faster streaming
            }
          }
        } else if (response.audio) {
          // Single audio
          console.log("Playing single audio response");
          await this.playAudio(response.audio);
        }
        console.log("Audio playback completed for chunk");
      } else {
        throw new Error(`Kokoro TTS failed: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Kokoro TTS error:", error);
      throw error;
    }
  },

  // Play base64 audio
  async playAudio(base64Audio) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      let playStarted = false;

      audio.onplay = () => {
        playStarted = true;
        this.isSpeaking = true;
        console.log("Audio playback started");
      };
      
      audio.onended = () => {
        this.isSpeaking = false;
        this.currentAudio = null;
        console.log("Audio playback ended");
        resolve();
      };
      
      audio.onerror = (error) => {
        this.isSpeaking = false;
        this.currentAudio = null;
        console.error("Audio playback error:", error);
        reject(error);
      };
      
      // Also handle abort event
      audio.onabort = () => {
        this.isSpeaking = false;
        this.currentAudio = null;
        console.log("Audio playback aborted");
        resolve();
      };

      audio.src = `data:audio/wav;base64,${base64Audio}`;
      this.currentAudio = audio;

      audio.play().then(() => {
        // If play() resolves but audio hasn't actually started playing,
        // we need to wait for it
        if (!playStarted) {
          // Give it a moment to start
          setTimeout(() => {
            if (!playStarted && !this.isSpeaking) {
              console.warn("Audio play() resolved but playback didn't start");
              resolve();
            }
          }, 100);
        }
      }).catch((error) => {
        this.isSpeaking = false;
        this.currentAudio = null;

        if (error.name === "NotAllowedError") {
          this.showAudioPermissionPrompt();
          this.userHasInteracted = false;
        }
        reject(error);
      });
    });
  },

  // Stop current speech chain
  stop() {
    this.stopAudio(); // stop current audio immediately
    if (this.ttsStream) this.ttsStream.stopped = true; // set stop on current stream
  },

  // Stop current speech audio
  stopAudio() {
    if (this.synth?.speaking) {
      this.synth.cancel();
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    this.isSpeaking = false;
  },

  // Clean text for TTS
  cleanText(text) {
    // kokoro can have trouble speaking short list items, so we group them them
    text = joinShortMarkdownLists(text);
    // Remove code blocks: ```...```
    text = text.replace(/```[\s\S]*?```/g, "");
    // Remove inline code ticks: `...`
    text = text.replace(/`([^`]*)`/g, "$1"); // remove backticks but keep content

    // Remove HTML tags and their content: <tag>content</tag>
    text = text.replace(/<[a-zA-Z][a-zA-Z0-9]*>.*?<\/[a-zA-Z][a-zA-Z0-9]*>/gs, "");
    
    // Remove self-closing HTML tags: <tag/>
    text = text.replace(/<[a-zA-Z][a-zA-Z0-9]*(\/| [^>]*\/>)/g, "");

    // Remove markdown links: [label](url) → label
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

    // Remove markdown formatting: *, _, #
    text = text.replace(/[*_#]+/g, "");

    // Remove tables (basic): lines with |...|
    text = text.replace(/\|[^\n]*\|/g, "");

    // Remove emojis and private unicode blocks
    text = text.replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ""
    );

    // Replace URLs with just the domain name
    text = text.replace(/https?:\/\/[^\s]+/g, (match) => {
      try {
        return new URL(match).hostname;
      } catch {
        return "";
      }
    });

    // kokoro can have trouble speaking short list items, so we group them them
    function joinShortMarkdownLists(txt, minItemLength = 40) {
      const lines = txt.split(/\r?\n/);
      const newLines = [];
      let buffer = [];
      const isShortList = (line) =>
        /^\s*-\s+/.test(line) && line.trim().length < minItemLength;
      for (let i = 0; i < lines.length; i++) {
        if (isShortList(lines[i])) {
          buffer.push(lines[i].replace(/^\s*-\s+/, "").trim());
        } else {
          if (buffer.length > 1) {
            newLines.push(buffer.join(", "));
            buffer = [];
          } else if (buffer.length === 1) {
            newLines.push(buffer[0]);
            buffer = [];
          }
          newLines.push(lines[i]);
        }
      }
      if (buffer.length > 1) {
        newLines.push(buffer.join(", "));
      } else if (buffer.length === 1) {
        newLines.push(buffer[0]);
      }
      return newLines.join("\n");
    }

    // Remove email addresses
    // text = text.replace(/\S+@\S+/g, "");

    // Replace UUIDs with 'UUID'
    text = text.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      "UUID"
    );

    // Collapse multiple spaces/tabs to a single space, but preserve newlines
    text = text.replace(/[ \t]+/g, " ");

    // Trim leading/trailing whitespace
    text = text.trim();

    return text;
  },

  // Initialize microphone input
  async initMicrophone() {
    if (this.microphoneInput) return this.microphoneInput;

    this.microphoneInput = new MicrophoneInput(async (text, isFinal) => {
      if (isFinal) {
        this.sendMessage(text);
      }
    });

    const initialized = await this.microphoneInput.initialize();
    return initialized ? this.microphoneInput : null;
  },

  async sendMessage(text) {
    text = "(voice) " + text;
    updateChatInput(text);
    if (!this.microphoneInput.messageSent) {
      this.microphoneInput.messageSent = true;
      await sendMessage();
    }
  },

  // Request microphone permission - delegate to MicrophoneInput
  async requestMicrophonePermission() {
    return this.microphoneInput
      ? this.microphoneInput.requestPermission()
      : MicrophoneInput.prototype.requestPermission.call(null);
  },
};

// Microphone Input Class (simplified for store integration)
class MicrophoneInput {
  constructor(updateCallback) {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.lastChunk = [];
    this.updateCallback = updateCallback;
    this.messageSent = false;
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.analyserNode = null;
    this._status = Status.INACTIVE;
    this.lastAudioTime = null;
    this.waitingTimer = null;
    this.silenceStartTime = null;
    this.hasStartedRecording = false;
    this.analysisFrame = null;
  }

  get status() {
    return this._status;
  }

  set status(newStatus) {
    if (this._status === newStatus) return;

    const oldStatus = this._status;
    this._status = newStatus;
    console.log(`Mic status changed from ${oldStatus} to ${newStatus}`);

    this.handleStatusChange(oldStatus, newStatus);
  }

  async initialize() {
    // Set status to activating at the start of initialization
    this.status = Status.ACTIVATING;
    try {
      // get selected device from microphone settings
      const selectedDevice = microphoneSettingStore.getSelectedDevice();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDevice && selectedDevice.deviceId ? { exact: selectedDevice.deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });

      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (
          event.data.size > 0 &&
          (this.status === Status.RECORDING || this.status === Status.WAITING)
        ) {
          if (this.lastChunk) {
            this.audioChunks.push(this.lastChunk);
            this.lastChunk = null;
          }
          this.audioChunks.push(event.data);
        } else if (this.status === Status.LISTENING) {
          this.lastChunk = event.data;
        }
      };

      this.setupAudioAnalysis(stream);
      return true;
    } catch (error) {
      console.error("Microphone initialization error:", error);
      toast("Failed to access microphone. Please check permissions.", "error");
      return false;
    }
  }

  handleStatusChange(oldStatus, newStatus) {
    if (newStatus != Status.RECORDING) {
      this.lastChunk = null;
    }

    switch (newStatus) {
      case Status.INACTIVE:
        this.handleInactiveState();
        break;
      case Status.LISTENING:
        this.handleListeningState();
        break;
      case Status.RECORDING:
        this.handleRecordingState();
        break;
      case Status.WAITING:
        this.handleWaitingState();
        break;
      case Status.PROCESSING:
        this.handleProcessingState();
        break;
    }
  }

  handleInactiveState() {
    this.stopRecording();
    this.stopAudioAnalysis();
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = null;
    }
  }

  handleListeningState() {
    this.stopRecording();
    this.audioChunks = [];
    this.hasStartedRecording = false;
    this.silenceStartTime = null;
    this.lastAudioTime = null;
    this.messageSent = false;
    this.startAudioAnalysis();
  }

  handleRecordingState() {
    if (!this.hasStartedRecording && this.mediaRecorder.state !== "recording") {
      this.hasStartedRecording = true;
      this.mediaRecorder.start(1000);
      console.log("Speech started");
    }
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = null;
    }
  }

  handleWaitingState() {
    this.waitingTimer = setTimeout(() => {
      if (this.status === Status.WAITING) {
        this.status = Status.PROCESSING;
      }
    }, store.stt_waiting_timeout);
  }

  handleProcessingState() {
    this.stopRecording();
    this.process();
  }

  setupAudioAnalysis(stream) {
    this.audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.minDecibels = -90;
    this.analyserNode.maxDecibels = -10;
    this.analyserNode.smoothingTimeConstant = 0.85;
    this.mediaStreamSource.connect(this.analyserNode);
  }

  startAudioAnalysis() {
    const analyzeFrame = () => {
      if (this.status === Status.INACTIVE) return;

      const dataArray = new Uint8Array(this.analyserNode.fftSize);
      this.analyserNode.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const amplitude = (dataArray[i] - 128) / 128;
        sum += amplitude * amplitude;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const now = Date.now();

      // Update status based on audio level (ignore if TTS is speaking)
      if (rms > this.densify(store.stt_silence_threshold)) {
        this.lastAudioTime = now;
        this.silenceStartTime = null;

        if (
          (this.status === Status.LISTENING ||
            this.status === Status.WAITING) &&
          !store.isSpeaking
        ) {
          this.status = Status.RECORDING;
        }
      } else if (this.status === Status.RECORDING) {
        if (!this.silenceStartTime) {
          this.silenceStartTime = now;
        }

        const silenceDuration = now - this.silenceStartTime;
        if (silenceDuration >= store.stt_silence_duration) {
          this.status = Status.WAITING;
        }
      }

      this.analysisFrame = requestAnimationFrame(analyzeFrame);
    };

    this.analysisFrame = requestAnimationFrame(analyzeFrame);
  }

  stopAudioAnalysis() {
    if (this.analysisFrame) {
      cancelAnimationFrame(this.analysisFrame);
      this.analysisFrame = null;
    }
  }

  stopRecording() {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop();
      this.hasStartedRecording = false;
    }
  }

  densify(x) {
    return Math.exp(-5 * (1 - x));
  }

  async process() {
    if (this.audioChunks.length === 0) {
      this.status = Status.LISTENING;
      return;
    }

    const audioBlob = new Blob(this.audioChunks, { type: "audio/wav" });
    const base64 = await this.convertBlobToBase64Wav(audioBlob);

    try {
      if (typeof window.sendJsonData !== 'function') {
        throw new Error("sendJsonData is not available globally");
      }
      const result = await window.sendJsonData("/transcribe", { audio: base64 });
      const text = this.filterResult(result.text || "");

      if (text) {
        console.log("Transcription:", result.text);
        await this.updateCallback(result.text, true);
      }
    } catch (error) {
      window.toastFetchError("Transcription error", error);
      console.error("Transcription error:", error);
    } finally {
      this.audioChunks = [];
      this.status = Status.LISTENING;
    }
  }

  convertBlobToBase64Wav(audioBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(audioBlob);
    });
  }

  filterResult(text) {
    text = text.trim();
    let ok = false;
    while (!ok) {
      if (!text) break;
      if (text[0] === "{" && text[text.length - 1] === "}") break;
      if (text[0] === "(" && text[text.length - 1] === ")") break;
      if (text[0] === "[" && text[text.length - 1] === "]") break;
      ok = true;
    }
    if (ok) return text;
    else console.log(`Discarding transcription: ${text}`);
  }

  // Toggle microphone between active and inactive states
  async toggle() {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    // Toggle between listening and inactive
    if (this.status === Status.INACTIVE || this.status === Status.ACTIVATING) {
      this.status = Status.LISTENING;
    } else {
      this.status = Status.INACTIVE;
    }
  }

  // Request microphone permission
  async requestPermission() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast(
        "Microphone access denied. Please enable microphone access in your browser settings.",
        "error"
      );
      return false;
    }
  }
}

export const store = createStore("speech", model);

// Initialize speech store
// window.speechStore = speechStore;

// Event listeners
document.addEventListener("settings-updated", () => store.loadSettings());
document.addEventListener("DOMContentLoaded", () => store.init());
