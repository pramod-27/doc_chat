from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
import traceback
from dotenv import load_dotenv
import time
import random

from session_manager import manager

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Document Chat AI", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str

def get_or_create_session_id(request: Request, response: Response, session_id: Optional[str] = None) -> str:
    """Enhanced session management with better validation"""
    # Clean up expired sessions periodically (10% chance)
    if random.random() < 0.1:
        cleaned = manager.cleanup_expired_sessions()
        if cleaned > 0:
            logger.info(f"🧹 Cleaned {cleaned} expired sessions")
    
    # Priority: provided session_id → header → cookie → new session
    sources = [
        session_id,
        request.headers.get("X-Session-ID"),
        request.cookies.get("session_id")
    ]
    
    for source_sid in sources:
        if source_sid and manager.validate_session(source_sid):
            logger.info(f"🔄 Using existing session: {source_sid[:8]}")
            return source_sid
    
    # Create new session
    sid = manager.create_session()
    logger.info(f"🆕 NEW SESSION: {sid[:8]}...")
    response.set_cookie(
        key="session_id",
        value=sid,
        max_age=3600,  # 1 hour instead of 7 days
        httponly=True,
        samesite="lax"
    )
    return sid

@app.get("/")
async def root():
    stats = manager.get_session_stats()
    return {
        "status": "ONLINE",
        "message": "Document Chat AI is LIVE on Hugging Face Spaces",
        "sessions": stats['active_sessions'],
        "total_sessions": stats['total_sessions']
    }

@app.post("/session")
async def create_session(response: Response):
    """Create new session"""
    sid = manager.create_session()
    response.set_cookie(
        key="session_id",
        value=sid,
        max_age=3600,
        httponly=True,
        samesite="lax"
    )
    return {"session_id": sid}

@app.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a specific session"""
    try:
        success = manager.delete_session(session_id)
        if success:
            return {"status": "deleted", "session_id": session_id}
        else:
            raise HTTPException(404, "Session not found")
    except Exception as e:
        logger.error(f"❌ Session deletion error: {e}")
        raise HTTPException(500, "Failed to delete session")

@app.get("/session/info")
async def get_session_info(
    session_id: Optional[str] = Query(None),
    request: Request = None,
    response: Response = None
):
    """Get session info"""
    try:
        sid = get_or_create_session_id(request, response, session_id)
        info = manager.get_session_info(sid)
        return info
    except Exception as e:
        logger.error(f"❌ Session info error: {e}")
        return {
            "session_id": "",
            "filename": "",
            "chunk_count": 0,
            "has_documents": False,
            "ready": False
        }

@app.get("/session/stats")
async def get_session_stats():
    """Get session manager statistics"""
    try:
        stats = manager.get_session_stats()
        return stats
    except Exception as e:
        logger.error(f"❌ Session stats error: {e}")
        raise HTTPException(500, "Failed to get session statistics")

@app.post("/session/cleanup")
async def manual_cleanup():
    """Manually trigger session cleanup"""
    try:
        cleaned_count = manager.cleanup_expired_sessions()
        return {
            "status": "cleanup_completed",
            "sessions_removed": cleaned_count,
            "active_sessions": manager.get_session_stats()['active_sessions']
        }
    except Exception as e:
        logger.error(f"❌ Manual cleanup error: {e}")
        raise HTTPException(500, "Cleanup failed")

@app.get("/health")
async def health():
    stats = manager.get_session_stats()
    return {
        "status": "healthy",
        "active_sessions": stats['active_sessions'],
        "total_sessions": stats['total_sessions'],
        "sessions_with_documents": stats['sessions_with_documents'],
        "platform": "Hugging Face Spaces"
    }

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Query(None),
    request: Request = None,
    response: Response = None
):
    """Upload PDF/DOCX/DOC"""
    try:
        sid = get_or_create_session_id(request, response, session_id)
        logger.info(f"📤 UPLOAD → Session: {sid[:8]}... | File: {file.filename}")

        filename = file.filename.lower()
        if not filename or not (filename.endswith('.pdf') or filename.endswith('.docx') or filename.endswith('.doc')):
            raise HTTPException(400, "Only PDF, DOCX, or DOC files allowed")

        content = await file.read()
        if len(content) == 0:
            raise HTTPException(400, "Empty file")
        if len(content) > 50 * 1024 * 1024:
            raise HTTPException(400, "File too large (max 50MB)")

        manager.add_document_to_session(sid, content, file.filename)
        info = manager.get_session_info(sid)
        
        logger.info(f"✅ DOC LOADED: {file.filename} | Chunks: {info.get('chunk_count', 0)}")
        
        return {
            "status": "success",
            "filename": file.filename,
            "session_id": sid,
            "chunks": info.get("chunk_count", 0),
            "ready": info.get("ready", False)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Upload failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(500, f"Upload failed: {str(e)}")

@app.post("/query")
async def query_document(
    request_body: QueryRequest,
    session_id: Optional[str] = Query(None),
    request: Request = None,
    response: Response = None
):
    """Query document"""
    try:
        sid = get_or_create_session_id(request, response, session_id)
        q = request_body.question.strip()
        
        logger.info(f"❓ QUERY → Session: {sid[:8]}... | Q: {q[:60]}...")

        if not q:
            raise HTTPException(400, "Question cannot be empty")

        # Check if session has documents using session info
        session_info = manager.get_session_info(sid)
        if not session_info.get('has_documents'):
            raise HTTPException(400, "No document uploaded yet. Upload one first.")

        answer = manager.query_session(sid, q)
        
        return {
            "response": answer,
            "session_id": sid
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Query error: {e}\n{traceback.format_exc()}")
        raise HTTPException(500, f"Query failed: {str(e)}")

@app.on_event("startup")
async def startup():
    logger.info("\n" + "="*60)
    logger.info("🚀 ENHANCED DOCUMENT CHAT AI IS LIVE ON HUGGING FACE SPACES")
    logger.info("💡 Features: Auto-cleanup • Session limits • Better monitoring")
    logger.info("="*60 + "\n")
    
    # Initial cleanup on startup
    cleaned = manager.cleanup_expired_sessions()
    logger.info(f"🧹 Cleaned up {cleaned} expired sessions on startup")

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 7860))
    logger.info(f"🌐 Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)