import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { Upload, X, Volume2, VolumeX, Mic, Send, Plus } from "lucide-react";

import AnimatedLogo from "./components/AnimatedLogo";
import LogoAnimation from "./components/LogoAnimation";
import OrbitalRings from "./components/OrbitalRings";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export default function App() {
  const [sessionId, setSessionId] = useState("");
  const [fileName, setFileName] = useState("");
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showConfirmUpload, setShowConfirmUpload] = useState(false);
  const [showConfirmNewChat, setShowConfirmNewChat] = useState(false);
  const [progress, setProgress] = useState(0);
  const [animationStage, setAnimationStage] = useState("loading");
  const [uploadError, setUploadError] = useState("");

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const speakingRef = useRef(null);
  const endRef = useRef(null);
  const logoHeaderRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Use useCallback to prevent unnecessary re-renders
  const stableSetMessages = useCallback((updater) => {
    setMessages(prev => {
      const newMessages = typeof updater === 'function' ? updater(prev) : updater;
      return newMessages;
    });
  }, []);

  useEffect(() => {
    const urlSession = new URLSearchParams(window.location.search).get("s");
    if (urlSession) {
      setSessionId(urlSession);
      loadSessionInfo(urlSession);
    } else {
      localStorage.removeItem("s");
      createSession();
    }
    setupSpeech();
    return () => synthRef.current.cancel();
  }, []);

  // Fixed scrolling - only scroll when new messages are added
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages.length]); // Only depend on messages length, not content

  const createSession = async () => {
    try {
      const { data } = await axios.post(`${backendUrl}/session`);
      const sid = data.session_id;
      setSessionId(sid);
      localStorage.setItem("s", sid);
      updateUrl(sid);
      stableSetMessages([]);
      setFileName("");
      setReady(false);
      localStorage.removeItem(`messages_${sid}`);
      loadSessionInfo(sid);
    } catch (error) {
      console.error("Session creation failed:", error);
      setTimeout(createSession, 1000);
    }
  };

  const loadSessionInfo = async (sid) => {
    try {
      const { data } = await axios.get(`${backendUrl}/session/info?session_id=${sid}`);
      setFileName(data.filename || "");
      setReady(data.ready || false);
      const savedMessages = localStorage.getItem(`messages_${sid}`);
      if (savedMessages) stableSetMessages(JSON.parse(savedMessages));
    } catch (error) {
      console.error("Failed to load session info:", error);
      setFileName("");
      setReady(false);
      stableSetMessages([]);
    }
  };

  const updateUrl = (sid) => {
    const url = new URL(window.location);
    url.searchParams.set("s", sid);
    window.history.replaceState({}, "", url);
  };

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(`messages_${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  const setupSpeech = () => {
    if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SR();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognitionRef.current.onend = () => {
      setListening(false);
      if (input.trim() && input !== "Listening...") sendQuery();
    };
  };

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setListening(true);
      setInput("Listening...");
    }
  };

  const sendQuery = async () => {
    if (!input.trim() || thinking) return;
    const q = input.trim();
    setInput("");
    
    // Add user message immediately with unique ID
    const userMessage = { 
      role: "user", 
      content: q, 
      id: Date.now() + Math.random() // Ensure unique ID
    };
    
    stableSetMessages(prev => [...prev, userMessage]);
    setThinking(true);

    try {
      const { data } = await axios.post(
        `${backendUrl}/query?session_id=${sessionId}`,
        { question: q }
      );

      const fullText = data.response || "No answer found.";
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id);
        localStorage.setItem("s", data.session_id);
        updateUrl(data.session_id);
      }

      // Add assistant message with empty content first
      const assistantMessageId = Date.now() + Math.random() + 1;
      stableSetMessages(prev => [...prev, { 
        role: "assistant", 
        content: "", 
        id: assistantMessageId
      }]);

      // Typewriter effect
      let displayedText = "";
      const typingSpeed = 20;

      for (let i = 0; i < fullText.length; i++) {
        await new Promise(resolve => setTimeout(resolve, typingSpeed));
        displayedText += fullText[i];
        
        stableSetMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: displayedText }
            : msg
        ));
      }

    } catch (error) {
      console.error("Query error:", error);
      const errorMsg = error.response?.status === 400 
        ? "Hey! Looks like you haven't uploaded a document yet. Upload a PDF/DOCX/DOC to chat about its contents." 
        : "Sorry, something went wrong. Try rephrasing your question.";
      
      stableSetMessages(prev => [...prev, { 
        role: "assistant", 
        content: errorMsg, 
        id: Date.now() + Math.random()
      }]);
    } finally {
      setThinking(false);
    }
  };

  const toggleSpeak = (text) => {
    if (speakingRef.current) {
      synthRef.current.cancel();
      speakingRef.current = null;
    } else {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.9;
      utter.onend = () => (speakingRef.current = null);
      synthRef.current.speak(utter);
      speakingRef.current = utter;
    }
  };

  const upload = async (file) => {
    setUploadError("");
    const allowedTypes = [".pdf", ".docx", ".doc"];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    
    if (!allowedTypes.includes(fileExt)) {
      setUploadError(`Unsupported file type: ${file.name}. Only PDF, DOCX, DOC allowed.`);
      setProgress(0);
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum 50MB allowed.`);
      setProgress(0);
      return;
    }

    setProgress(10);
    const fd = new FormData();
    fd.append("file", file);
    
    try {
      const { data } = await axios.post(`${backendUrl}/upload?session_id=${sessionId}`, fd, {
        onUploadProgress: (e) => {
          if (e.total) {
            const percentComplete = Math.round((e.loaded * 100) / e.total);
            setProgress(20 + Math.round((percentComplete * 70) / 100));
          }
        },
      });

      const newSid = data.session_id || sessionId;
      setSessionId(newSid);
      localStorage.setItem("s", newSid);
      updateUrl(newSid);
      
      const { data: info } = await axios.get(`${backendUrl}/session/info?session_id=${newSid}`);
      setFileName(info.filename || data.filename);
      setReady(info.ready || false);
      stableSetMessages([]);
      setProgress(100);
      
      setTimeout(() => {
        setShowUpload(false);
        setProgress(0);
      }, 800);
    } catch (error) {
      console.error("Upload error:", error);
      const errorMsg = error.response?.data?.detail || error.message || "Upload failed. Try a smaller file.";
      setUploadError(errorMsg);
      setProgress(0);
    }
  };

  const handleUploadClick = () => {
    setUploadError("");
    if (fileName) setShowConfirmUpload(true);
    else setShowUpload(true);
  };

  const confirmUpload = () => {
    setShowConfirmUpload(false);
    setUploadError("");
    setShowUpload(true);
  };

  const startNewChat = () => {
    if (messages.length > 0 || fileName) setShowConfirmNewChat(true);
    else createSession();
  };

  const confirmNewChat = () => {
    setShowConfirmNewChat(false);
    createSession();
  };

  const handleLogoAnimationStage = (stage) => {
    setAnimationStage(stage);
  };

  useEffect(() => {
    if (logoHeaderRef.current) {
      logoHeaderRef.current.setAttribute("data-logo-target", "true");
    }
  }, [animationStage]);

  // Message Bubble Component - Netflix Theme
  const MessageBubble = ({ message }) => (
    <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`relative max-w-[85vw] sm:max-w-[75vw] md:max-w-[65vw] lg:max-w-[50vw] px-4 py-3 rounded-2xl ${
        message.role === "user" 
          ? "bg-gradient-to-r from-red-500/90 to-pink-500/90 text-white shadow-lg" 
          : "bg-gradient-to-r from-gray-800 to-gray-900 text-white shadow-lg border border-gray-600/30"
      }`}>
        
        {/* Message header */}
        <div className={`flex items-center gap-2 mb-1 ${
          message.role === "user" ? "justify-end" : "justify-start"
        }`}>
          <span className={`text-xs font-medium ${
            message.role === "user" ? "text-red-200" : "text-green-400"
          }`}>
            {message.role === "user" ? "You" : "Assistant"}
          </span>
        </div>

        {/* Message content */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </p>

        {/* Action buttons for assistant messages */}
        {message.role === "assistant" && message.content && (
          <div className="flex justify-end mt-2">
            <button
              onClick={() => toggleSpeak(message.content)}
              className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 transition-all duration-300 flex items-center gap-2 text-xs"
            >
              {speakingRef.current ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              {speakingRef.current ? "Stop" : "Speak"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Empty State Component - Netflix Theme (without the upload icon)
  const EmptyState = () => (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        {!fileName ? (
          <>
            {/* Removed the upload icon box */}
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Ready to Chat with Documents?
            </h2>
            <p className="text-gray-400 text-sm sm:text-base mb-8">
              Upload PDF, DOCX, or DOC files and ask questions about their content.
            </p>
            <button
              onClick={handleUploadClick}
              className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Upload Document
            </button>
          </>
        ) : !ready ? (
          <>
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Processing Document
            </h2>
            <p className="text-gray-400 text-sm sm:text-base">
              Analyzing <span className="text-red-400 font-semibold">{fileName}</span>...
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-2xl">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-lg sm:text-xl font-bold text-green-600">✓</span>
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Document Ready!
            </h2>
            <p className="text-gray-400 text-sm sm:text-base">
              <span className="text-green-400 font-semibold">{fileName}</span> is loaded and ready.
            </p>
          </>
        )}
      </div>
    </div>
  );

  if (animationStage === "loading" || animationStage === "transitioning") {
    return (
      <>
        <LogoAnimation onStageChange={handleLogoAnimationStage} />
        {animationStage === "transitioning" && (
          <div className="fixed inset-0 bg-black text-white flex flex-col">
            <OrbitalRings />

            <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-red-900/50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div ref={logoHeaderRef} data-logo-target="true">
                    <AnimatedLogo inHeader={true} isTransitioning={true} />
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-xl font-bold text-red-500">File Chat AI</h1>
                    <p className="text-xs text-gray-400">
                      {fileName || "No file loaded"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  {/* Text buttons instead of icons */}
                  <button
                    onClick={startNewChat}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all text-sm font-medium flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New Chat
                  </button>
                  <button
                    onClick={handleUploadClick}
                    className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-lg transition-all text-sm font-bold flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 flex items-center justify-center">
              <EmptyState />
            </div>

            <div className="p-4 bg-black/95 backdrop-blur-xl border-t border-red-900/50">
              <div className="max-w-4xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendQuery()}
                    placeholder={ready ? "Ask anything about your document..." : "Upload a document to begin..."}
                    className="w-full px-4 py-3 pr-20 bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm placeholder-gray-500 transition-all"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button onClick={toggleMic} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      onClick={sendQuery}
                      disabled={!input.trim() || thinking}
                      className="p-2 rounded-lg bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 disabled:opacity-40 transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="fixed inset-0 pointer-events-none z-0">
        <OrbitalRings />
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-transparent to-pink-900/20 blur-3xl animate-pulse-slow" />
      </div>

      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-2xl border-b border-red-900/50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div ref={logoHeaderRef} data-logo-target="true">
              <AnimatedLogo inHeader={true} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-red-500 truncate">File Chat AI</h1>
              <p className="text-xs text-gray-400 truncate">
                {fileName || "Ready to chat with your documents"}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            {/* Text buttons instead of icons */}
            <button
              onClick={startNewChat}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
            <button
              onClick={handleUploadClick}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-lg transition-all text-sm font-bold flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>
      </header>

      <main 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto relative z-10"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="max-w-4xl mx-auto h-full">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="px-4 py-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              
              {thinking && (
                <div className="flex justify-start mb-4">
                  <div className="px-4 py-3 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {listening && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="relative">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border-4 border-red-500 opacity-0 animate-ping blur-sm"
                style={{ 
                  animationDelay: `${i * 0.3}s`, 
                  width: "100px", 
                  height: "100px" 
                }}
              />
            ))}
            <div className="w-20 h-20 bg-gradient-to-br from-red-600 to-pink-600 rounded-full shadow-2xl flex items-center justify-center animate-pulse">
              <Mic className="w-10 h-10 text-white drop-shadow-2xl" />
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-40 p-4 bg-black/95 backdrop-blur-2xl border-t border-red-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendQuery()}
              placeholder={ready ? "Ask anything about your document..." : "Upload a document to begin chatting..."}
              disabled={thinking}
              className="w-full px-4 py-3 pr-20 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm placeholder-gray-500 transition-all shadow-2xl"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
              <button 
                onClick={toggleMic} 
                disabled={thinking}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 shadow-lg"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                onClick={sendQuery}
                disabled={!input.trim() || thinking}
                className="p-2 rounded-lg bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 disabled:opacity-40 transition shadow-lg"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showConfirmUpload && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl p-6 max-w-sm w-full border border-red-900/50 shadow-2xl">
            <h3 className="text-xl font-bold text-red-500 mb-4">Replace Document?</h3>
            <p className="text-gray-300 mb-6">This will erase your current file and chat history.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirmUpload(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition">
                Cancel
              </button>
              <button onClick={confirmUpload} className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-lg text-sm font-bold transition">
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl p-6 w-full max-w-sm border border-red-900/50 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-red-500">Upload Document</h2>
              <button onClick={() => { setShowUpload(false); setUploadError(""); setProgress(0); }} className="p-2 hover:bg-zinc-800 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {uploadError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg">
                <p className="text-red-400 text-sm">{uploadError}</p>
              </div>
            )}
            
            {progress > 0 && (
              <div className="mb-6">
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-gradient-to-r from-red-600 to-pink-600 rounded-full transition-all duration-500 shadow-lg" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-center mt-2 text-sm font-bold text-red-500">{progress}%</p>
              </div>
            )}
            
            <input
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-red-600 file:to-pink-600 file:text-white file:font-bold hover:file:from-red-500 hover:file:to-pink-500 file:transition file:cursor-pointer cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-3">Maximum file size: 50MB</p>
          </div>
        </div>
      )}

      {showConfirmNewChat && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl p-6 max-w-sm w-full border border-red-900/50 shadow-2xl">
            <h3 className="text-xl font-bold text-red-500 mb-4">Start Fresh?</h3>
            <p className="text-gray-300 mb-6">This will clear all messages and the current document.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirmNewChat(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition">
                Cancel
              </button>
              <button onClick={confirmNewChat} className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-lg text-sm font-bold transition">
                New Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}