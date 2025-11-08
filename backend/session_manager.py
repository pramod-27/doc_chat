import uuid
import time
import os
import tempfile
import shutil
import threading
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path
from dotenv import load_dotenv
import logging
import gc
import psutil
from contextlib import contextmanager

from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.schema import Document
import docx2txt

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

class EnhancedSessionManager:
    """Thread-safe session manager with conversation history support"""
    
    _embeddings_instance = None
    _embeddings_lock = threading.Lock()
    
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.timeout = int(os.getenv('SESSION_TIMEOUT', 1800))
        self.max_sessions = int(os.getenv('MAX_SESSIONS', 50))
        self.cleanup_interval = int(os.getenv('CLEANUP_INTERVAL', 300))
        self.max_history_length = int(os.getenv('MAX_HISTORY_LENGTH', 10))  # Keep last 10 exchanges
        self.lock = threading.RLock()
        self.is_shutting_down = False
        self._cleanup_in_progress = False
        
        logger.info("🚀 Initializing Enhanced SessionManager with Conversation History...")
        
        self._initialize_embeddings()
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        
        self._start_cleanup_thread()
        
        logger.info(f"✅ SessionManager ready | Timeout: {self.timeout}s | Max: {self.max_sessions}")
        logger.info(f"💬 Conversation history enabled | Max length: {self.max_history_length}")

    @contextmanager
    def _safe_lock(self, timeout: float = 5.0):
        """Context manager for safe lock acquisition with timeout"""
        acquired = self.lock.acquire(timeout=timeout)
        if not acquired:
            raise TimeoutError("Failed to acquire lock within timeout")
        try:
            yield
        finally:
            try:
                self.lock.release()
            except RuntimeError:
                pass

    def _initialize_embeddings(self):
        """Initialize embeddings once and reuse across all sessions"""
        with self._embeddings_lock:
            if EnhancedSessionManager._embeddings_instance is None:
                try:
                    logger.info("📦 Loading embedding model (one-time operation)...")
                    
                    model_name = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')
                    cache_folder = os.getenv('TRANSFORMERS_CACHE', '/tmp/models')
                    
                    os.makedirs(cache_folder, exist_ok=True)
                    
                    EnhancedSessionManager._embeddings_instance = HuggingFaceEmbeddings(
                        model_name=model_name,
                        model_kwargs={'device': 'cpu'},
                        encode_kwargs={'normalize_embeddings': True},
                        cache_folder=cache_folder
                    )
                    logger.info("✅ Embeddings loaded and cached successfully")
                except Exception as e:
                    logger.error(f"❌ Critical: Embeddings loading failed: {e}")
                    raise RuntimeError(f"Failed to load embeddings: {e}")
            
            self.embeddings = EnhancedSessionManager._embeddings_instance

    def _start_cleanup_thread(self):
        """Start background thread for periodic session cleanup"""
        def cleanup_worker():
            logger.info("🔄 Background cleanup thread started")
            consecutive_errors = 0
            max_consecutive_errors = 5
            
            while not self.is_shutting_down:
                try:
                    time.sleep(self.cleanup_interval)
                    
                    if self._cleanup_in_progress:
                        logger.debug("⏭️ Cleanup already in progress, skipping")
                        continue
                    
                    self._cleanup_in_progress = True
                    
                    expired_count = self.cleanup_expired_sessions()
                    if expired_count > 0:
                        logger.info(f"🧹 Cleaned {expired_count} expired sessions")
                    
                    self._check_memory_usage()
                    
                    consecutive_errors = 0
                    
                except Exception as e:
                    consecutive_errors += 1
                    logger.error(f"❌ Cleanup thread error ({consecutive_errors}/{max_consecutive_errors}): {e}")
                    
                    if consecutive_errors >= max_consecutive_errors:
                        logger.critical(f"🚨 Cleanup thread failed {max_consecutive_errors} times, stopping")
                        break
                    
                    time.sleep(min(60 * consecutive_errors, 300))
                finally:
                    self._cleanup_in_progress = False
            
            logger.warning("🛑 Background cleanup thread stopped")
        
        cleanup_thread = threading.Thread(
            target=cleanup_worker, 
            daemon=True, 
            name="SessionCleanupWorker"
        )
        cleanup_thread.start()

    def _check_memory_usage(self):
        """Monitor memory and trigger aggressive cleanup if needed"""
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024 * 1024)
            
            if int(time.time()) % 300 == 0:
                logger.info(f"📊 Memory usage: {memory_mb:.2f}MB | Sessions: {len(self.sessions)}")
            
            if memory_mb > 1536:
                logger.warning(f"⚠️ High memory: {memory_mb:.2f}MB - triggering aggressive cleanup")
                self._aggressive_cleanup()
                gc.collect()
                
                new_memory = psutil.Process().memory_info().rss / (1024 * 1024)
                logger.info(f"📉 Memory after cleanup: {new_memory:.2f}MB (freed {memory_mb - new_memory:.2f}MB)")
                
        except Exception as e:
            logger.error(f"Memory check error: {e}")

    def _aggressive_cleanup(self):
        """Aggressively clean up oldest sessions when memory is high"""
        try:
            with self._safe_lock():
                if not self.sessions:
                    logger.info("No sessions to clean")
                    return
                
                sorted_sessions = sorted(
                    self.sessions.items(),
                    key=lambda x: x[1].get('last_active', 0)
                )
                
                sessions_to_remove = max(1, int(len(self.sessions) * 0.4))
                removed_count = 0
                
                for i in range(min(sessions_to_remove, len(sorted_sessions))):
                    session_id, session_data = sorted_sessions[i]
                    if self._safe_delete_session_internal(session_id, session_data):
                        removed_count += 1
                
                logger.info(f"🗑️ Aggressive cleanup: removed {removed_count}/{sessions_to_remove} sessions")
                
        except Exception as e:
            logger.error(f"Aggressive cleanup error: {e}")

    def _enforce_session_limit(self):
        """Enforce maximum session limit by removing oldest sessions"""
        try:
            current_count = len(self.sessions)
            if current_count <= self.max_sessions:
                return
            
            with self._safe_lock():
                if len(self.sessions) <= self.max_sessions:
                    return
                
                sorted_sessions = sorted(
                    self.sessions.items(),
                    key=lambda x: x[1].get('last_active', 0)
                )
                
                sessions_to_remove = len(self.sessions) - self.max_sessions
                removed_count = 0
                
                for i in range(sessions_to_remove):
                    if i < len(sorted_sessions):
                        session_id, session_data = sorted_sessions[i]
                        if self._safe_delete_session_internal(session_id, session_data):
                            removed_count += 1
                
                logger.info(f"📊 Session limit enforced: removed {removed_count} sessions")
                
        except Exception as e:
            logger.error(f"Session limit enforcement error: {e}")

    def _safe_delete_session_internal(self, session_id: str, session_data: Dict[str, Any]) -> bool:
        """Internal method to safely delete a session"""
        try:
            if session_data.get('vectorstore'):
                try:
                    vectorstore = session_data['vectorstore']
                    vectorstore.delete_collection()
                    del session_data['vectorstore']
                    logger.debug(f"🗑️ Deleted vectorstore for {session_id[:8]}")
                except Exception as e:
                    logger.warning(f"⚠️ Vectorstore cleanup failed for {session_id[:8]}: {e}")
            
            if session_id in self.sessions:
                del self.sessions[session_id]
                logger.debug(f"✅ Session deleted: {session_id[:8]}")
                return True
            else:
                logger.debug(f"⚠️ Session {session_id[:8]} already removed")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error deleting session {session_id[:8]}: {e}")
            try:
                if session_id in self.sessions:
                    del self.sessions[session_id]
            except:
                pass
            return False

    def create_session(self) -> str:
        """Create a new session with conversation history support"""
        try:
            self._enforce_session_limit()
            
            with self._safe_lock():
                session_id = str(uuid.uuid4())
                current_time = time.time()
                
                self.sessions[session_id] = {
                    'vectorstore': None,
                    'filename': None,
                    'chunk_count': 0,
                    'last_active': current_time,
                    'created_at': current_time,
                    'access_count': 0,
                    'ready': False,
                    'conversation_history': []  # NEW: Store chat history
                }
                
                logger.info(f"🆕 Session created: {session_id[:8]} | Total: {len(self.sessions)}")
                return session_id
                
        except Exception as e:
            logger.error(f"Failed to create session: {e}")
            raise RuntimeError(f"Session creation failed: {e}")

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session with automatic expiration check"""
        try:
            with self._safe_lock():
                if session_id not in self.sessions:
                    logger.debug(f"Session {session_id[:8]} not found")
                    return None
                
                session = self.sessions[session_id]
                current_time = time.time()
                
                last_active = session.get('last_active', 0)
                if current_time - last_active > self.timeout:
                    logger.info(f"⏰ Session {session_id[:8]} expired (inactive for {int(current_time - last_active)}s)")
                    self._safe_delete_session_internal(session_id, session)
                    return None
                
                session['last_active'] = current_time
                session['access_count'] = session.get('access_count', 0) + 1
                
                return session
                
        except Exception as e:
            logger.error(f"Error getting session {session_id[:8]}: {e}")
            return None

    def validate_session(self, session_id: str) -> bool:
        """Check if session exists and is active"""
        if not session_id:
            return False
        return self.get_session(session_id) is not None

    def add_to_conversation_history(self, session_id: str, question: str, answer: str):
        """Add a Q&A pair to conversation history"""
        try:
            with self._safe_lock():
                if session_id not in self.sessions:
                    logger.warning(f"Cannot add history to non-existent session {session_id[:8]}")
                    return
                
                session = self.sessions[session_id]
                
                # Initialize history if not exists
                if 'conversation_history' not in session:
                    session['conversation_history'] = []
                
                # Add new exchange
                session['conversation_history'].append({
                    'question': question,
                    'answer': answer,
                    'timestamp': time.time()
                })
                
                # Trim history to max length (keep most recent)
                if len(session['conversation_history']) > self.max_history_length:
                    session['conversation_history'] = session['conversation_history'][-self.max_history_length:]
                
                logger.debug(f"💬 Added to history for {session_id[:8]} | Total: {len(session['conversation_history'])}")
                
        except Exception as e:
            logger.error(f"Error adding to conversation history: {e}")

    def get_conversation_history(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, str]]:
        """Get conversation history for a session"""
        try:
            session = self.get_session(session_id)
            if not session:
                return []
            
            history = session.get('conversation_history', [])
            
            if limit:
                return history[-limit:]
            
            return history
            
        except Exception as e:
            logger.error(f"Error getting conversation history: {e}")
            return []

    def clear_conversation_history(self, session_id: str):
        """Clear conversation history for a session"""
        try:
            with self._safe_lock():
                if session_id in self.sessions:
                    self.sessions[session_id]['conversation_history'] = []
                    logger.info(f"🗑️ Cleared conversation history for {session_id[:8]}")
        except Exception as e:
            logger.error(f"Error clearing history: {e}")

    def cleanup_expired_sessions(self) -> int:
        """Remove all expired sessions"""
        expired_sessions: List[Tuple[str, Dict[str, Any]]] = []
        current_time = time.time()
        
        try:
            with self._safe_lock(timeout=2.0):
                for session_id, session_data in list(self.sessions.items()):
                    try:
                        last_active = session_data.get('last_active', 0)
                        if current_time - last_active > self.timeout:
                            expired_sessions.append((session_id, session_data))
                    except Exception as e:
                        logger.warning(f"Error checking session {session_id[:8]}: {e}")
                        expired_sessions.append((session_id, session_data))
            
            if expired_sessions:
                with self._safe_lock():
                    removed_count = 0
                    for session_id, session_data in expired_sessions:
                        if session_id in self.sessions:
                            if self._safe_delete_session_internal(session_id, session_data):
                                removed_count += 1
                    
                    if removed_count > 0:
                        logger.info(f"🧹 Cleaned {removed_count} expired sessions")
                        gc.collect()
                    
                    return removed_count
            
            return 0
            
        except TimeoutError:
            logger.warning("⚠️ Cleanup timeout - will retry next cycle")
            return 0
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
            return 0

    def cleanup_all_sessions(self):
        """Clean up all sessions (for shutdown)"""
        self.is_shutting_down = True
        logger.info("🛑 Cleaning up all sessions for shutdown...")
        
        try:
            with self._safe_lock(timeout=10.0):
                session_ids = list(self.sessions.keys())
                removed_count = 0
                
                for session_id in session_ids:
                    try:
                        session_data = self.sessions.get(session_id)
                        if session_data and self._safe_delete_session_internal(session_id, session_data):
                            removed_count += 1
                    except Exception as e:
                        logger.error(f"Error cleaning session {session_id[:8]}: {e}")
                
                logger.info(f"✅ Cleaned {removed_count}/{len(session_ids)} sessions")
                gc.collect()
                
        except Exception as e:
            logger.error(f"Error during full cleanup: {e}")

    def get_session_stats(self) -> Dict[str, Any]:
        """Get comprehensive session statistics"""
        try:
            current_time = time.time()
            active_sessions = 0
            sessions_with_docs = 0
            total_chunks = 0
            total_history_items = 0
            
            with self._safe_lock(timeout=1.0):
                total_sessions = len(self.sessions)
                
                for session_data in self.sessions.values():
                    try:
                        last_active = session_data.get('last_active', 0)
                        if current_time - last_active <= self.timeout:
                            active_sessions += 1
                            if session_data.get('vectorstore'):
                                sessions_with_docs += 1
                                total_chunks += session_data.get('chunk_count', 0)
                            total_history_items += len(session_data.get('conversation_history', []))
                    except Exception as e:
                        logger.warning(f"Error reading session stats: {e}")
            
            try:
                process = psutil.Process()
                memory_mb = process.memory_info().rss / (1024 * 1024)
            except:
                memory_mb = 0
            
            return {
                'total_sessions': total_sessions,
                'active_sessions': active_sessions,
                'sessions_with_documents': sessions_with_docs,
                'total_chunks_stored': total_chunks,
                'total_conversation_items': total_history_items,
                'session_timeout_minutes': self.timeout // 60,
                'max_sessions': self.max_sessions,
                'memory_usage_mb': round(memory_mb, 2),
                'cleanup_in_progress': self._cleanup_in_progress
            }
            
        except TimeoutError:
            logger.warning("Stats collection timeout")
            return {'error': 'timeout'}
        except Exception as e:
            logger.error(f"Stats collection error: {e}")
            return {'error': str(e)}

    def add_document_to_session(self, session_id: str, doc_bytes: bytes, filename: str):
        """Add document to session and clear conversation history"""
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid or expired session")

        temp_dir = None
        temp_path = None

        try:
            temp_dir = tempfile.mkdtemp(prefix="doc_upload_")
            temp_path = Path(temp_dir) / filename

            with open(temp_path, 'wb') as f:
                f.write(doc_bytes)
            
            logger.info(f"📄 Processing {filename} ({len(doc_bytes)} bytes)")

            docs = self._extract_document_content(temp_path, filename)
            
            if not docs:
                raise ValueError("No text content found in document")

            chunks = self.text_splitter.split_documents(docs)
            logger.info(f"✂️ Split into {len(chunks)} chunks")

            with self._safe_lock():
                if session.get("vectorstore"):
                    try:
                        old_vectorstore = session['vectorstore']
                        old_vectorstore.delete_collection()
                        del session['vectorstore']
                        gc.collect()
                        logger.info(f"🔄 Cleaned old vectorstore for {session_id[:8]}")
                    except Exception as e:
                        logger.warning(f"⚠️ Old vectorstore cleanup warning: {e}")

                try:
                    session['vectorstore'] = Chroma.from_documents(
                        documents=chunks,
                        embedding=self.embeddings,
                        persist_directory=None
                    )
                except Exception as e:
                    logger.error(f"Vectorstore creation failed: {e}")
                    raise ValueError(f"Failed to create vector index: {e}")

                session['filename'] = filename
                session['chunk_count'] = len(chunks)
                session['ready'] = True
                session['last_active'] = time.time()
                
                # Clear conversation history when new document is uploaded
                session['conversation_history'] = []
                logger.info(f"🗑️ Cleared conversation history for new document")

            logger.info(f"✅ Document loaded: {filename} | {len(chunks)} chunks | Session: {session_id[:8]}")

        except Exception as e:
            logger.error(f"❌ Document processing error: {e}")
            
            try:
                with self._safe_lock():
                    session.update({
                        'vectorstore': None,
                        'filename': None,
                        'chunk_count': 0,
                        'ready': False
                    })
            except:
                pass
            
            raise ValueError(f"Failed to process document: {str(e)}")
            
        finally:
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    logger.debug(f"🗑️ Cleaned temp directory: {temp_dir}")
                except Exception as e:
                    logger.warning(f"Temp cleanup warning: {e}")
            
            gc.collect()

    def _extract_document_content(self, file_path: Path, filename: str) -> List[Document]:
        """Extract text content from PDF or DOCX files"""
        docs = []
        
        try:
            if filename.lower().endswith('.pdf'):
                reader = PdfReader(str(file_path))
                total_pages = len(reader.pages)
                logger.info(f"📖 PDF has {total_pages} pages")
                
                for i, page in enumerate(reader.pages):
                    try:
                        text = page.extract_text() or ""
                        if text.strip():
                            docs.append(Document(
                                page_content=text,
                                metadata={"source": filename, "page": i + 1}
                            ))
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to extract page {i + 1}: {e}")
                        continue
                
            else:
                text = docx2txt.process(str(file_path))
                
                if not text or not text.strip():
                    raise ValueError("No text content found in document")

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
            
            logger.info(f"✅ Extracted {len(docs)} document sections")
            
        except Exception as e:
            logger.error(f"Document extraction error: {e}")
            raise ValueError(f"Failed to extract document content: {e}")
        
        return docs

    def query_session(self, session_id: str, question: str) -> str:
        """Query document in session with conversation history context"""
        session = self.get_session(session_id)
        
        if not session:
            raise ValueError("Invalid or expired session")
        
        if not session.get('vectorstore'):
            raise ValueError("No document uploaded. Please upload a document first.")

        try:
            from rag_chain import create_rag_chain
            
            # Get conversation history
            history = self.get_conversation_history(session_id, limit=5)  # Last 5 exchanges
            
            # Create chain with history
            chain = create_rag_chain(session['vectorstore'], conversation_history=history)
            
            with self._safe_lock():
                if session_id in self.sessions:
                    self.sessions[session_id]['last_active'] = time.time()
            
            answer = chain.invoke(question.strip())
            
            # Add to conversation history
            self.add_to_conversation_history(session_id, question, answer)
            
            return answer
            
        except Exception as e:
            logger.error(f"Query execution error: {e}")
            raise ValueError(f"Query failed: {str(e)}")

    def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """Get detailed session information"""
        session = self.get_session(session_id)
        
        if not session:
            return {
                'session_id': '',
                'filename': '',
                'chunk_count': 0,
                'has_documents': False,
                'ready': False,
                'created_at': 0,
                'last_active': 0,
                'access_count': 0,
                'expires_in_seconds': 0,
                'conversation_length': 0,
                'error': 'Session not found or expired'
            }
        
        try:
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
                'expires_in_seconds': int(expires_in),
                'conversation_length': len(session.get('conversation_history', []))
            }
            
        except Exception as e:
            logger.error(f"Error getting session info: {e}")
            return {
                'session_id': session_id,
                'error': str(e)
            }

    def delete_session(self, session_id: str) -> bool:
        """Explicitly delete a specific session"""
        try:
            with self._safe_lock():
                if session_id not in self.sessions:
                    logger.info(f"Session {session_id[:8]} not found for deletion")
                    return False
                
                session_data = self.sessions[session_id]
                success = self._safe_delete_session_internal(session_id, session_data)
                
                if success:
                    gc.collect()
                    logger.info(f"✅ Explicitly deleted session: {session_id[:8]}")
                
                return success
                
        except Exception as e:
            logger.error(f"Error deleting session {session_id[:8]}: {e}")
            return False


logger.info("🔧 Initializing SessionManager singleton...")
try:
    manager = EnhancedSessionManager()
    logger.info("✅ SessionManager initialized successfully")
except Exception as e:
    logger.critical(f"🚨 CRITICAL: Failed to initialize SessionManager: {e}")
    raise