import { useState, useEffect, useRef } from "react";
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

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const speakingRef = useRef(null);
  const endRef = useRef(null);
  const logoHeaderRef = useRef(null);
  

  useEffect(() => {
    const urlSession = new URLSearchParams(window.location.search).get("s");
    const saved = localStorage.getItem("s");
    const sid = urlSession || saved || "";
    if (sid) {
      setSessionId(sid);
      localStorage.setItem("s", sid);
      loadSessionInfo(sid);
    } else {
      createSession();
    }
    setupSpeech();
    return () => synthRef.current.cancel();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createSession = async () => {
    try {
      const { data } = await axios.post(`${backendUrl}/session`);
      const sid = data.session_id;
      setSessionId(sid);
      localStorage.setItem("s", sid);
      updateUrl(sid);
      setMessages([]);
      setFileName("");
      setReady(false);
      localStorage.removeItem(`messages_${sid}`);
    } catch {
      setTimeout(createSession, 1000);
    }
  };

  const loadSessionInfo = async (sid) => {
    try {
      const { data } = await axios.get(`${backendUrl}/session/info?session_id=${sid}`);
      setFileName(data.filename || "");
      setReady(data.ready || false);
      const savedMessages = localStorage.getItem(`messages_${sid}`);
      if (savedMessages) setMessages(JSON.parse(savedMessages));
    } catch {
      console.error("Failed to load session info");
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
      if (input.trim()) sendQuery();
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
    if (!input.trim() || thinking || !ready) return;
    const q = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
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

      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      let index = 0;
      const typingSpeed = 20;

      const typingInterval = setInterval(() => {
        index++;
        setMessages((m) => {
          const updated = [...m];
          updated[updated.length - 1].content = fullText.slice(0, index);
          return updated;
        });
        endRef.current?.scrollIntoView({ behavior: "smooth" });
        if (index >= fullText.length) clearInterval(typingInterval);
      }, typingSpeed);
    } catch (error) {
      console.error("Query error:", error);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Sorry, something went wrong. Try rephrasing your question." },
      ]);
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
    const allowedTypes = [".pdf", ".docx", ".doc"];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!allowedTypes.includes(fileExt)) {
      alert(`Unsupported file type: ${file.name}. Only PDF, DOCX, DOC allowed.`);
      setProgress(0);
      return;
    }

    setProgress(10);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await axios.post(`${backendUrl}/upload?session_id=${sessionId}`, fd, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(20 + Math.round((e.loaded * 70) / e.total));
        },
      });

      const newSid = data.session_id || sessionId;
      setSessionId(newSid);
      localStorage.setItem("s", newSid);
      updateUrl(newSid);
      const { data: info } = await axios.get(`${backendUrl}/session/info?session_id=${newSid}`);
      setFileName(info.filename || data.filename);
      setReady(info.ready || false);
      setMessages([]);
      setProgress(100);
      setTimeout(() => {
        setShowUpload(false);
        setProgress(0);
      }, 800);
    } catch (error) {
      alert(`Upload failed: ${error.response?.data?.detail || "Try a smaller file"}`);
      setProgress(0);
      setShowUpload(false);
    }
  };

  const handleUploadClick = () => {
    if (fileName) setShowConfirmUpload(true);
    else setShowUpload(true);
  };

  const confirmUpload = () => {
    setShowConfirmUpload(false);
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

  if (animationStage === "loading" || animationStage === "transitioning") {
    return (
      <>
        <LogoAnimation onStageChange={handleLogoAnimationStage} />
        {animationStage === "transitioning" && (
          <div
            className="fixed inset-0 bg-black text-white flex flex-col"
            style={{
              opacity: animationStage === "transitioning" ? 1 : 0,
              transition: "opacity 800ms 400ms",
            }}
          >
            <OrbitalRings />

            <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-red-900/50">
              <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div ref={logoHeaderRef} data-logo-target="true">
                    <AnimatedLogo inHeader={true} isTransitioning={true} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-red-500 drop-shadow-glow">File Chat AI</h1>
                    <p className="text-xs text-gray-400">
                      {fileName || "No file loaded"} {!ready && fileName ? " (Processing...)" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={startNewChat}
                    className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm font-medium transition-all flex items-center gap-2 shadow-lg"
                  >
                    <Plus className="w-4 h-4" /> New Chat
                  </button>
                  <button
                    onClick={handleUploadClick}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-md text-sm font-bold transition-all flex items-center gap-2 shadow-lg"
                  >
                    <Upload className="w-4 h-4" /> Upload
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-12">
              <div className="max-w-5xl mx-auto space-y-6">
                {messages.length === 0 && fileName && ready ? (
                  <div className="text-center py-32">
                    <p className="text-5xl font-bold text-white mb-4">Document ready</p>
                    <p className="text-xl text-gray-400">Ask anything about your document</p>
                  </div>
                ) : messages.length === 0 && !fileName ? (
                  <div className="text-center py-32">
                    <p className="text-5xl font-bold text-white mb-4">Upload a document</p>
                    <p className="text-2xl text-gray-400">PDF • DOCX • DOC</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="p-6 bg-black/95 backdrop-blur-xl border-t border-red-900/50">
              <div className="max-w-5xl mx-auto">
                <div className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendQuery()}
                    placeholder={ready ? "Ask anything..." : "Upload to begin"}
                    disabled={!ready || thinking}
                    className="w-full px-6 py-4 pr-32 bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-base placeholder-gray-500 transition-all"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                    <button onClick={toggleMic} disabled={!ready} className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40">
                      <Mic className="w-5 h-5" />
                    </button>
                    <button
                      onClick={sendQuery}
                      disabled={!input.trim() || thinking || !ready}
                      className="p-3 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 disabled:opacity-40 transition shadow-lg"
                    >
                      <Send className="w-5 h-5" />
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
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div ref={logoHeaderRef} data-logo-target="true">
              <AnimatedLogo inHeader={true} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-red-500 drop-shadow-glow">File Chat AI</h1>
              <p className="text-xs text-gray-400">
                {fileName || "No file loaded"} {!ready && fileName ? " (Processing...)" : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={startNewChat}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" /> New Chat
            </button>
            <button
              onClick={handleUploadClick}
              className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg"
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-12 relative z-10">
        <div className="max-w-5xl mx-auto space-y-8">
          {messages.length === 0 && fileName && ready ? (
            <div className="text-center py-32">
              <p className="text-5xl font-bold text-white mb-4">Document ready</p>
              <p className="text-xl text-gray-400">Ask anything about your document</p>
            </div>
          ) : messages.length === 0 && fileName && !ready ? (
            <div className="text-center py-32">
              <div className="w-16 h-16 mx-auto mb-6 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-5xl font-bold text-white mb-4">Processing...</p>
              <p className="text-xl text-gray-400">Hold tight</p>
            </div>
          ) : messages.length === 0 && !fileName ? (
            <div className="text-center py-32">
              <p className="text-5xl font-bold text-white mb-4">Upload a document</p>
              <p className="text-xl text-gray-400">PDF • DOCX • DOC</p>
            </div>
          ) : null}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}>
              <div
                className={`relative max-w-3xl px-6 py-5 rounded-3xl text-base leading-relaxed overflow-hidden
                  ${m.role === "user" ? "glass-user" : "glass-assistant"}
                `}
              >
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-red-600/20 via-red-500/10 to-pink-600/20 blur-xl" />
                <div className="relative backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-6 shadow-2xl ring-1 ring-white/20">
                  <p className="whitespace-pre-wrap text-white drop-shadow-md">{m.content}</p>
                  {m.role === "assistant" && (
                    <button
                      onClick={() => toggleSpeak(m.content)}
                      className="mt-4 px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-xs font-medium transition-all duration-300 flex items-center gap-2 shadow-lg"
                    >
                      {speakingRef.current ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      {speakingRef.current ? "Stop" : "Speak"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex justify-start animate-slide-up">
              <div className="px-6 py-5 rounded-3xl backdrop-blur-2xl bg-white/5 border border-white/10 shadow-2xl ring-1 ring-white/20">
                <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-bounce" />
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {listening && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="relative">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border-4 border-red-500 opacity-0 animate-ping blur-sm"
                style={{ animationDelay: `${i * 0.3}s`, width: "120px", height: "120px" }}
              />
            ))}
            <div className="w-28 h-28 bg-gradient-to-br from-red-600 to-pink-600 rounded-full shadow-2xl flex items-center justify-center animate-pulse">
              <Mic className="w-14 h-14 text-white drop-shadow-2xl" />
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-0 z-40 p-6 bg-black/95 backdrop-blur-2xl border-t border-red-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendQuery()}
              placeholder={ready ? "Ask anything..." : "Upload to begin"}
              disabled={!ready || thinking}
              className="w-full px-6 py-4 pr-36 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500 text-base placeholder-gray-500 transition-all shadow-2xl"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-3">
              <button onClick={toggleMic} disabled={!ready} className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition disabled:opacity-40 shadow-lg">
                <Mic className="w-5 h-5" />
              </button>
              <button
                onClick={sendQuery}
                disabled={!input.trim() || thinking || !ready}
                className="p-3 rounded-xl bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 disabled:opacity-40 transition shadow-lg"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showConfirmUpload && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl p-8 max-w-md w-full border border-red-900/50 shadow-2xl ring-1 ring-white/10">
            <h3 className="text-2xl font-bold text-red-500 mb-4">Replace Document?</h3>
            <p className="text-gray-300 mb-6">This will erase your current file and chat.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirmUpload(false)} className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition">
                Cancel
              </button>
              <button onClick={confirmUpload} className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-xl text-sm font-bold transition">
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl p-8 w-full max-w-md border border-red-900/50 shadow-2xl ring-1 ring-white/10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-red-500">Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="p-2 hover:bg-zinc-800 rounded-xl transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            {progress > 0 && (
              <div className="mb-6">
                <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-gradient-to-r from-red-600 to-pink-600 rounded-full transition-all duration-500 shadow-lg" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-center mt-3 text-sm font-bold text-red-500">{progress}%</p>
              </div>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              className="block w-full text-sm text-gray-400 file:mr-4 file:py-3 file:px-8 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-red-600 file:to-pink-600 file:text-white file:font-bold hover:file:from-red-500 hover:file:to-pink-500 file:transition file:cursor-pointer cursor-pointer"
            />
          </div>
        </div>
      )}

      {showConfirmNewChat && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/80 backdrop-blur-2xl rounded-2xl p-8 max-w-md w-full border border-red-900/50 shadow-2xl ring-1 ring-white/10">
            <h3 className="text-2xl font-bold text-red-500 mb-4">Start Fresh?</h3>
            <p className="text-gray-300 mb-6">All messages and file will be cleared.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirmNewChat(false)} className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition">
                Cancel
              </button>
              <button onClick={confirmNewChat} className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 rounded-xl text-sm font-bold transition">
                New Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}