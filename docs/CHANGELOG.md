# Changelog

## Unreleased

First version, built and tested against OpenClaw 2026.10.8.

- Blocks `message` calls whose media-source fields name a remote URL or an unknown scheme.
- Allows local paths, `data:` URIs, base64 buffers and `mxc://` URIs on `mxcServers` (default `matrix.org`).
- Blocks message calls it can't read.
