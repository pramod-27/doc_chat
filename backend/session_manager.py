import uuid
import time
import os
import tempfile
import shutil
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv
import logging
import gc

from pypdf import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.schema import Document
import docx2txt  # Added for DOCX/DOC support

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.timeout = int(os.getenv('SESSION_TIMEOUT', 3600))
        
        logger.info("Initializing SessionManager...")
        
        try:
            self.embeddings = HuggingFaceEmbeddings(
                model_name=os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2'),
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            logger.info("Embeddings loaded")
        except Exception as e:
            logger.error(f"Embeddings failed: {e}")
            raise
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
        )
        
        logger.info("SessionManager ready")

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            'vectorstore': None,
            'filename': None,
            'chunk_count': 0,
            'last_active': time.time(),
            'created_at': time.time()
        }
        logger.info(f"New session: {session_id[:8]}")
        return session_id

    def get_session(self, session_id: str):
        if session_id in self.sessions:
            self.sessions[session_id]['last_active'] = time.time()
            return self.sessions[session_id]
        return None

    def add_document_to_session(self, session_id: str, doc_bytes: bytes, filename: str):
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid session")

        temp_dir = tempfile.mkdtemp()
        temp_path = Path(temp_dir) / filename

        try:
            with open(temp_path, 'wb') as f:
                f.write(doc_bytes)

            docs = []
            if filename.lower().endswith('.pdf'):
                # Existing PDF logic
                reader = PdfReader(str(temp_path))
                for i, page in enumerate(reader.pages):
                    text = page.extract_text() or ""
                    if text.strip():
                        docs.append(Document(
                            page_content=text,
                            metadata={"source": filename, "page": i+1}
                        ))
            else:
                # DOCX/DOC: Extract text with docx2txt (lightweight, accurate)
                text = docx2txt.process(str(temp_path))
                if not text.strip():
                    raise ValueError("No text found in document")
                
                # Split into "pages" approx by 2000-char blocks (or use paragraphs for better structure)
                paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
                page_num = 1
                page_text = []
                for para in paragraphs:
                    page_text.append(para)
                    if len('\n'.join(page_text)) > 1500:  # Chunk-like for metadata
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

            if not docs:
                raise ValueError("No text found in document")

            chunks = self.text_splitter.split_documents(docs)
            logger.info(f"Extracted {len(chunks)} chunks from {filename} ({len(docs)} pages)")

            if session['vectorstore'] is not None:
                try:
                    session['vectorstore'].delete_collection()
                except Exception as e:
                    logger.warning(f"Failed to delete old collection: {e}")

            session['vectorstore'] = Chroma.from_documents(
                documents=chunks,
                embedding=self.embeddings,
                persist_directory=None
            )
            
            session['filename'] = filename
            session['chunk_count'] = len(chunks)

            logger.info(f"DOCUMENT LOADED: {filename} | Chunks: {len(chunks)}")

        except Exception as e:
            logger.error(f"Document processing failed: {e}")
            raise ValueError(f"Failed to process document: {str(e)}")
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
        gc.collect()

    def query_session(self, session_id: str, question: str) -> str:
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid session")
        if not session['vectorstore']:
            raise ValueError("No document uploaded")
        
        from rag_chain import create_rag_chain
        chain = create_rag_chain(session['vectorstore'])
        return chain.invoke(question.strip())

    def get_session_info(self, session_id: str):
        session = self.get_session(session_id)
        if not session:
            raise ValueError("Invalid session")
        return {
            'session_id': session_id,
            'filename': session['filename'] or "",
            'chunk_count': session['chunk_count'],
            'has_documents': session['vectorstore'] is not None,
            'ready': session['vectorstore'] is not None
        }

manager = SessionManager()