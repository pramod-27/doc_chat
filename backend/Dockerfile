FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for caching)
COPY requirements.txt .

# Install Python dependencies with specific versions
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create directories for cache and temp files
RUN mkdir -p /tmp/models /tmp/chroma && \
    chmod 777 /tmp/models /tmp/chroma

# Set environment variables for better memory management
ENV PYTHONUNBUFFERED=1
ENV TOKENIZERS_PARALLELISM=false
ENV TRANSFORMERS_CACHE=/tmp/models
ENV HF_HOME=/tmp/models
ENV CHROMA_PERSIST_DIRECTORY=/tmp/chroma

# Expose Hugging Face Spaces default port
EXPOSE 7860

# Health check with longer timeout
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:7860/health', timeout=10)"

# Run the application with uvicorn directly for better control
CMD ["python", "-u", "app.py"]