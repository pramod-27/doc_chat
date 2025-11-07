import uuid
import time
import os
import tempfile
import shutil
import threading
from typing import Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv
import logging
import gc

from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.schema import Document
import docx2txt

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EnhancedSessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.timeout = int(os.getenv('SESSION_TIMEOUT', 3600))  # 1 hour
        self.max_sessions = int(os.getenv('MAX_SESSIONS', 1000))
        self.cleanup_interval = int(os.getenv('CLEANUP_INTERVAL', 300))  # 5 minutes
        self.lock = threading.Lock()
        
        logger.info("🚀 Initializing Enhanced SessionManager...")
        
        try:
            self.embeddings = HuggingFaceEmbeddings(
                model_name=os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2'),
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            logger.info("✅ Embeddings loaded successfully")
        except Exception as e:
            logger.error(f"❌ Embeddings failed: {e}")
            raise
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
        )
        
        # Start background cleanup
        self._start_cleanup_thread()
        
        logger.info(f"✅ SessionManager ready | Timeout: {self.timeout}s | Max sessions: {self.max_sessions}")

    def _start_cleanup_thread(self):
        """Start background thread for session cleanup"""
        def cleanup_worker():
            while True:
                time.sleep(self.cleanup_interval)
                try:
                    expired_count = self.cleanup_expired_sessions()
                    if expired_count > 0:
                        logger.info(f"🧹 Cleaned up {expired_count} expired sessions")
                except Exception as e:
                    logger.error(f"❌ Cleanup thread error: {e}")
        
        cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        cleanup_thread.start()
        logger.info("🔄 Background cleanup thread started")

    def _enforce_session_limit(self):
        """Enforce maximum session limit"""
        if len(self.sessions) <= self.max_sessions:
            return
        
        with self.lock:
            # Remove oldest sessions by last active time
            sorted_sessions = sorted(
                self.sessions.items(),
                key=lambda x: x[1].get('last_active', 0)
            )
            
            sessions_to_remove = len(self.sessions) - self.max_sessions
            for i in range(sessions_to_remove):
                session_id, session_data = sorted_sessions[i]
                self._safe_delete_session(session_id, session_data)
            
            logger.info(f"📊 Enforced session limit: removed {sessions_to_remove} sessions")

    def _safe_delete_session(self, session_id: str, session_data: Dict[str, Any]):
        """Safely delete a session and cleanup resources"""
        try:
            if session_data.get('vectorstore'):
                try:
                    session_data['vectorstore'].delete_collection()
                    logger.debug(f"🗑️ Deleted vectorstore for session {session_id[:8]}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to delete vectorstore: {e}")
            del self.sessions[session_id]
            logger.info(f"✅ Deleted session: {session_id[:8]}")
        except Exception as e:
            logger.error(f"❌ Error deleting session {session_id[:8]}: {e}")

    def create_session(self) -> str:
        """Create a new session with enhanced tracking"""
        self._enforce_session_limit()
        
        with self.lock:
            session_id = str(uuid.uuid4())
            current_time = time.time()
            
            self.sessions[session_id] = {
                'vectorstore': None,
                'filename': None,
                'chunk_count': 0,
                'last_active': current_time,
                'created_at': current_time,
                'access_count': 0,
                'ready': False
            }
            
            logger.info(f"🆕 New session: {session_id[:8]} | Active: {len(self.sessions)}")
        return session_id

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session with automatic expiration check"""
        with self.lock:
            if session_id not in self.sessions:
                return None
            
            session = self.sessions[session_id]
            current_time = time.time()
            
            # Check expiration
            if current_time - session['last_active'] > self.timeout:
                self._safe_delete_session(session_id, session)
                return None
            
            # Update access tracking
            session['last_active'] = current_time
            session['access_count'] = session.get('access_count', 0) + 1
            
            return session

    def validate_session(self, session_id: str) -> bool:
        """Validate if session exists and is active"""
        return self.get_session(session_id) is not None

    def cleanup_expired_sessions(self) -> int:
        """Remove expired sessions and return count cleaned"""
        current_time = time.time()
        expired_sessions = []
        
        with self.lock:
            for session_id, session_data in self.sessions.items():
                last_active = session_data.get('last_active', 0)
                if current_time - last_active > self.timeout:
                    expired_sessions.append((session_id, session_data))
            
            # Remove expired sessions
            for session_id, session_data in expired_sessions:
                self._safe_delete_session(session_id, session_data)
        
        return len(expired_sessions)

    def cleanup_all_sessions(self):
        """Clean up all sessions (for shutdown)"""
        with self.lock:
            session_count = len(self.sessions)
            for session_id, session_data in list(self.sessions.items()):
                self._safe_delete_session(session_id, session_data)
            logger.info(f"🧹 Cleaned up all {session_count} sessions")

    def get_session_stats(self) -> Dict[str, Any]:
        """Get comprehensive session statistics"""
        current_time = time.time()
        active_sessions = 0
        sessions_with_docs = 0
        total_chunks = 0
        
        with self.lock:
            for session_data in self.sessions.values():
                if current_time - session_data.get('last_active', 0) <= self.timeout:
                    active_sessions += 1
                    if session_data.get('vectorstore'):
                        sessions_with_docs += 1
                        total_chunks += session_data.get('chunk_count', 0)
        
        return {
            'total_sessions': len(self.sessions),
            'active_sessions': active_sessions,
            'sessions_with_documents': sessions_with_docs,
            'total_chunks_stored': total_chunks,
            'session_timeout_minutes': self.timeout // 60,
            'max_sessions': self.max_sessions
        }

    def add_document_to_session(self, session_id: str, doc_bytes: bytes, filename: str):
        """Add document to session with enhanced error handling"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid or expired session")

        temp_dir = tempfile.mkdtemp()
        temp_path = Path(temp_dir) / filename

        try:
            # Write file temporarily
            with open(temp_path, 'wb') as f:
                f.write(doc_bytes)

            docs = self._extract_document_content(temp_path, filename)
            
            if not docs:
                raise ValueError("No text content found in document")

            chunks = self.text_splitter.split_documents(docs)
            logger.info(f"📄 Extracted {len(chunks)} chunks from {filename}")

            # Clean up old vectorstore if exists
            if session["vectorstore"] is not None:
                try:
                    session['vectorstore'].delete_collection()
                    logger.info(f"🔄 Cleaned up old vectorstore for session {session_id[:8]}")
                except Exception as e:
                    logger.warning(f"⚠️ Failed to delete old collection: {e}")

            # Create new vectorstore
            session['vectorstore'] = Chroma.from_documents(
                documents=chunks,
                embedding=self.embeddings,
                persist_directory=None
            )

            # Update session metadata
            session['filename'] = filename
            session['chunk_count'] = len(chunks)
            session['ready'] = True
            session['last_active'] = time.time()

            logger.info(f"✅ DOCUMENT LOADED: {filename} | Session: {session_id[:8]} | Chunks: {len(chunks)}")

        except Exception as e:
            logger.error(f"❌ Document processing failed: {e}")
            # Reset session state on failure
            session.update({
                'vectorstore': None,
                'filename': None,
                'chunk_count': 0,
                'ready': False
            })
            raise ValueError(f"Failed to process document: {str(e)}")
        finally:
            # Always clean up temp files
            shutil.rmtree(temp_dir, ignore_errors=True)
            gc.collect()

    def _extract_document_content(self, file_path: Path, filename: str) -> list:
        """Extract text content from different document types"""
        docs = []
        
        if filename.lower().endswith('.pdf'):
            reader = PdfReader(str(file_path))
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    docs.append(Document(
                        page_content=text,
                        metadata={"source": filename, "page": i+1}
                    ))
        else:
            text = docx2txt.process(str(file_path))
            if not text.strip():
                raise ValueError("No text found in document")

            paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
            page_num = 1
            page_text = []
            
            for para in paragraphs:
                page_text.append(para)
                if len('\n'.join(page_text)) > 1500:
                    docs.append(Document(
                        page_content='\n'.join(page_text),
                        metadata={"source": filename, "page": page_num}
                    ))
                    page_text = []
                    page_num += 1

            if page_text:
                docs.append(Document(
                    page_content='\n'.join(page_text),
                    metadata={"source": filename, "page": page_num}
                ))
        
        return docs

    def query_session(self, session_id: str, question: str) -> str:
        """Query session with validation"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid or expired session")
        if not session.get('vectorstore'):
            raise ValueError("No document uploaded. Please upload a document first.")

        from rag_chain import create_rag_chain
        chain = create_rag_chain(session['vectorstore'])
        
        # Update last active time
        session['last_active'] = time.time()
        
        return chain.invoke(question.strip())

    def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """Get comprehensive session information"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid or expired session")
        
        current_time = time.time()
        last_active = session.get('last_active', 0)
        expires_in = max(0, self.timeout - (current_time - last_active))
        
        return {
            'session_id': session_id,
            'filename': session.get('filename', ''),
            'chunk_count': session.get('chunk_count', 0),
            'has_documents': session.get('vectorstore') is not None,
            'ready': session.get('ready', False),
            'created_at': session.get('created_at', 0),
            'last_active': last_active,
            'access_count': session.get('access_count', 0),
            'expires_in_seconds': expires_in
        }

    def delete_session(self, session_id: str) -> bool:
        """Explicitly delete a session"""
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                self._safe_delete_session(session_id, session)
                return True
        return False

# Initialize the enhanced manager
manager = EnhancedSessionManager()