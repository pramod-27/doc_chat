# Multi-stage: Compatible slim base, prune for speed

# Stage 1: Frontend (fast, unchanged)
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
RUN mkdir -p /app/backend/static && cp -r dist/* /app/backend/static/ || true

# Stage 2: Backend (debian-slim for dep compatibility + pruning)
FROM python:3.12-slim AS backend
WORKDIR /app/backend
# Install deps with pruning (smaller layers)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip cache purge  # Clear pip cache to shrink image
# Pre-cache embeddings (avoids runtime download)
RUN python -c "from langchain_huggingface import HuggingFaceEmbeddings; HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2')"
COPY backend/ ./
COPY --from=frontend /app/backend/static /app/static
EXPOSE 8000
HEALTHCHECK CMD curl --fail http://localhost:8000/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]