import os
import base64
import io
import json
import time
import ctypes
import pyautogui
from flask import Flask, request, jsonify
from google import genai
from google.genai import types

# DPI Awareness for accurate clicking on high-res screens
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
    scale_factor = ctypes.windll.shcore.GetScaleFactorForDevice(0) / 100
except:
    scale_factor = 1.0

app = Flask(__name__)

# Initialize Gemini Client
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def capture_screen():
    """Captures and prepares screenshot for Gemini"""
    screenshot = pyautogui.screenshot()
    screenshot.thumbnail((1920, 1080))
    buffered = io.BytesIO()
    screenshot.save(buffered, format="JPEG", quality=80)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

@app.route('/execute', methods=['POST'])
def execute_command():
    data = request.json
    main_objective = data.get('command')
    
    if not main_objective:
        return jsonify({"error": "No command provided"}), 400
        
    history = []
    max_steps = 15 # Allows for complex sequences like YouTube navigation
    
    try:
        for step in range(max_steps):
            img_str = capture_screen()
            
            # Advanced Prompt with History Tracking
            prompt = f"""
            OBJECTIVE: {main_objective}
            CURRENT STEP: {step + 1}
            ACTION HISTORY: {json.dumps(history[-3:])}

            Analyze the screen. If the objective is NOT met, provide the NEXT single UI action.
            If the objective is reached (e.g. video is playing), respond with "status": "FINISHED".

            Return ONLY JSON:
            {{
                "status": "OK" | "FINISHED" | "BLOCKED",
                "action": "click" | "double_click" | "type" | "scroll",
                "reasoning": "Explain what you see and why this step is next",
                "coordinates": {{"x": 0-1000, "y": 0-1000}},
                "text": "text to type",
                "press_enter": true/false
            }}
            """

            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    types.Part.from_bytes(data=base64.b64decode(img_str), mime_type='image/jpeg'),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    system_instruction="You are an autonomous OS agent. You use visual cues to navigate the desktop."
                )
            )

            res = json.loads(response.text)
            
            if res.get('status') == 'FINISHED':
                return jsonify({"status": "SUCCESS", "message": "Objective achieved", "history": history})

            if res.get('status') == 'OK':
                coords = res.get('coordinates')
                screen_w, screen_h = pyautogui.size()
                
                # Math adjusted for scaling
                tx = int((coords['x'] / 1000) * screen_w)
                ty = int((coords['y'] / 1000) * screen_h)
                
                # 1. Physical Movement
                pyautogui.moveTo(tx, ty, duration=0.4)
                
                # 2. Advanced Action Execution
                if res['action'] == 'double_click':
                    pyautogui.doubleClick()
                elif res['action'] == 'type':
                    # Click to focus first
                    pyautogui.click()
                    time.sleep(0.5)
                    # Select all and delete to clear existing URLs/text
                    pyautogui.hotkey('ctrl', 'a')
                    pyautogui.press('backspace')
                    # Type the new text
                    pyautogui.write(res.get('text', ''), interval=0.04)
                    if res.get('press_enter', True):
                        pyautogui.press('enter')
                else:
                    pyautogui.click()

                history.append(res.get('reasoning'))
                
                # 3. Wait for UI to stabilize before next loop
                time.sleep(2.5) 

        return jsonify({"status": "TIMEOUT", "message": "Failed to reach goal in max steps"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)