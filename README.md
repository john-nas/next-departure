# Next Departure

A public transport web application for viewing current bus departures.

The project uses React, TypeScript, and Vite. It will ultimately read a
one-minute transport snapshot from Oracle Cloud Infrastructure Object Storage
and be deployed as static files.

## Current milestone

The repository contains a minimal React application that builds successfully.
Live transport data and the departure interface will be added in later
checkpoints.

## Prerequisites

- Node.js 24 or newer
- npm
- Git

## Local development

Install the exact dependency versions recorded in `package-lock.json`:

```bash
npm ci