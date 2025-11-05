# Multi-stage: Build frontend → Copy to backend → Run backend (serves static)

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build
# Copy dist to backend static (for serving)
RUN mkdir -p /app/backend/static && cp -r dist/* /app/backend/static/

# Stage 2: Backend
FROM python:3.12-slim AS backend
WORKDIR /app/backend
# Install deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Copy backend code
COPY backend/ ./
# Copy frontend static from stage 1
COPY --from=frontend /app/backend/static /app/static
# Expose port
EXPOSE 8000
# Health check
HEALTHCHECK CMD curl --fail http://localhost:8000/health || exit 1
# Run
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]