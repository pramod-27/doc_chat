# backend/rag_chain.py
from langchain_groq import ChatGroq
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import PromptTemplate
import os
import re
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)

def clean_response(text: str) -> str:
    """Remove ALL markdown junk — asterisks, hashes, backticks, etc."""
    if not text:
        return "I apologize, but I couldn't generate a response. Please try again."
    
    text = re.sub(r'\*\*|\*|\#|\`|\_|\~|\>|\|', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)  # Remove extra newlines
    text = text.strip()
    
    # Ensure response isn't empty after cleaning
    if not text:
        return "I apologize, but my response was empty. Please try rephrasing your question."
    
    return text

def create_rag_chain(vectorstore):
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
        
        template = """You are a helpful document assistant. You help users understand and explore the content of their uploaded document (PDF, DOCX, or DOC).

Analyze the question carefully before responding:

- If the question is a greeting (e.g., "hi", "hello", "how are you?") or casual chit-chat unrelated to the document, respond briefly and warmly: "Hi! Ready to dive into your document—what's your question?" Then stop. Do not elaborate or repeat greetings.

- If the question is completely unrelated to the document (e.g., general knowledge, weather, news), respond politely once: "I specialize in your uploaded document. What would you like to know about it?" Do not greet or add fluff.

- If the question is about the document but no relevant context is found, say directly: "Based on the document, I couldn't find info on that. Try rephrasing or ask about a specific section."

- For any document-related question: Start your response IMMEDIATELY with the key answer or summary. Use ONLY the provided context—never add outside knowledge. Be concise, factual, and structured. If needed, end with a brief follow-up prompt like "Need more details on this?" but only if it adds value.

Do NOT start responses with greetings, introductions, or "I'm here to help" unless the query is explicitly a greeting. Jump straight to the value.

Rules:
- NEVER use **, *, #, `, _, ~, >, or any markdown.
- Use simple bullet points with "•" only for lists.
- Be clear, direct, and professional—concise (under 250 words).
- One blank line between major sections only.
- Always base answers on context; if unclear, ask for clarification briefly.

Context:
{context}

Question: {question}

Response:"""

        prompt = PromptTemplate.from_template(template)
        
        def format_docs(docs):
            if not docs:
                return "No relevant context found in the document."
                
            lines = []
            for doc in docs:
                page = doc.metadata.get('page', '?')
                text = doc.page_content.strip()
                # Strip all formatting from source
                text = re.sub(r'\*\*|\*|\#|\`|\_|\~|\>|\|', '', text)
                lines.append(f"• Page {page}: {text}")
            return "\n".join(lines)
        
        rag_chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt
            | llm
            | StrOutputParser()
            | clean_response  # FINAL CLEANER
        )
        
        return rag_chain
        
    except Exception as e:
        logger.error(f"❌ Failed to create RAG chain: {e}")
        raise