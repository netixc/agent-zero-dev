# SSL/HTTPS Setup Guide for Agent Zero

This guide documents how to enable HTTPS for Agent Zero using self-signed SSL certificates, eliminating mixed content issues and securing the web interface.

## Overview

This setup enables HTTPS for Agent Zero by:
- Generating self-signed SSL certificates
- Modifying the server to automatically detect and use SSL certificates
- Securing all web traffic between browser and Agent Zero
- Eliminating HTTPS/HTTP mixed content errors

## Prerequisites

- Agent Zero installed and working on HTTP
- OpenSSL installed (usually pre-installed on Linux)
- Access to Agent Zero directory (`/agent-zero-dev`)

## Step-by-Step Implementation

### 1. Create SSL Directory

```bash
cd /agent-zero-dev
mkdir -p ssl
```

**Purpose**: Create a dedicated directory for SSL certificate files.

### 2. Generate Self-Signed SSL Certificate

```bash
cd ssl
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=AgentZero/CN=192.168.50.67"
```

**Command Breakdown**:
- `req -x509`: Generate self-signed certificate
- `-newkey rsa:4096`: Create 4096-bit RSA private key
- `-keyout key.pem`: Private key filename
- `-out cert.pem`: Certificate filename  
- `-days 365`: Certificate valid for 1 year
- `-nodes`: No password protection for private key
- `-subj`: Certificate subject information
  - **Important**: Replace `0.0.0.0` with your actual IP address

**Generated Files**:
- `cert.pem`: SSL certificate (public key)
- `key.pem`: Private key (keep secure)

### 3. Verify Certificate Files

```bash
ls -la /agent-zero-dev/ssl/
```

**Expected Output**:
```
total 16
drwxrwxr-x+  2 root root 4096 Jul  5 11:35 .
drwxrwxr-x+ 18 root root 4096 Jul  5 11:35 ..
-rw-rw-r--+  1 root root 1992 Jul  5 11:35 cert.pem
-rw-------+  1 root root 3268 Jul  5 11:35 key.pem
```

### 4. Modify Agent Zero Server Code

Edit `/agent-zero-dev/run_ui.py`:

**Find this section** (around line 221):
```python
server = make_server(
    host=host,
    port=port,
    app=app,
    request_handler=NoRequestLoggingWSGIRequestHandler,
    threaded=True,
)
```

**Replace with**:
```python
# Check if SSL certificates exist
ssl_cert_path = os.path.join(os.path.dirname(__file__), "ssl", "cert.pem")
ssl_key_path = os.path.join(os.path.dirname(__file__), "ssl", "key.pem")

ssl_context = None
if os.path.exists(ssl_cert_path) and os.path.exists(ssl_key_path):
    import ssl
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(ssl_cert_path, ssl_key_path)
    PrintStyle().print(f"SSL certificates found, enabling HTTPS on https://{host}:{port}")
else:
    PrintStyle().print(f"No SSL certificates found, using HTTP on http://{host}:{port}")

server = make_server(
    host=host,
    port=port,
    app=app,
    request_handler=NoRequestLoggingWSGIRequestHandler,
    threaded=True,
    ssl_context=ssl_context,
)
```

**Code Explanation**:
- **Auto-detection**: Automatically checks for SSL certificates
- **Conditional SSL**: Only enables HTTPS if certificates exist
- **Fallback**: Uses HTTP if no certificates found
- **Logging**: Clear indication of HTTP vs HTTPS mode

### 5. Stop Existing Agent Zero Process

```bash
# Find and stop Agent Zero process
pkill -f "python.*run_ui.py"

# Or if Agent Zero is running in a terminal, use Ctrl+C
```

**Important**: Must stop existing process before starting with HTTPS.

### 6. Start Agent Zero with HTTPS

```bash
cd /agent-zero-dev
python run_ui.py
```

**Expected Output**:
```
Initializing framework...
Starting server...
Debug: Registered middleware for MCP and MCP token
Debug: Starting server at 0.0.0.0:50001...
SSL certificates found, enabling HTTPS on https://0.0.0.0:50001
```

### 7. Test HTTPS Access

```bash
# Test HTTPS connectivity (ignore certificate warnings)
curl -k https://0.0.0.0:50001/
```

**Or open in browser**:
- **HTTPS URL**: `https://0.0.0.0:50001`
- **Certificate Warning**: Browser will show security warning (expected for self-signed)
- **Proceed**: Click "Advanced" → "Proceed to [IP] (unsafe)" to continue

## Configuration Details

### SSL Certificate Information

**Certificate Details**:
- **Type**: Self-signed X.509 certificate
- **Key Length**: 4096-bit RSA
- **Validity**: 365 days from creation
- **Subject**: `/C=US/ST=Local/L=Local/O=AgentZero/CN=[YOUR_IP]`

### Server Configuration

**SSL Context Settings**:
```python
ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ssl_context.load_cert_chain(ssl_cert_path, ssl_key_path)
```

**Host/Port Configuration** (in `.env`):
```env
WEB_UI_HOST=0.0.0.0
WEB_UI_PORT=50001
```

## Security Considerations

### Self-Signed Certificate Limitations

**Browser Warnings**:
- ⚠️ Browser will show "Not Secure" or certificate warnings
- ⚠️ Users must manually accept certificate to proceed
- ⚠️ No certificate authority validation

**Security Benefits**:
- ✅ Traffic encrypted between browser and server
- ✅ Prevents man-in-the-middle attacks on local network
- ✅ Eliminates mixed content issues (HTTPS → HTTP blocked)
- ✅ Secure cookie transmission

### Production Alternatives

For production environments, consider:

1. **Let's Encrypt Certificate** (for public domains):
```bash
# Install certbot
sudo apt install certbot

# Generate certificate (requires domain name)
sudo certbot certonly --standalone -d yourdomain.com
```

2. **Internal CA Certificate** (for organizations):
- Set up internal Certificate Authority
- Generate certificates signed by internal CA
- Install CA certificate on client machines

3. **Reverse Proxy with SSL Termination**:
- Use Nginx or Apache as reverse proxy
- Handle SSL termination at proxy level
- Keep Agent Zero on HTTP internally

## Troubleshooting

### Common Issues

1. **Port Already in Use**:
```bash
# Find process using port 50001
lsof -ti :50001

# Kill process if needed
kill -9 $(lsof -ti :50001)
```

2. **Certificate Permission Errors**:
```bash
# Fix certificate permissions
chmod 644 /agent-zero-dev/ssl/cert.pem
chmod 600 /agent-zero-dev/ssl/key.pem
```

3. **Browser Certificate Errors**:
- Click "Advanced" in browser warning
- Select "Proceed to [IP] (unsafe)"
- Or add certificate exception in browser settings

4. **Mixed Content Still Occurring**:
- Verify all external API calls use HTTPS or backend proxy
- Check browser console for blocked HTTP requests
- Ensure all assets loaded over HTTPS

### Verification Commands

**Test SSL Certificate**:
```bash
# Check certificate details
openssl x509 -in /agent-zero-dev/ssl/cert.pem -text -noout

# Test SSL connection
openssl s_client -connect 0.0.0.0:50001 -servername 0.0.0.0
```

**Test HTTPS Response**:
```bash
# Test with curl (ignore certificate)
curl -k -I https://0.0.0.0:50001/

# Expected: HTTP/1.1 200 OK or redirect
```

## Benefits of HTTPS Setup

### Security Improvements
- ✅ **Encrypted Traffic**: All data encrypted in transit
- ✅ **Secure Authentication**: Login credentials encrypted
- ✅ **Session Security**: Secure cookie transmission
- ✅ **Data Integrity**: Prevents traffic modification

### Functional Improvements
- ✅ **No Mixed Content Errors**: HTTPS → HTTPS requests allowed
- ✅ **Modern Browser Features**: Access to secure-only APIs
- ✅ **Service Worker Support**: Enhanced caching and offline features
- ✅ **WebRTC Access**: Required for some media features

### TTS/STT Integration Benefits
- ✅ **Direct API Calls**: Can call HTTPS APIs directly (no proxy needed)
- ✅ **No Browser Blocking**: HTTPS → HTTP requests via backend proxy
- ✅ **Consistent Security**: All traffic uses same security level

## Maintenance

### Certificate Renewal

**Self-signed certificates expire after 365 days**. To renew:

```bash
# Navigate to SSL directory
cd /agent-zero-dev/ssl

# Backup old certificates
mv cert.pem cert.pem.backup
mv key.pem key.pem.backup

# Generate new certificate (update IP if changed)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=AgentZero/CN=0.0.0.0"

# Restart Agent Zero
pkill -f "python.*run_ui.py"
cd /agent-zero-dev
python run_ui.py
```

### Certificate Monitoring

**Check certificate expiration**:
```bash
# View certificate dates
openssl x509 -in /agent-zero-dev/ssl/cert.pem -dates -noout

# Output shows:
# notBefore=Jul  5 11:35:00 2024 GMT
# notAfter=Jul  5 11:35:00 2025 GMT
```

## Quick Reference

### Files Created/Modified

| File | Purpose |
|------|---------|
| `/agent-zero-dev/ssl/cert.pem` | SSL certificate (public key) |
| `/agent-zero-dev/ssl/key.pem` | SSL private key |
| `/agent-zero-dev/run_ui.py` | Modified to support SSL auto-detection |

### Commands Summary

```bash
# 1. Create SSL directory
mkdir -p /agent-zero-dev/ssl

# 2. Generate certificate (replace IP)
cd /agent-zero-dev/ssl
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=AgentZero/CN=YOUR_IP_HERE"

# 3. Stop Agent Zero
pkill -f "python.*run_ui.py"

# 4. Start with HTTPS
cd /root/agent-zero-dev
python run_ui.py
```

### Access URLs

- **HTTP** (before SSL): `http://0.0.0.0:50001`
- **HTTPS** (after SSL): `https://0.0.0.0:50001`

This implementation provides a secure HTTPS setup for Agent Zero that automatically activates when SSL certificates are present, with graceful fallback to HTTP when certificates are unavailable.