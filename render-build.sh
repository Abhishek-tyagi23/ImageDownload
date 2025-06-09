#!/usr/bin/env bash
set -o errexit

npm install

# Ensure Puppeteer cache directory exists
export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p "$PUPPETEER_CACHE_DIR"

# Download Chromium for Puppeteer
npx puppeteer browsers install chrome
