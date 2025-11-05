# PDF & Document Chat AI

A full-stack AI-powered chat app for querying PDFs, DOCX, and DOC files using RAG (Retrieval-Augmented Generation) with LangChain, Groq LLM, and HuggingFace embeddings. Features voice input/output, session persistence, and easy deployment.

## Quick Demo
- Upload a document (PDF/DOCX/DOC, <50MB).
- Ask questions via text or mic.
- Get context-aware responses with citations (pages).
- Voice playback for answers.

Live example: [Deployed on Railway](https://your-app.railway.app) (update with your URL).

## Tech Stack
- **Backend**: FastAPI (Python), LangChain, ChromaDB, PyPDF/docx2txt, Groq API.
- **Frontend**: React + Vite + TailwindCSS, Axios, Lucide icons, Web Speech API.
- **Deployment**: Docker + Railway/Render (free tiers).

## Setup & Run Locally

### Prerequisites
- Python 3.10+ (venv recommended).
- Node.js 18+.
- Groq API key (free at [groq.com](https://console.groq.com/keys)).

### 1. Clone & Install
```bash
git clone <your-repo>
cd pdf_chatbot