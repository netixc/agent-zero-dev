#!/bin/bash

# Generate SSL certificates if they don't exist
if [ ! -f ssl/cert.pem ] || [ ! -f ssl/key.pem ]; then
    echo "Generating SSL certificates..."
    ./generate-ssl.sh
fi

# Build Docker image
echo "Building Docker image..."
docker-compose build

# Run with host access
echo "Starting Agent Zero with host access..."
docker-compose up -d

echo ""
echo "==================================="
echo "Agent Zero is running with host access!"
echo "==================================="
echo ""
echo "Access at: https://localhost or https://$(hostname -I | awk '{print $1}')"
echo ""
echo "IMPORTANT: Commands will execute on your HOST system, not in the container"
echo "Both you and Agent Zero will see the same files and directories"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"