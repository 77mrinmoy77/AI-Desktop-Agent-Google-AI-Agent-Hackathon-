import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Play, Plus, Trash2, AlertCircle, CheckCircle2, X, Loader2, Monitor, Globe, TestTube, Mic, MicOff, MonitorUp, StopCircle, Send, MousePointer2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const AGENT_MODES = [
  { id: 'navigator', name: 'Web Navigator', icon: Globe, desc: 'Universal web navigation' },
  { id: 'automator', name: 'Workflow Automator', icon: Monitor, desc: 'Cross-app automation' },
  { id: 'qa', name: 'QA Testing Agent', icon: TestTube, desc: 'Visual validation' }
];

export default function App() {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [command, setCommand] = useState('');
  const [mode, setMode] = useState('navigator');
  const [previousActions, setPreviousActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoRect, setVideoRect] = useState({ width: 0, height: 0, left: 0, top: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const updateVideoRect = useCallback(() => {
    if (videoRef.current && containerRef.current) {
      const video = videoRef.current;
      const container = containerRef.current;
      
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      const containerRatio = container.clientWidth / container.clientHeight;
      const videoRatio = video.videoWidth / video.videoHeight;

      let width, height, left, top;

      if (containerRatio > videoRatio) {
        height = container.clientHeight;
        width = height * videoRatio;
        top = 0;
        left = (container.clientWidth - width) / 2;
      } else {
        width = container.clientWidth;
        height = width / videoRatio;
        left = 0;
        top = (container.clientHeight - height) / 2;
      }

      setVideoRect({ width, height, left, top });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateVideoRect);
    return () => window.removeEventListener('resize', updateVideoRect);
  }, [updateVideoRect]);

  useEffect(() => {
    if (isScreenSharing && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(console.error);
        updateVideoRect();
      };
    }
  }, [isScreenSharing, stream, updateVideoRect]);

  const startScreenShare = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { displaySurface: 'monitor' },
        audio: false 
      });
      
      setStream(mediaStream);
      setIsScreenSharing(true);
      setError(null);
      
      mediaStream.getVideoTracks()[0].onended = () => {
        setIsScreenSharing(false);
        setStream(null);
        setResult(null);
      };
    } catch (err: any) {
      console.error(err);
      setError('Failed to start screen sharing: ' + err.message);
    }
  };

  const stopScreenShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setIsScreenSharing(false);
    setResult(null);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      setCommand(transcript);
    };
    
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const executeCommand = async () => {
    if (!isScreenSharing || !videoRef.current) {
      setError('Please start screen sharing first.');
      return;
    }
    if (!command.trim()) {
      setError('Please enter a command.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) throw new Error("Video or canvas not initialized");

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("Video feed is not ready yet.");
      }

      // Scale down image if it's too large to prevent API errors
      const MAX_WIDTH = 1920;
      const MAX_HEIGHT = 1080;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      if (height > MAX_HEIGHT) {
        width = Math.round((width * MAX_HEIGHT) / height);
        height = MAX_HEIGHT;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, width, height);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);

      const base64Data = imageData.split(',')[1];
      if (!base64Data) throw new Error("Failed to capture image data.");
      const mimeType = 'image/jpeg';

      const modeConfig = AGENT_MODES.find(m => m.id === mode);
      const prompt = `
User Command: ${command}
Agent Mode: ${modeConfig?.name} (${modeConfig?.desc})

Previous Actions:
${JSON.stringify(previousActions, null, 2)}

Analyze the provided screen capture and determine the next logical UI action to achieve the user's command.
You must act as the user's hands on screen, interpreting visual elements without relying on APIs or DOM access.
If you are unsure or a popup blocks the view, set status to 'BLOCKED' and explain the visual obstruction in 'blocked_reason'. Do not guess coordinates.
Otherwise, set status to 'OK' and provide the action details.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            }
          },
          prompt
        ],
        config: {
          systemInstruction: `You are an Always-On Visual UI Automation Agent. Your goal is to act as the "hands on screen" for a user by interpreting live screen captures and performing actions based on user voice/text commands.
Capabilities:
1. Spatial Analysis: Identify UI elements by their visual features and relative coordinates.
2. Semantic Intent: Understand what a user wants to achieve and break it into discrete UI steps.
3. State Tracking: Compare current screen state with previous actions to verify if a click/type was successful.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: {
                type: Type.STRING,
                enum: ['OK', 'BLOCKED'],
                description: "Whether the next action can be determined or if the view is blocked."
              },
              blocked_reason: {
                type: Type.STRING,
                description: "Explanation of the visual obstruction if status is BLOCKED."
              },
              reasoning: {
                type: Type.STRING,
                description: "A brief explanation of why this step is next."
              },
              element_description: {
                type: Type.STRING,
                description: "The visual label or icon name."
              },
              action: {
                type: Type.STRING,
                enum: ['CLICK', 'TYPE', 'SCROLL', 'WAIT'],
                description: "The type of action to perform."
              },
              coordinates: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER, description: "Normalized X coordinate (0-1000)" },
                  y: { type: Type.NUMBER, description: "Normalized Y coordinate (0-1000)" }
                },
                required: ['x', 'y']
              },
              payload: {
                type: Type.STRING,
                description: "Text to type, if applicable."
              }
            },
            required: ['status']
          }
        }
      });

      const resultText = response.text;
      if (resultText) {
        const parsedResult = JSON.parse(resultText);
        setResult(parsedResult);
      } else {
        setError('Failed to generate a response.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setLoading(false);
    }
  };

  const addToPreviousActions = () => {
    if (result && result.status === 'OK') {
      setPreviousActions([...previousActions, {
        id: Date.now().toString(),
        command: command,
        action: {
          reasoning: result.reasoning,
          element_description: result.element_description,
          action: result.action,
          coordinates: result.coordinates,
          payload: result.payload
        }
      }]);
      setResult(null);
      setCommand('');
    }
  };

  const clearHistory = () => {
    setPreviousActions([]);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 font-sans selection:bg-indigo-500/30 flex flex-col">
      <header className="flex flex-col gap-4 border-b border-zinc-800 pb-4 mb-6 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
              <MonitorUp className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Live Agent Assistant</h1>
              <p className="text-xs text-zinc-400 mt-0.5">Always-on screen monitoring & automation</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              {AGENT_MODES.map((m) => {
                const Icon = m.icon;
                const isActive = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    title={m.name}
                    className={`p-2 rounded-md transition-all ${
                      isActive 
                        ? 'bg-zinc-800 text-indigo-400 shadow-sm' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>

            {isScreenSharing ? (
              <button
                onClick={stopScreenShare}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors text-sm"
              >
                <StopCircle className="w-4 h-4" />
                Stop Monitoring
              </button>
            ) : (
              <button
                onClick={startScreenShare}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors text-sm shadow-lg shadow-indigo-500/20"
              >
                <MonitorUp className="w-4 h-4" />
                Start Screen Share
              </button>
            )}
          </div>
        </div>
        
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-3 text-sm text-amber-200/80">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p>
            <strong>Note:</strong> This application is a <em>visual simulator</em>. Due to browser security sandboxing, web apps cannot physically take control of your mouse or keyboard to click on your screen. The red pulsing cursor demonstrates exactly where the AI <em>would</em> click if it had native OS access.
          </p>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Left Column: Live Screen */}
        <div className="lg:col-span-8 flex flex-col min-h-0 bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden relative">
          {!isScreenSharing ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
              <Monitor className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-zinc-300 mb-2">Agent is Offline</h3>
              <p className="text-sm max-w-md">
                Start screen sharing to allow the agent to monitor your display. 
                It will act as your hands, interpreting visual elements and executing your commands.
              </p>
              <button
                onClick={startScreenShare}
                className="mt-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-6 rounded-lg transition-colors text-sm font-medium"
              >
                Connect Display
              </button>
            </div>
          ) : (
            <div 
              ref={containerRef}
              className="flex-1 relative bg-black flex items-center justify-center overflow-hidden"
            >
              <video 
                ref={videoRef} 
                className="w-full h-full object-contain"
                autoPlay 
                playsInline 
                muted
              />
              
              {/* Hidden canvas for capturing frames */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Coordinate Overlay */}
              {result && result.status === 'OK' && result.coordinates && videoRect.width > 0 && (
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute pointer-events-none z-10 flex flex-col items-center justify-center"
                  style={{ 
                    left: videoRect.left + (result.coordinates.x / 1000) * videoRect.width, 
                    top: videoRect.top + (result.coordinates.y / 1000) * videoRect.height,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="relative flex items-center justify-center">
                    <div className="w-12 h-12 border-2 border-red-500 rounded-full animate-ping absolute"></div>
                    <div className="w-4 h-4 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,1)] z-10"></div>
                    <MousePointer2 className="w-6 h-6 text-white absolute top-2 left-2 drop-shadow-md z-20" fill="currentColor" />
                  </div>
                  <div className="mt-4 bg-black/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-md border border-zinc-700 whitespace-nowrap shadow-xl">
                    {result.action}: {result.element_description}
                  </div>
                </motion.div>
              )}

              {/* Scanning Overlay */}
              {loading && (
                <div className="absolute inset-0 bg-indigo-500/10 z-0 pointer-events-none">
                  <motion.div 
                    initial={{ top: '0%' }}
                    animate={{ top: '100%' }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-1 bg-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.8)]"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Interaction & Context */}
        <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
          
          {/* Command Input */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shrink-0 shadow-sm">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3 block">Command Agent</label>
            <div className="relative">
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    executeCommand();
                  }
                }}
                placeholder="e.g., Click the login button..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-4 pr-24 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-20 custom-scrollbar"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <button
                  onClick={toggleListening}
                  className={`p-2 rounded-lg transition-colors ${
                    isListening 
                      ? 'bg-red-500/20 text-red-400 animate-pulse' 
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                  }`}
                  title={isListening ? "Stop listening" : "Start voice command"}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => executeCommand()}
                  disabled={loading || !command.trim() || !isScreenSharing}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg transition-colors"
                  title="Execute command"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </div>

          {/* Agent Output / Context */}
          <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Agent Context</label>
              {previousActions.length > 0 && (
                <button onClick={clearHistory} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              
              {/* Current Result */}
              <AnimatePresence mode="popLayout">
                {result && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                        <MonitorUp className="w-3.5 h-3.5" />
                        Current Action
                      </span>
                      {result.status === 'OK' && (
                        <button
                          onClick={addToPreviousActions}
                          className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2 py-1 rounded transition-colors"
                        >
                          Confirm & Save
                        </button>
                      )}
                    </div>

                    {result.status === 'BLOCKED' ? (
                      <div className="text-sm text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                        <strong>Blocked:</strong> {result.blocked_reason}
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-zinc-200">{result.reasoning}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-xs font-mono bg-zinc-950 text-zinc-300 px-2 py-1 rounded border border-zinc-800">
                            {result.action}
                          </span>
                          <span className="text-xs bg-zinc-950 text-zinc-400 px-2 py-1 rounded border border-zinc-800 truncate max-w-[200px]">
                            {result.element_description}
                          </span>
                        </div>
                        {result.payload && (
                          <div className="text-xs font-mono text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-800 mt-2">
                            Payload: "{result.payload}"
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* History */}
              {previousActions.length === 0 && !result && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-3">
                  <TestTube className="w-8 h-8 opacity-20" />
                  <p className="text-xs text-center max-w-[200px]">No actions recorded yet. Issue a command to start.</p>
                </div>
              )}

              {previousActions.map((item, idx) => (
                <div key={item.id} className="bg-zinc-900 border border-zinc-800/50 rounded-xl p-3 opacity-70 hover:opacity-100 transition-opacity">
                  <div className="text-xs text-zinc-500 mb-2 pb-2 border-b border-zinc-800/50">
                    <span className="font-medium text-zinc-400">User:</span> "{item.command}"
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                        {item.action.action}
                      </span>
                      <span className="text-xs text-zinc-300 truncate">
                        {item.action.element_description}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 line-clamp-2">{item.action.reasoning}</p>
                  </div>
                </div>
              ))}

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
