# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install app-store-scraper without dependencies to avoid conflicts with requests
RUN pip install --upgrade pip && \
    pip install app-store-scraper --no-deps && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY backend/ backend/

# Expose port 8000 for the API
EXPOSE 8000

# Define environment variable
# Define environment variable
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend

# Default command (can be overridden in ECS Task Definition)
# By default, runs the API
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
