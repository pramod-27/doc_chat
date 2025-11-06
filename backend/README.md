---
title: PDF Chat AI Backend
emoji: 📚
colorFrom: red
colorTo: pink
sdk: docker
pinned: false
license: mit
---

# 📚 PDF Chat AI Backend

AI-powered document chat backend using RAG (Retrieval Augmented Generation).

## Features

- 📄 Upload PDF, DOCX, or DOC files
- 💬 Chat with your documents using AI
- 🔍 Semantic search with vector embeddings
- 🚀 Fast and efficient with LangChain + Groq

## API Endpoints

- `GET /` - Health check
- `POST /session` - Create new session
- `GET /session/info` - Get session information
- `POST /upload` - Upload document
- `POST /query` - Query document
- `GET /health` - Health status

## Environment Variables

Required:
- `GROQ_API_KEY` - Your Groq API key

## Tech Stack

- FastAPI
- LangChain
- Groq (LLM)
- ChromaDB (Vector Store)
- Sentence Transformers (Embeddings)

## Usage

```bash
# Upload document
curl -X POST "https://YOUR-SPACE.hf.space/upload" \
  -F "file=@document.pdf"

# Query document
curl -X POST "https://YOUR-SPACE.hf.space/query" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this document about?"}'
```

## Frontend

Visit the frontend: [Your Vercel URL]

## License

MIT