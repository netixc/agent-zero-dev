import { updateChatInput, sendMessage } from "../index.js";

const microphoneButton = document.getElementById("microphone-button");
let microphoneInput = null;
let isProcessingClick = false;

const Status = {
  INACTIVE: "inactive",
  ACTIVATING: "activating",
  LISTENING: "listening",
  RECORDING: "recording",
  WAITING: "waiting",
  PROCESSING: "processing",
};

const micSettings = {
  stt_enabled: true,
  stt_url: "", // Will be loaded from backend settings
  stt_model: "", // Will be loaded from backend settings
  stt_language: "en",
  stt_silence_threshold: 0.05,
  stt_silence_duration: 1000,
  stt_waiting_timeout: 2000,
};
window.micSettings = micSettings;
loadMicSettings();

function densify(x) {
  return Math.exp(-5 * (1 - x));
}

async function loadMicSettings() {
  try {
    if (!window.fetchApi) {
      console.warn("fetchApi not available, skipping mic settings load");
      return;
    }
    
    const response = await window.fetchApi("/settings_get", {
      method: "POST",
    });
    const data = await response.json();
    const sttSettings = data.settings.sections.find(
      (s) => s.title === "Speech to Text"
    );

    if (sttSettings) {
      // Update options from server settings
      sttSettings.fields.forEach((field) => {
        const key = field.id; //.split('.')[1]; // speech_to_text.model_size -> model_size
        micSettings[key] = field.value;
      });
    }
  } catch (error) {
    if (window.toastFetchError) {
      window.toastFetchError("Failed to load speech settings", error);
    }
    console.error("Failed to load speech settings:", error);
  }
}

class MicrophoneInput {
  constructor(updateCallback, options = {}) {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.lastChunk = [];
    this.updateCallback = updateCallback;
    this.messageSent = false;

    // Audio analysis properties
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.analyserNode = null;
    this._status = Status.INACTIVE;

    // Timing properties
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

    // Update UI
    microphoneButton.classList.remove(`mic-${oldStatus.toLowerCase()}`);
    microphoneButton.classList.add(`mic-${newStatus.toLowerCase()}`);
    microphoneButton.setAttribute("data-status", newStatus);

    // Handle state-specific behaviors
    this.handleStatusChange(oldStatus, newStatus);
  }

  handleStatusChange(oldStatus, newStatus) {
    //last chunk kept only for transition to recording status
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
    // Don't stop recording during waiting state
    this.waitingTimer = setTimeout(() => {
      if (this.status === Status.WAITING) {
        this.status = Status.PROCESSING;
      }
    }, micSettings.stt_waiting_timeout);
  }

  handleProcessingState() {
    this.stopRecording();
    this.process();
  }

  stopRecording() {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop();
      this.hasStartedRecording = false;
    }
  }

  async initialize() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
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
          console.log(
            "Audio chunk received, total chunks:",
            this.audioChunks.length
          );
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

      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const amplitude = (dataArray[i] - 128) / 128;
        sum += amplitude * amplitude;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      const now = Date.now();

      // Update status based on audio level
      if (rms > densify(micSettings.stt_silence_threshold)) {
        this.lastAudioTime = now;
        this.silenceStartTime = null;

        if (
          this.status === Status.LISTENING ||
          this.status === Status.WAITING
        ) {
          if (!speech.isSpeaking())
            // TODO? a better way to ignore agent's voice?
            this.status = Status.RECORDING;
        }
      } else if (this.status === Status.RECORDING) {
        if (!this.silenceStartTime) {
          this.silenceStartTime = now;
        }

        const silenceDuration = now - this.silenceStartTime;
        if (silenceDuration >= micSettings.stt_silence_duration) {
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

  async process() {
    if (this.audioChunks.length === 0) {
      this.status = Status.LISTENING;
      return;
    }

    const audioBlob = new Blob(this.audioChunks, { type: "audio/wav" });
    const base64 = await this.convertBlobToBase64Wav(audioBlob);

    try {
      const result = await sendJsonData("/transcribe", { audio: base64 });

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

      // Read the Blob as a Data URL
      reader.onloadend = () => {
        const base64Data = reader.result.split(",")[1]; // Extract Base64 data
        resolve(base64Data);
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsDataURL(audioBlob); // Start reading the Blob
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
}

// Initialize and handle click events
async function initializeMicrophoneInput() {
  window.microphoneInput = microphoneInput = new MicrophoneInput(
    async (text, isFinal) => {
      if (isFinal) {
        updateChatInput(text);
        if (!microphoneInput.messageSent) {
          microphoneInput.messageSent = true;
          await sendMessage();
        }
      }
    }
  );
  microphoneInput.status = Status.ACTIVATING;

  return await microphoneInput.initialize();
}

microphoneButton.addEventListener("click", async () => {
  if (isProcessingClick) return;
  isProcessingClick = true;

  // Enable audio on user interaction
  await speech.enableAudio();

  // Check if STT is enabled
  if (!micSettings.stt_enabled) {
    if (window.toast) {
      window.toast("Speech-to-text is disabled in settings", "warning");
    }
    isProcessingClick = false;
    return;
  }

  const hasPermission = await requestMicrophonePermission();
  if (!hasPermission) return;

  try {
    if (!microphoneInput && !(await initializeMicrophoneInput())) {
      return;
    }

    // Simply toggle between INACTIVE and LISTENING states
    microphoneInput.status =
      microphoneInput.status === Status.INACTIVE ||
      microphoneInput.status === Status.ACTIVATING
        ? Status.LISTENING
        : Status.INACTIVE;
  } finally {
    setTimeout(() => {
      isProcessingClick = false;
    }, 300);
  }
});

// Some error handling for microphone input
async function requestMicrophonePermission() {
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

class Speech {
  constructor() {
    this.currentAudio = null;
    this.audioEnabled = false;
    this.ttsConfig = {
      enabled: true,
      url: "", // Will be loaded from backend settings
      model: "", // Will be loaded from backend settings
      voice: "", // Will be loaded from backend settings
      speed: 1.0
    };
    this.settingsLoaded = false;
    // Delay settings loading to ensure proper initialization
    this.initializeSettings();
  }

  async initializeSettings() {
    // Wait for proper API initialization
    let attempts = 0;
    const maxAttempts = 20;
    
    while (attempts < maxAttempts && !window.fetchApi) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (window.fetchApi) {
      await this.loadTtsSettings();
      this.settingsLoaded = true;
    } else {
      console.warn("Failed to initialize TTS settings - API not available");
    }
  }

  stripEmojis(str) {
    return str
      .replace(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  async loadTtsSettings() {
    try {
      if (!window.fetchApi) {
        console.warn("fetchApi not available, skipping TTS settings load");
        return;
      }
      
      const response = await window.fetchApi("/settings_get", {
        method: "POST",
      });
      const data = await response.json();
      const ttsSettings = data.settings.sections.find(
        (s) => s.title === "Text to Speech"
      );

      if (ttsSettings) {
        // Update TTS config from server settings
        ttsSettings.fields.forEach((field) => {
          const key = field.id.replace('tts_', ''); // tts_enabled -> enabled
          if (key in this.ttsConfig) {
            this.ttsConfig[key] = field.value;
          }
        });
        console.log("TTS settings loaded:", this.ttsConfig);
      }
    } catch (error) {
      console.error("Failed to load TTS settings:", error);
    }
  }

  async enableAudio() {
    if (this.audioEnabled) return;
    
    try {
      // Create a silent audio to enable autoplay - using a minimal MP3
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start();
      
      this.audioEnabled = true;
      console.log("Audio autoplay enabled via AudioContext");
    } catch (error) {
      console.log("Could not enable audio autoplay:", error);
      // Fallback: still mark as enabled so TTS can attempt to work
      this.audioEnabled = true;
    }
  }

  async speak(text) {
    console.log("Speaking:", text);
    
    // Wait for settings to load if they haven't yet
    if (!this.settingsLoaded) {
      await this.loadTtsSettings();
      this.settingsLoaded = true;
    }
    
    // Check if TTS is enabled
    if (!this.ttsConfig.enabled) {
      console.log("TTS is disabled");
      return;
    }
    
    // Validate text content
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log("TTS: No valid text to speak");
      return;
    }
    
    // Stop any current utterance
    this.stop();

    // Remove emojis and prepare text
    text = this.stripEmojis(text);
    text = this.replaceURLs(text);
    text = this.replaceGuids(text);
    
    // Final validation after processing
    if (!text || text.trim().length === 0) {
      console.log("TTS: Text became empty after processing");
      return;
    }

    try {
      console.log("TTS: Making request via backend proxy with text:", text);
      
      // Use backend proxy to avoid HTTPS/HTTP mixed content issues
      const fetchFunction = window.fetchApi || fetch;
      const response = await fetchFunction("/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: text
        })
      });

      console.log("TTS: Response status:", response.status, "Content-Type:", response.headers.get('content-type'));

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS API error: ${response.status} - ${errorText}`);
      }

      // Get audio data
      const audioBlob = await response.blob();
      console.log("TTS: Audio blob size:", audioBlob.size, "type:", audioBlob.type);
      
      if (audioBlob.size === 0) {
        throw new Error("TTS API returned empty audio data");
      }
      
      const audioUrl = URL.createObjectURL(audioBlob);
      console.log("TTS: Created audio URL:", audioUrl);

      // Create and play audio
      this.currentAudio = new Audio(audioUrl);
      
      this.currentAudio.onloadedmetadata = () => {
        console.log("TTS: Audio loaded successfully, duration:", this.currentAudio.duration);
      };
      
      this.currentAudio.onerror = (e) => {
        console.error("TTS: Audio error:", e);
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };
      
      this.currentAudio.onended = () => {
        console.log("TTS: Audio playback finished");
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
      };
      
      console.log("TTS: Starting audio playback");
      await this.currentAudio.play();
    } catch (error) {
      console.error("TTS error:", error);
      if (window.toast) {
        window.toast("Failed to generate speech: " + error.message, "error");
      }
    }
  }

  replaceURLs(text) {
    const urlRegex =
      /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\b(www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\b[-A-Z0-9+&@#\/%?=~_|!:,.;]*\.(?:[A-Z]{2,})[-A-Z0-9+&@#\/%?=~_|])/gi;
    return text.replace(urlRegex, (url) => {
      let text = url;
      // if contains ://, split by it
      if (text.includes("://")) text = text.split("://")[1];
      // if contains /, split by it
      if (text.includes("/")) text = text.split("/")[0];

      // if contains ., split by it
      if (text.includes(".")) {
        const doms = text.split(".");
        //up to last two
        return doms[doms.length - 2] + "." + doms[doms.length - 1];
      } else {
        return text;
      }
    });
  }

  replaceGuids(text) {
    const guidRegex =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    return text.replace(guidRegex, "");
  }

  replaceNonText(text) {
    const nonTextRegex = /\w[^\w\s]*\w(?=\s|$)|[^\w\s]+/g;
    text = text.replace(nonTextRegex, (match) => {
      return ``;
    });
    const longStringRegex = /\S{25,}/g;
    text = text.replace(longStringRegex, (match) => {
      return ``;
    });
    return text;
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  isSpeaking() {
    return this.currentAudio && !this.currentAudio.paused && !this.currentAudio.ended;
  }
}

export const speech = new Speech();
window.speech = speech;

// Add event listener for settings changes
document.addEventListener("settings-updated", () => {
  loadMicSettings();
  speech.loadTtsSettings();
});

// Also try to load settings when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Wait a bit for API to be ready
  setTimeout(() => {
    loadMicSettings();
    speech.loadTtsSettings();
  }, 2000);
});
