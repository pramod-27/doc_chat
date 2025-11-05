import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Upload, X, Volume2, VolumeX, Mic, Send, Plus } from "lucide-react";

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
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const speakingRef = useRef(null);
  const endRef = useRef(null);

  // PERSIST SESSION
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
      setMessages([]);  // Clear messages on new session
      setFileName("");
      setReady(false);
      localStorage.removeItem(`messages_${sid}`);  // Clear old messages
    } catch {
      setTimeout(createSession, 1000);
    }
  };

  const loadSessionInfo = async (sid) => {
    try {
      const { data } = await axios.get(`${backendUrl}/session/info?session_id=${sid}`);
      setFileName(data.filename || "");
      setReady(data.ready || false);
      // Load persisted messages (no auto-greeting added)
      const savedMessages = localStorage.getItem(`messages_${sid}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }
      // No initial query or message here—chat starts empty
      if (!data.ready && data.filename) {
        console.warn("Document not ready—re-upload may be needed");
      }
    } catch {
      console.error('Failed to load session info');
    }
  };

  const updateUrl = (sid) => {
    const url = new URL(window.location);
    url.searchParams.set("s", sid);
    window.history.replaceState({}, "", url);
  };

  // Save messages to localStorage on change
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
        .map(r => r[0].transcript)
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

      // Typing effect simulation
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      let index = 0;
      const typingSpeed = 20; // ms per character

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
    const allowedTypes = ['.pdf', '.docx', '.doc'];
    const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(fileExt)) {
      alert(`Unsupported file type: ${file.name}. Please upload PDF, DOCX, or DOC.`);
      setProgress(0);
      return;
    }

    setProgress(10);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await axios.post(`${backendUrl}/upload?session_id=${sessionId}`, fd, {
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(20 + Math.round((e.loaded * 70) / e.total));
          }
        }
      });
      const { data } = await axios.get(`${backendUrl}/session/info?session_id=${sessionId}`);
      setFileName(data.filename);
      setReady(data.ready || false);
      setMessages([]);  // Clear chat on new upload—no auto-query or greeting
      setProgress(100);
      setTimeout(() => {
        setShowUpload(false);
        setProgress(0);
      }, 800);
      if (!data.ready) {
        alert("Document uploaded but processing incomplete. Try re-uploading.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert(`Upload failed: ${error.response?.data?.detail || 'Unknown error'}. Try a smaller file.`);
      setProgress(0);
      setShowUpload(false);
    }
  };

  const handleUploadClick = () => {
    if (fileName) {
      setShowConfirmUpload(true);
    } else {
      setShowUpload(true);
    }
  };

  const confirmUpload = () => {
    setShowConfirmUpload(false);
    setShowUpload(true);
  };

  const startNewChat = () => {
    if (messages.length > 0) {
      setShowConfirmNewChat(true);
    } else {
      createSession();
    }
  };

  const confirmNewChat = () => {
    setShowConfirmNewChat(false);
    createSession();
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-red-900/40">
        <div className="max-w-5xl mx-auto px-5 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600 shadow-lg" />
            <div>
              <h1 className="text-xl font-bold text-red-500">File Chat AI</h1>
              <p className="text-xs opacity-70">
                {fileName || "No file loaded"} {!ready && fileName ? " (Processing...)" : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={startNewChat}
              className="px-4 py-2 bg-gray-800 rounded-full text-sm font-medium hover:bg-gray-700 transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Chat
            </button>
            <button
              onClick={handleUploadClick}
              className="px-4 py-2 bg-red-600 rounded-full text-sm font-medium hover:bg-red-700 transition flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
          </div>
        </div>
      </header>

      {/* CHAT */}
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && fileName && ready ? (
            <div className="text-center py-32">
              <p className="text-4xl font-light text-red-400">Document ready</p>
              <p className="text-base opacity-60 mt-4">Ask a question to get started</p>
            </div>
          ) : messages.length === 0 && fileName && !ready ? (
            <div className="text-center py-32">
              <p className="text-4xl font-light text-yellow-400">Processing document...</p>
              <p className="text-base opacity-60 mt-4">Please wait or re-upload if stuck</p>
            </div>
          ) : messages.length === 0 && !fileName ? (
            <div className="text-center py-32">
              <p className="text-4xl font-light text-red-400">Upload a document</p>
              <p className="text-base opacity-60 mt-4">Then chat about its contents</p>
            </div>
          ) : null}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xl px-5 py-4 rounded-2xl text-base leading-relaxed shadow-lg border ${
                m.role === "user"
                  ? "bg-red-600 text-white border-red-700"
                  : "bg-gray-800/90 backdrop-blur border-gray-700"
              }`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && (
                  <button
                    onClick={() => toggleSpeak(m.content)}
                    className="mt-3 p-2 rounded-full bg-white/10 hover:bg-white/20"
                  >
                    {speakingRef.current ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex justify-start">
              <div className="px-5 py-4 rounded-2xl bg-gray-800/90 backdrop-blur border border-gray-700">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* VIBRATING MIC */}
      {listening && (
        <div className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center">
          <div className="relative">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border-4 border-red-500 opacity-0 animate-ping"
                style={{ animationDelay: `${i * 0.3}s`, width: "100px", height: "100px" }}
              />
            ))}
            <div className="w-24 h-24 bg-red-600 rounded-full shadow-2xl flex items-center justify-center animate-pulse">
              <Mic className="w-12 h-12 text-white" />
            </div>
          </div>
        </div>
      )}

      {/* INPUT */}
      <div className="p-4 bg-black/70 backdrop-blur">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendQuery()}
            placeholder={ready ? "Ask about the document..." : "Upload & process a document first"}
            disabled={!ready || thinking}
            className="flex-1 px-5 py-3 bg-gray-800/80 backdrop-blur rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 text-base placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button 
            onClick={toggleMic} 
            disabled={!ready}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={sendQuery}
            disabled={!input.trim() || thinking || !ready}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-50 transition disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* UPLOAD CONFIRM MODAL */}
      {showConfirmUpload && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl p-8 max-w-sm border border-red-900/50">
            <h3 className="text-xl font-bold text-red-400 mb-4">Replace Document?</h3>
            <p className="text-sm opacity-80 mb-6">
              Uploading a new document will <strong>erase your current file and all chat</strong>.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmUpload(false)}
                className="px-5 py-2 bg-gray-800 rounded-full text-sm hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpload}
                className="px-5 py-2 bg-red-600 rounded-full text-sm font-medium hover:bg-red-700"
              >
                Replace Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD MODAL */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl p-8 w-full max-w-md border border-red-900/50">
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-bold text-red-500">Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="p-2 hover:bg-gray-800 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>
            {progress > 0 && (
              <div className="mb-6">
                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center mt-2 text-sm text-red-400">{progress}%</p>
              </div>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.doc"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              className="block w-full text-sm file:mr-4 file:py-3 file:px-6 file:rounded-full file:bg-red-600 file:text-white file:font-medium"
            />
          </div>
        </div>
      )}

      {/* NEW CHAT CONFIRM */}
      {showConfirmNewChat && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl p-8 max-w-sm border border-red-900/50">
            <h3 className="text-xl font-bold text-red-400 mb-4">Start New Chat?</h3>
            <p className="text-sm opacity-80 mb-6">All current messages will be lost.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmNewChat(false)}
                className="px-5 py-2 bg-gray-800 rounded-full text-sm hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmNewChat}
                className="px-5 py-2 bg-red-600 rounded-full text-sm font-medium hover:bg-red-700"
              >
                Start New
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}