

# AI Desktop Agent

An autonomous desktop AI agent capable of understanding computer interfaces and performing tasks through natural language instructions.

The system captures the current screen, sends the visual context to the Gemini model on Google Cloud for reasoning, and determines the next action required to achieve the user’s objective. Based on the model’s response, the agent interacts with the computer by controlling mouse and keyboard actions.

## Features

- Natural language task execution
- Visual UI understanding through screen perception
- Gemini-powered reasoning
- Autonomous navigation of desktop interfaces
- Ability to handle interruptions such as pop-ups or notifications
- Continuous perception–reasoning–action loop

## Architecture

The system follows a perception–reasoning–action workflow:

1. The user provides a natural language instruction.
2. The system captures the screen as visual context.
3. The screenshot is sent to the Gemini model for analysis.
4. Gemini determines the next action required.
5. The backend executes the action on the system.
6. The loop continues until the objective is completed.

## Tech Stack

Frontend:
- TypeScript
- React

Backend:
- Python

AI:
- Google Gemini API
- Google AI Studio

Automation:
- PyAutoGUI

## Run Locally

This contains everything you need to run the app locally.

**Prerequisites:** Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
