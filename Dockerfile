FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    curl \
    wget \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy your Agent Zero code
COPY . /app/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create SSL directory
RUN mkdir -p /app/ssl

# Expose HTTPS port
EXPOSE 443

# Set environment variables
ENV WEB_UI_HOST=0.0.0.0
ENV WEB_UI_PORT=443
ENV PYTHONUNBUFFERED=1

# Run as root to access host filesystem
USER root

# Start Agent Zero
CMD ["python", "run_ui.py"]