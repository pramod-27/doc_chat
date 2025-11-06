from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import logging
import traceback
from dotenv import load_dotenv

from session_manager import manager

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

"""# Mount static (after middleware)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve index.html as root
@app.get("/{full_path:path}", response_class=FileResponse)
async def serve_static(full_path: str):
    if full_path == "/":
        return FileResponse("static/index.html")
    return FileResponse(f"static/{full_path}")"""

app = FastAPI(title="Document Chat AI", version="1.0.0")

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
    """Auto-create session if missing; prioritize query/header/cookie"""
    if session_id and manager.get_session(session_id):
        return session_id  # Use provided if valid
    
    sid = request.headers.get("X-Session-ID")
    if not sid:
        sid = request.cookies.get("session_id")
    
    if sid and manager.get_session(sid):
        return sid
    
    # Create new session
    sid = manager.create_session()
    logger.info(f"NEW SESSION: {sid[:8]}...")
    response.set_cookie(
        key="session_id",
        value=sid,
        max_age=7*24*3600,
        httponly=True,
        samesite="lax"
    )
    return sid

@app.get("/")
async def root():
    return {
        "status": "ONLINE",
        "message": "Document Chat AI is LIVE",
        "sessions": len(manager.sessions)
    }

@app.post("/session")
async def create_session(response: Response):
    """Create new session"""
    sid = manager.create_session()
    response.set_cookie(
        key="session_id",
        value=sid,
        max_age=7*24*3600,
        httponly=True,
        samesite="lax"
    )
    return {"session_id": sid}

@app.get("/session/info")
async def get_session_info(
    session_id: Optional[str] = Query(None),
    request: Request = None,
    response: Response = None
):
    """Get session info - CRITICAL ENDPOINT"""
    try:
        sid = get_or_create_session_id(request, response, session_id)
        info = manager.get_session_info(sid)
        return info
    except Exception as e:
        logger.error(f"Session info error: {e}")
        # Don't fail - return empty info
        return {
            "session_id": "",
            "filename": "",
            "chunk_count": 0,
            "has_documents": False,
            "ready": False
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
        logger.info(f"UPLOAD → Session: {sid[:8]}... | File: {file.filename}")

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
        
        logger.info(f"DOC LOADED: {file.filename} | Chunks: {info.get('chunk_count', 0)}")
        
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
        logger.error(f"Upload failed: {e}\n{traceback.format_exc()}")
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
        
        logger.info(f"QUERY → Session: {sid[:8]}... | Q: {q[:60]}...")

        if not q:
            raise HTTPException(400, "Question cannot be empty")

        session = manager.get_session(sid)
        if not session or not session.get("vectorstore"):
            raise HTTPException(400, "No document uploaded yet. Upload one first.")

        answer = manager.query_session(sid, q)
        
        return {
            "response": answer,
            "session_id": sid
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query error: {e}\n{traceback.format_exc()}")
        raise HTTPException(500, f"Query failed: {str(e)}")

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "sessions": len(manager.sessions)
    }

@app.on_event("startup")
async def startup():
    logger.info("\n" + "═"*60)
    logger.info("DOCUMENT CHAT AI IS LIVE")
    logger.info("http://localhost:8000")
    logger.info("Upload → Ask → Magic")
    logger.info("═"*60 + "\n")

"""if __name__ == "__main__":
    import uvicorn
    #uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), reload=False)"""

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)
