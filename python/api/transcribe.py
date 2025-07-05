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
                
                async with session.post(set.get("stt_url", "http://192.168.50.59:7000/v1/audio/transcriptions"), data=data) as response:
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
