# Agent Zero Installation Guide

This guide will help you set up Agent Zero with automatic conda environment detection.

## Prerequisites

- Linux system with systemd
- conda, miniconda, or anaconda installed
- Root or sudo access for systemd service setup

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
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

### 3. Setup System Service

The setup script will automatically detect your conda installation and create a systemd service:

```bash
# Run the setup script (requires root/sudo)
sudo ./setup_agent_zero_service.sh
```

The script will:
- ✅ Automatically detect conda/miniconda/anaconda installation
- ✅ Verify the 'a0' environment exists
- ✅ Create systemd service with proper PATH configuration
- ✅ Enable auto-start on boot
- ✅ Start the service immediately

### 4. Verify Installation

Check that the service is running:

```bash
systemctl status agent-zero
```

View logs:

```bash
journalctl -u agent-zero -f
```

## Supported Conda Installations

The setup script automatically detects conda installations in these locations:

- `/miniconda3` (standard miniconda)
- `/anaconda3` (standard anaconda)
- `$HOME/miniconda3` (user miniconda)
- `$HOME/anaconda3` (user anaconda)
- `/opt/conda` (system conda)
- `/usr/local/anaconda3` (system anaconda)
- `/usr/local/miniconda3` (system miniconda)

## Service Management

Once installed, you can manage the service with:

```bash
# Start the service
sudo systemctl start agent-zero

# Stop the service
sudo systemctl stop agent-zero

# Restart the service
sudo systemctl restart agent-zero

# Check status
sudo systemctl status agent-zero

# View logs
sudo journalctl -u agent-zero -f

# Disable auto-start
sudo systemctl disable agent-zero

# Enable auto-start
sudo systemctl enable agent-zero
```

## Troubleshooting

### Service Won't Start

1. Check if the 'a0' conda environment exists:
   ```bash
   conda env list
   ```

2. Verify dependencies are installed:
   ```bash
   conda activate a0
   pip install -r requirements.txt
   ```

3. Check service logs:
   ```bash
   journalctl -u agent-zero -f
   ```

### Browser Agent Issues

If you encounter Playwright/browser issues:

1. Ensure Playwright is installed in the a0 environment:
   ```bash
   conda activate a0
   pip install playwright
   python -m playwright install
   ```

2. The setup script automatically includes the conda environment in PATH for Playwright access.

### Environment Detection Issues

If the setup script can't find your conda installation:

1. Make sure conda is in your PATH:
   ```bash
   which conda
   ```

2. If conda is in a non-standard location, you can manually edit the script to add your path to the `possible_path` array.

## Manual Configuration

If you need to customize the installation, you can manually edit:

- Service file: `/etc/systemd/system/agent-zero.service`
- Setup script: `./setup_agent_zero_service.sh`

After making changes, reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart agent-zero
```

## Uninstallation

To remove Agent Zero:

```bash
# Stop and disable the service
sudo systemctl stop agent-zero
sudo systemctl disable agent-zero

# Remove the service file
sudo rm /etc/systemd/system/agent-zero.service

# Reload systemd
sudo systemctl daemon-reload

# Remove conda environment (optional)
conda env remove -n a0
```