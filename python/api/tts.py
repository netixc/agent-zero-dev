from python.helpers.api import ApiHandler
from flask import Request, Response
import aiohttp
import json

from python.helpers import settings

class TTS(ApiHandler):
    async def process(self, input: dict, request: Request) -> dict | Response:
        text = input.get("text")
        ctxid = input.get("ctxid", "")

        context = self.get_context(ctxid)
        set = settings.get_settings()
        
        # Check if TTS is enabled
        if not set.get("tts_enabled", True):
            return Response("TTS is disabled", status=400, content_type="text/plain")
        
        try:
            # Call OpenAI-compatible TTS API
            async with aiohttp.ClientSession() as session:
                payload = {
                    "model": set.get("tts_model", "kokoro"),
                    "input": text,
                    "voice": set.get("tts_voice", "bm_daniel"),
                    "speed": set.get("tts_speed", 1.0)
                }
                
                async with session.post(
                    set.get("tts_url", "http://192.168.50.59:8880/v1/audio/speech"),
                    headers={"Content-Type": "application/json"},
                    data=json.dumps(payload)
                ) as response:
                    if response.status == 200:
                        # Get the audio content
                        audio_data = await response.read()
                        content_type = response.headers.get('content-type', 'audio/mpeg')
                        
                        # Return the audio data directly
                        return Response(
                            audio_data,
                            status=200,
                            content_type=content_type,
                            headers={
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                                'Access-Control-Allow-Headers': 'Content-Type'
                            }
                        )
                    else:
                        error_text = await response.text()
                        context.log.log(type="error", content=f"TTS API error: {response.status} - {error_text}")
                        return Response(f"TTS API error: {response.status}", status=response.status, content_type="text/plain")
                        
        except Exception as e:
            context.log.log(type="error", content=f"TTS proxy error: {str(e)}")
            return Response(f"TTS error: {str(e)}", status=500, content_type="text/plain")