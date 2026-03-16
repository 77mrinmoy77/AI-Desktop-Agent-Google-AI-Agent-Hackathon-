# AI Desktop Agent (Electron + Python Bridge)

This is a fully functional local version of the AI Agent that can actually control your mouse and keyboard using Python's `pyautogui` library, wrapped in an Electron UI.

## Why a local app?
Web browsers run in a secure sandbox and cannot physically move your mouse or click outside of their own window. To achieve true desktop automation, we need a native application.

This setup uses:
1. **Python (`pyautogui`)** to take screenshots and physically move your mouse.
2. **Electron** to provide the user interface.
3. **Gemini 3.1 Pro** to analyze the screen and determine the exact coordinates to click.

---

## Setup Instructions

### Prerequisites
1. **Node.js** installed on your machine.
2. **Python 3.10+** installed on your machine.

### 1. Install Python Dependencies
Open your terminal in this directory (`desktop-app`) and run:
```bash
pip install -r requirements.txt
```

### 2. Set your Gemini API Key
You must provide your Gemini API key as an environment variable so the Python script can access it.

**On Windows (Command Prompt):**
```cmd
set GEMINI_API_KEY=your_api_key_here
```

**On Mac/Linux (Terminal):**
```bash
export GEMINI_API_KEY=your_api_key_here
```

### 3. Install Node Dependencies
```bash
npm install
```

### 4. Run the App
```bash
npm start
```

---

## How it works
1. When you run `npm start`, Electron launches the UI and automatically starts the `agent.py` Flask server in the background.
2. You type a command (e.g., "Open the fibonacci heap video") and click Execute.
3. The Python backend takes a screenshot of your primary monitor using `pyautogui.screenshot()`.
4. It sends the screenshot and your command to the Gemini API.
5. Gemini returns the normalized coordinates (0 to 1000) of the target element.
6. Python maps those coordinates to your actual screen resolution and uses `pyautogui.moveTo()` and `pyautogui.click()` to physically execute the action!

## Troubleshooting
* **Mac Users:** You will need to grant your Terminal/IDE "Screen Recording" and "Accessibility" permissions in System Settings -> Privacy & Security for `pyautogui` to work.
* **Connection Error:** Ensure the Python server started successfully. Check the terminal output for any Python errors.
