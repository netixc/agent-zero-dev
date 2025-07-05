#!/bin/bash

# Agent Zero Auto-Start Setup Script
# This script creates a systemd service to run Agent Zero automatically

echo "Setting up Agent Zero auto-start service..."

# Function to detect conda installation and environment paths
detect_conda_paths() {
    # Try to find conda base directory
    CONDA_BASE=""
    if command -v conda &> /dev/null; then
        CONDA_BASE=$(conda info --base 2>/dev/null)
    fi
    
    # If conda command fails, try common conda locations
    if [ -z "$CONDA_BASE" ]; then
        for possible_path in "/miniconda3" "/anaconda3" "$HOME/miniconda3" "$HOME/anaconda3" "/opt/conda" "/usr/local/anaconda3" "/usr/local/miniconda3"; do
            if [ -d "$possible_path" ]; then
                CONDA_BASE="$possible_path"
                break
            fi
        done
    fi
    
    if [ -z "$CONDA_BASE" ]; then
        echo "Error: Could not find conda installation!"
        echo "Please make sure conda/miniconda/anaconda is installed and accessible."
        exit 1
    fi
    
    # Check if a0 environment exists
    A0_ENV_PATH="$CONDA_BASE/envs/a0"
    if [ ! -d "$A0_ENV_PATH" ]; then
        echo "Error: Conda environment 'a0' not found at $A0_ENV_PATH"
        echo "Please run: conda create -n a0 python=3.12 -y && conda activate a0 && pip install -r requirements.txt"
        exit 1
    fi
    
    # Verify required executables exist
    if [ ! -f "$A0_ENV_PATH/bin/python" ]; then
        echo "Error: Python not found in a0 environment at $A0_ENV_PATH/bin/python"
        exit 1
    fi
    
    echo "✅ Found conda base: $CONDA_BASE"
    echo "✅ Found a0 environment: $A0_ENV_PATH"
    
    # Build the complete PATH with conda paths
    CONDA_PATH="$A0_ENV_PATH/bin:$CONDA_BASE/bin:$CONDA_BASE/condabin"
    echo "✅ Conda PATH: $CONDA_PATH"
}

# Detect conda paths
detect_conda_paths

# Create the systemd service file
cat > /etc/systemd/system/agent-zero.service << EOF
[Unit]
Description=Agent Zero Local Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/root/agent-zero-dev/start_local_agent_zero.sh
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Environment variables (dynamically detected conda paths + standard paths)
Environment=PATH=/root/.local/bin:$CONDA_PATH:/root/.nvm/versions/node/v22.17.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin

[Install]
WantedBy=multi-user.target
EOF

# Make the start script executable (if it isn't already)
chmod +x /root/agent-zero-dev/start_local_agent_zero.sh

# Reload systemd daemon
systemctl daemon-reload

# Enable the service to start on boot
systemctl enable agent-zero.service

# Start the service now
systemctl start agent-zero.service

echo "✅ Agent Zero service has been created and started!"
echo ""
echo "🔧 Service management commands:"
echo "  Start:   systemctl start agent-zero"
echo "  Stop:    systemctl stop agent-zero"
echo "  Restart: systemctl restart agent-zero"
echo "  Status:  systemctl status agent-zero"
echo "  Logs:    journalctl -u agent-zero -f"
echo ""
echo "🚀 The service will now automatically start on boot and restart if it crashes."
echo "📍 Using conda environment: $A0_ENV_PATH"
echo "🌐 Agent Zero should be accessible at: https://localhost:50001"