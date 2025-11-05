# Multi-stage: Slimmer build, pre-cache model to avoid runtime download

# Stage 1: Frontend (unchanged, fast)
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
RUN mkdir -p /app/backend/static && cp -r dist/* /app/backend/static/ || true

# Stage 2: Backend (alpine Python for ~50% size reduction)
FROM python:3.12-alpine AS backend
WORKDIR /app/backend
# Install deps + pre-cache embeddings (avoids runtime download)
COPY backend/requirements.txt ./
RUN apk add --no-cache gcc musl-dev && \
    pip install --no-cache-dir -r requirements.txt && \
    python -c "from langchain_huggingface import HuggingFaceEmbeddings; HuggingFaceEmbeddings(model_name='sentence-transformers/all-MiniLM-L6-v2')" && \
    apk del gcc musl-dev  # Clean up
COPY backend/ ./
COPY --from=frontend /app/backend/static /app/static
EXPOSE 8000
HEALTHCHECK CMD curl --fail http://localhost:8000/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]