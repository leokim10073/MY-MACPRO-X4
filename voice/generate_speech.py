from cartesia import Cartesia
from dotenv import load_dotenv
import os

load_dotenv()

client = Cartesia(api_key=os.getenv("CARTESIA_API_KEY"))

response = client.tts.generate(
    model_id="sonic-3.6",
    transcript="Hello from Cal Hacks!",
    voice="a0e99841-438c-4a64-b679-ae501e7d6091",
    output_format={"container": "wav", "encoding": "pcm_f32le", "sample_rate": 44100},
)
response.write_to_file("output.wav")