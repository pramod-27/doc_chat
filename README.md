# PDF & Document Chat AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://www.python.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0-orange)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3.1-blueviolet)](https://react.dev/)

A full-stack AI-powered chat application for querying PDFs, DOCX, and DOC files using **Retrieval-Augmented Generation (RAG)**. Built with **LangChain**, **Groq LLM**, and **HuggingFace embeddings**, it enables semantic search and context-aware responses. Features include voice input/output, session persistence across refreshes, and seamless deployment to Hugging Face Spaces (backend) and Vercel (frontend).

## Quick Demo
- **Upload**: Drag-and-drop or select PDF/DOCX/DOC files (<50MB).
- **Chat**: Ask questions via text or microphone—get precise, document-grounded answers.
- **Voice**: Listen to responses with TTS.
- **Persistence**: Sessions and chat history survive page refreshes via localStorage and backend validation.



## Features
- 📄 **Multi-Format Support**: Handles PDF, DOCX, and DOC files.
- 💬 **RAG-Powered Queries**: Semantic search with vector embeddings for accurate, context-specific responses.
- 🔄 **Session Management**: UUID-based sessions with auto-cleanup (1-hour timeout), limits (1000 max), and validation on refresh.
- 🎤 **Voice Integration**: Speech-to-text input and text-to-speech output using Web Speech API.
- 📱 **Responsive UI**: Mobile-friendly Netflix-inspired design with animations (Framer Motion).
- 🛡️ **Error Handling**: Graceful fallbacks for invalid sessions, empty docs, or API errors.
- 🚀 **Easy Deployment**: Dockerized backend for HF Spaces; Vite-optimized frontend for Vercel.
- 📊 **Monitoring**: Health checks, session stats, and logging for production.

## Tech Stack
### Backend
- **Framework**: FastAPI (async API with auto-docs at `/docs`).
- **RAG Pipeline**: LangChain (chains, prompts), ChromaDB (vector store), HuggingFace Embeddings (`all-MiniLM-L6-v2`).
- **LLM**: Groq API (`llama-3.1-8b-instant` for fast inference).
- **Document Processing**: PyPDF (PDF extraction), docx2txt (DOCX/DOC), RecursiveCharacterTextSplitter (chunking: 1000 chars, 200 overlap).
- **Other**: Pydantic (models), Uvicorn (server), Docker (containerization).

### Frontend
- **Framework**: React 18 + Vite (fast builds).
- **Styling**: TailwindCSS (responsive, dark mode).
- **UI/UX**: Lucide React (icons), Framer Motion (animations), Axios (API calls).
- **Features**: Web Speech API (voice), localStorage (persistence).

### Deployment
- **Backend**: Hugging Face Spaces (free GPU/CPU) or Railway/Render.
- **Frontend**: Vercel (serverless, auto-deploys from GitHub).

## Architecture & Backend Process
The app follows a client-server architecture with RAG for document querying. Here's how the backend works:

### 1. **Session Initialization**
   - On app load, frontend creates/retrieves a session ID (UUID) via `POST /session`.
   - Backend (`session_manager.py`): Stores sessions in memory (`dict`) with metadata (e.g., `last_active`, `chunk_count`).
   - Background thread cleans expired sessions every 5min (timeout: 1hr, max: 1000 sessions).
   - On refresh, frontend validates via `GET /session/info`—if invalid, creates new and clears localStorage.

### 2. **Document Upload & Processing** (`POST /upload`)
   - Frontend sends file as FormData.
   - Backend:
     - Validates: File type (PDF/DOCX/DOC), size (<50MB).
     - Extracts text: PyPDF for PDFs (per-page), docx2txt for Word docs (paragraph-based chunking).
     - Splits: Recursive splitter into ~1000-char chunks with 200-char overlap.
     - Embeds: HuggingFace model generates vectors (CPU-normalized).
     - Stores: ChromaDB vectorstore (in-memory, per-session; deletes old on re-upload).
   - Updates session: Sets `ready=True`, tracks filename/chunks.

### 3. **Querying Documents** (`POST /query`)
   - Frontend sends question with session ID.
   - Backend (`rag_chain.py`):
     - Retrieves: Top-6 similar chunks via Chroma similarity search.
     - Formats: Prompt template with context (page-cited chunks) and rules (concise, no markdown, document-focused).
     - Generates: Groq LLM (temp=0.2, max=1024 tokens) for RAG response.
     - Cleans: Strips markdown/formatting.
   - Frontend: Typewriter animation for response; persists messages in localStorage.

### 4. **Error & Edge Cases**
   - No doc: Returns "Upload first."
   - Expired session: Auto-creates new.
   - Cleanup: Enforces limits by evicting oldest; health check at `/health`.

### Flow Diagram
```
Frontend (React) → API Call → Backend (FastAPI)
                  ↓
Upload: File → Extract → Chunk → Embed → Chroma Store
Query: Q → Retrieve Chunks → Prompt + Groq LLM → Response
                  ↓
Session Manager: Track/Validate/Cleanup
```

## Quick Start (Local Development)

### Prerequisites
- Python 3.10+ and Node.js 18+.
- Groq API key: Sign up at [console.groq.com](https://console.groq.com/keys).

### Backend Setup
1. Clone repo: `git clone <your-repo> && cd pdf_chatbot/backend`.
2. Install deps: `pip install -r requirements.txt`.
3. Env: Copy `.env.example` to `.env` and add `GROQ_API_KEY=your_key`.
4. Run: `python app.py` (or `uvicorn app:app --reload --port 8000`).
5. Test: Visit `http://localhost:8000/docs` for Swagger UI.

### Frontend Setup
1. `cd frontend`.
2. Install: `npm install`.
3. Env: Add `VITE_BACKEND_URL=http://localhost:8000` to `.env`.
4. Run: `npm run dev` (opens `http://localhost:5173`).
5. Test: Upload a doc and query!

### Docker (Backend Only)
```bash
cd backend
docker build -t pdf-chat-backend .
docker run -p 7860:7860 -e GROQ_API_KEY=your_key pdf-chat-backend
```

## Deployment

### Backend: Hugging Face Spaces
1. Push to HF: Fork/create Space with `app.py`, `requirements.txt`, `Dockerfile`.
2. Secrets: Add `GROQ_API_KEY` in Space settings.
3. Deploy: Auto-builds; access at `https://hf.space/your-username/pdf-chat`.

### Frontend: Vercel
1. Connect GitHub repo to Vercel.
2. Env: Set `VITE_BACKEND_URL=https://your-hf-space.hf.space`.
3. Deploy: Auto-deploys on push; update README with URL.

### Full Stack: Railway/Render
- Backend: Docker to Railway (free tier).
- Frontend: Vercel or static host.

## API Endpoints
| Method | Endpoint | Description | Body/Query |
|--------|----------|-------------|------------|
| `GET` | `/` | Root health (session stats) | - |
| `POST` | `/session` | Create session (returns ID) | - |
| `DELETE` | `/session/{id}` | Delete session | - |
| `GET` | `/session/info` | Get session info | `?session_id=ID` |
| `GET` | `/session/stats` | Global stats | - |
| `POST` | `/upload` | Upload doc | Multipart file + `?session_id=ID` |
| `POST` | `/query` | Ask question | JSON `{question: "Q"}` + `?session_id=ID` |
| `GET` | `/health` | Health check | - |

Example (curl):
```bash
# Upload
curl -X POST "http://localhost:8000/upload" -F "file=@doc.pdf"

# Query
curl -X POST "http://localhost:8000/query" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this about?"}'
```

## Environment Variables
| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | - | Groq API key for LLM. |
| `SESSION_TIMEOUT` | No | 3600 (1hr) | Session expiry (seconds). |
| `MAX_SESSIONS` | No | 1000 | Max concurrent sessions. |
| `CLEANUP_INTERVAL` | No | 300 (5min) | Cleanup thread interval. |
| `EMBEDDING_MODEL` | No | `all-MiniLM-L6-v2` | HF embedding model. |
| `PORT` | No | 7860 (HF) / 8000 (local) | Server port. |

## Contributing
1. Fork & clone.
2. Create branch: `git checkout -b feature/x`.
3. Commit: `git commit -m "Add X"`.
4. Push & PR: Target `main`.

Issues? Open a ticket. Pull requests welcome!

## License
MIT License. See [LICENSE](LICENSE) for details.

---

⭐ Star the repo if helpful! Questions? [Open an issue](https://github.com/pramod-27/pdf-chatbot/issues).