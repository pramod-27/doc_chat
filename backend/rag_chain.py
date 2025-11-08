# backend/rag_chain.py
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_core.prompts import PromptTemplate
import os
import re
from dotenv import load_dotenv
import logging
from typing import List, Dict

load_dotenv()
logger = logging.getLogger(__name__)

def clean_response(text: str) -> str:
    """Remove markdown but keep bullet points and line breaks for readability"""
    if not text:
        return "I apologize, but I couldn't generate a response. Please try again."
    
    # Remove bold, italic, code formatting but KEEP bullet structure
    text = re.sub(r'\*\*\*([^\*]+)\*\*\*', r'\1', text)  # Remove triple asterisks
    text = re.sub(r'\*\*([^\*]+)\*\*', r'\1', text)  # Remove bold
    text = re.sub(r'\*([^\*]+)\*', r'\1', text)  # Remove italic
    text = re.sub(r'\`([^\`]+)\`', r'\1', text)  # Remove inline code
    text = re.sub(r'\#\#\#+ ', '', text)  # Remove headers
    text = re.sub(r'\#\# ', '', text)
    text = re.sub(r'\# ', '', text)
    
    # Clean up excessive whitespace but preserve paragraph structure
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    
    if not text:
        return "I apologize, but my response was empty. Please try rephrasing your question."
    
    return text

def format_conversation_history(history: List[Dict[str, str]]) -> str:
    """Format conversation history for context"""
    if not history:
        return "No previous conversation."
    
    formatted = []
    for i, exchange in enumerate(history, 1):
        formatted.append(f"Previous Q{i}: {exchange['question']}")
        # Keep answer concise for context
        answer_preview = exchange['answer'][:300] + "..." if len(exchange['answer']) > 300 else exchange['answer']
        formatted.append(f"Previous A{i}: {answer_preview}\n")
    
    return "\n".join(formatted)

def create_rag_chain(vectorstore, conversation_history: List[Dict[str, str]] = None):
    """Create RAG chain with conversation history support"""
    try:
        retriever = vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 6}
        )
        
        llm = ChatGroq(
            api_key=os.getenv("GROQ_API_KEY"),
            model="llama-3.1-8b-instant",
            temperature=0.2,
            max_tokens=1024
        )
        
        # Format history once (outside the chain)
        history_text = ""
        if conversation_history and len(conversation_history) > 0:
            history_text = f"\n=== PREVIOUS CONVERSATION ===\n{format_conversation_history(conversation_history)}\n=== END PREVIOUS CONVERSATION ===\n"
        
        # Enhanced template optimized for readability
        template = """  You are a helpful document assistant. Your answers must be clear, concise, scannable, and based mainly on the Document Context.

{conversation_context}

==============================
RESPONSE BEHAVIOR
==============================

1. Your job:
   • Use the Document Context FIRST.
   • If the document provides enough information, answer ONLY using the document.
   • If the document mentions the term but does not explain it, provide a short definition and 1–2 brief bullets of general info (not more).
   • If the document has NO information, reply with a short fallback line.
   • Never invent document details or add unnecessary general explanation.

2. When the question is unrelated to the document:
   • Reply: "I can help only with information from your document. What would you like to know about it?"

3. When no relevant context exists:
   • Reply: "I could not find information about that in the document."

4. Greetings:
   • Reply: "Hi! What would you like to explore in the document?"

==============================
STRICT STRUCTURE RULES
==============================

When the document contains relevant info:
1. Start with a one-line direct answer.
2. Provide 3–6 bullet points with key document details.
3. Keep every bullet 1–2 sentences.
4. One blank line between sections.

When the document *only mentions* the term but lacks detail:
1. Provide a short 1-line definition.
2. Add 1–2 bullets of light, relevant general information.
3. Do NOT exceed 2 general bullets.

When the document contains NO info:
• Only provide the fallback line.
• No bullets unless the fallback line uses a single bullet.

Formatting rules:
• Use bullet character "•" ONLY.
• No markdown symbols: *, **, #, _, >, `, ~.
• Keep responses under ~180–200 words.
• No over-explaining, no filler.

==============================
QUESTION-TYPE HANDLING
==============================

A) Summaries:
   • 2–4 bullets only.

B) Explain / Tell me more:
   • Document details first.
   • Then 1–2 general bullets ONLY IF the document lacks detail.

C) Definitions (“what is”, “who is”):
   • Use document definition if available.
   • If not defined in document:
        - Give a 1-line general definition.
        - Add 1–2 light, helpful bullets only.

D) Pronouns:
   • Resolve using conversation history.
   • If unclear: ask, "What does 'it' refer to?"

==============================
STRICT TRUTHFULNESS RULE
==============================

If the document does not contain a fact, NEVER imply that it does.  
Use general info only for clarification, not to invent missing document content.

==============================
INPUTS
==============================

Document Context:
{context}

Current Question:
{question}

==============================
FINAL OUTPUT RULE
==============================

Provide a clean, structured answer using bullet points.  
Only add small general details when the document lacks explanation.  
Follow ALL rules above.

"""

        prompt = PromptTemplate.from_template(template)
        
        def format_docs(docs):
            if not docs:
                return "No relevant context found in the document."
                
            lines = []
            for doc in docs:
                page = doc.metadata.get('page', '?')
                text = doc.page_content.strip()
                # Keep text readable
                text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
                lines.append(f"[Page {page}] {text}")
            return "\n\n".join(lines)
        
        # Build the chain properly
        rag_chain = (
            {
                "conversation_context": lambda x: history_text,
                "context": lambda x: format_docs(retriever.invoke(x if isinstance(x, str) else x.get("question", x))),
                "question": RunnablePassthrough()
            }
            | prompt
            | llm
            | StrOutputParser()
            | RunnableLambda(clean_response)
        )
        
        logger.info(f"✅ RAG chain created with history: {len(conversation_history) if conversation_history else 0} previous exchanges")
        
        return rag_chain
        
    except Exception as e:
        logger.error(f"❌ Failed to create RAG chain: {e}")
        raise