#!/bin/bash

# Get IP address (you can modify this)
IP_ADDRESS=$(hostname -I | awk '{print $1}')

# Allow user to specify IP as argument
if [ ! -z "$1" ]; then
    IP_ADDRESS=$1
fi

# Create SSL directory
mkdir -p ssl

# Generate certificate
openssl req -x509 -newkey rsa:4096 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=Local/L=Local/O=AgentZero/CN=$IP_ADDRESS"

# Set permissions
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem

echo "SSL certificates generated for IP: $IP_ADDRESS"
echo "To use a different IP, run: ./generate-ssl.sh YOUR_IP"