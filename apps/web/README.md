# PulseWatch

Website and API Monitoring Platform.

PulseWatch is a full-stack monitoring platform designed to
track website availability, API health, response times,
and service incidents.

## Tech Stack

- Next.js
- TypeScript
- Node.js
- Express.js
- PostgreSQL
- Redis
- BullMQ
- Docker

## Architecture

- apps/web: Frontend application
- apps/api: Backend REST API
- packages/shared: Shared TypeScript contracts
- docs: Technical documentation

## Local Setup

### 1. Clone the repository

git clone YOUR_REPOSITORY_URL
cd pulsewatch

### 2. Install dependencies

npm install

### 3. Configure environment

cp .env.example .env

### 4. Start infrastructure

docker compose up -d

### 5. Start applications

npm run dev

Frontend: http://localhost:3000

Backend: http://localhost:5000

Health endpoint:
http://localhost:5000/api/v1/health

## Project Status

Currently under development.
