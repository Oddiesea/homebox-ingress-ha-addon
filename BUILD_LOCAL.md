# Building Locally for Testing

## Quick Start

Since you're on Apple Silicon (arm64), building locally for `aarch64` will be **much faster** than building on GitHub Actions (10-20x faster for the Node.js/Nuxt build step).

```bash
# Build and test locally (auto-detects your architecture)
./test-local.sh
```

This will:
1. Auto-detect your architecture (arm64 → aarch64)
2. Build the Docker image natively (no QEMU emulation = fast!)
3. Test the container by starting it
4. Show you the logs and test the HTTP connection

## Options

### Build for your native architecture (fastest)
```bash
./test-local.sh
```

### Build for a specific architecture
```bash
# Build for amd64 (slower, requires QEMU emulation)
ARCH_OVERRIDE=amd64 ./test-local.sh

# Build for aarch64 (fast on Apple Silicon)
ARCH_OVERRIDE=aarch64 ./test-local.sh
```

## Benefits of Local Building

1. **Much Faster**: Native builds are 10-20x faster than QEMU emulation
2. **No Push Rights Needed**: Builds locally without pushing to any registry
3. **Faster Iteration**: Test changes immediately without waiting for CI
4. **Debug Easier**: Can shell into the container and inspect issues

## Expected Build Time

- **Native aarch64 build on Apple Silicon**: ~5-10 minutes
- **amd64 build with QEMU**: ~30-60 minutes (very slow for Node.js builds)
- **GitHub Actions aarch64**: ~20-40 minutes (slower than native but has more resources)

## Testing Options

### Option 1: Full HA Addon Test (with s6-overlay and bashio)
```bash
./test-local.sh
```

This runs the full addon image with s6-overlay. Note:
- `bashio` commands may show warnings (supervisor not available)
- The service should still start and work
- Good for testing the complete addon setup

### Option 2: Simple Binary Test (faster, no HA dependencies)
```bash
./test-homebox-binary.sh
```

This extracts just the Homebox binary and runs it in a simple Alpine container:
- No s6-overlay or bashio dependencies
- Faster startup
- Good for testing the binary and basic functionality
- **Better for testing the relative path fix**

### Manual Testing

After either script runs, you can:

```bash
# View logs
docker logs -f homebox-test  # (or homebox-simple-test)

# Access the web UI
curl http://localhost:7745

# Shell into the container
docker exec -it homebox-test /bin/sh

# Stop and clean up
docker stop homebox-test && docker rm homebox-test
# (or homebox-simple-test for binary test)
```

## Notes

- The build uses the same Dockerfile as CI, so results should be consistent
- You can modify files and rebuild quickly for testing
- This doesn't push anywhere, so you don't need registry permissions
- **For testing Ingress base path issues**: Use `test-homebox-binary.sh` - it's simpler and will help you test the relative path fix without HA addon complexity

