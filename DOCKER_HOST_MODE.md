# Docker with Host Execution Mode

This branch adds Docker support while maintaining direct host system execution. Agent Zero runs in a Docker container but executes all commands on your host system, giving you the same experience as running locally.

## Features

- ✅ **Host System Execution**: Commands run on your actual system, not in a container
- ✅ **HTTPS Support**: Automatic SSL certificate generation and HTTPS serving
- ✅ **Easy Deployment**: One command to build and run
- ✅ **Full Host Access**: Agent Zero can see and modify your real files
- ✅ **Your Local Execution Preserved**: No SSH or container isolation

## Quick Start

```bash
# 1. Build and run
./docker-run.sh

# 2. Access Agent Zero
# https://localhost or https://YOUR_IP
```

## How It Works

The Docker container:
1. Mounts your entire host filesystem at `/host`
2. Runs with `--privileged` for full system access
3. Uses `network_mode: host` for network transparency
4. Executes all commands directly using your existing code execution tool

## Security Warning

⚠️ **This setup gives Agent Zero FULL HOST ACCESS!**

- Use only on personal development machines
- Do not expose to the internet without proper authentication
- The container can read/write ANY file on your system

## File Structure

```
docker-host-execution/
├── Dockerfile              # Docker image definition
├── docker-compose.yml      # Docker compose configuration
├── generate-ssl.sh         # SSL certificate generator
├── docker-run.sh          # Build and run script
└── DOCKER_HOST_MODE.md    # This file
```

## Customization

### Change Working Directory

Edit `docker-compose.yml`:
```yaml
environment:
  - HOST_HOME=/path/to/your/workspace
```

### Custom SSL Certificate

```bash
./generate-ssl.sh YOUR_IP_ADDRESS
```

### Different Port

Edit `docker-compose.yml`:
```yaml
environment:
  - WEB_UI_PORT=8443  # Your preferred port
```

## Comparison with Upstream

| Feature | Your Version | Upstream |
|---------|--------------|----------|
| Execution | Direct on host | In isolated container |
| File Access | Full host system | Only mounted volumes |
| Security | Less isolated | More isolated |
| Performance | Fast, no overhead | SSH/container overhead |
| Setup | Simple | Complex (SSH, Docker-in-Docker) |

## Troubleshooting

### Certificate Warnings
- Expected for self-signed certificates
- Click "Advanced" → "Proceed" in browser

### Permission Denied
- Ensure Docker runs with proper permissions
- May need to run with `sudo` on some systems

### Port Already in Use
```bash
# Check what's using port 443
sudo lsof -i :443

# Use a different port in docker-compose.yml
```