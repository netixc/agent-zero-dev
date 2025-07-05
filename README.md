**⚠️ Project Notice**

This project is based on [Agent Zero by frdel](https://github.com/frdel/agent-zero).
I have made significant changes to the codebase.
For the original project, documentation, and updates, please visit the [Agent Zero repository](https://github.com/frdel/agent-zero).

# Installation Guide

This guide will help you set up Agent Zero with automatic conda environment detection.

## Prerequisites

- Linux system with systemd
- conda, miniconda, or anaconda installed
- Root or sudo access for systemd service setup


## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/netixc/agent-zero-dev.git
cd agent-zero-dev
```

### 2. Create Conda Environment

```bash
# Create the a0 environment with Python 3.12
conda create -n a0 python=3.12 -y

# Activate the environment
conda activate a0

# Install required dependencies
pip install -r requirements.txt
```

###  Create SSL/HTTPS 

### 1. Create SSL Directory

```bash
mkdir -p ssl
```

**Purpose**: Create a dedicated directory for SSL certificate files.

### 2. Generate Self-Signed SSL Certificate

**Important Edit IP**
```bash
cd /ssl
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=AgentZero/CN=0.0.0.0"
```

**Example**
```
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=AgentZero/CN=192.168.X.X"
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
ls -la
```

**Expected Output**:
```
total 16
drwxrwxr-x+  2 root root 4096 Jul  5 11:35 .
drwxrwxr-x+ 18 root root 4096 Jul  5 11:35 ..
-rw-rw-r--+  1 root root 1992 Jul  5 11:35 cert.pem
-rw-------+  1 root root 3268 Jul  5 11:35 key.pem
```


###  1 Time Run StartUp Command

```
cd ..
sudo ./setup_agent_zero_service.sh
```
