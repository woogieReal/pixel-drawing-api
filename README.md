# Pixel Drawing API

Pixel Drawing 프로젝트를 위한 백엔드 API 서버입니다. NestJS와 PostgreSQL을 기반으로 구축되었습니다.

## 🛠️ 필수 요구 사항

- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) 및 [Docker Compose](https://docs.docker.com/compose/)
- [npm](https://www.npmjs.com/)

## 🚀 프로젝트 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 아래 내용을 설정합니다 (이미 설치 도구로 생성되어 있을 수 있습니다).

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin_password
DB_DATABASE=pixel_drawing_db

# Host port for PostgreSQL (Docker)
POSTGRES_PORT=5432
```

### 3. 데이터베이스(PostgreSQL) 실행

Docker Compose를 사용하여 PostgreSQL 컨테이너를 백그라운드에서 실행합니다.

```bash
docker-compose up -d
```

> **참고**: 터미널 환경에 따라 `docker compose up -d` 명령어를 사용해야 할 수도 있습니다.

### 4. 애플리케이션 실행

```bash
# 개발 모드 (Watch mode)
npm run start:dev

# 실행 확인
# http://localhost:3000
```

## 🐳 Docker 상세 정보

- **ID**: `pixel-drawing-db`
- **Port**: `5432` (기본값)
- **Image**: `postgres:16-alpine` (Dockerfile.postgres 기반 커스텀 빌드)
- **Volume**: `postgres_data` 볼륨을 통해 컨테이너 삭제 후에도 데이터가 유지됩니다.

## 📄 라이선스

This project is [MIT licensed](LICENSE).
