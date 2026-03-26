# Pixel Drawing API

Pixel Drawing 프로젝트를 위한 백엔드 API 서버입니다. NestJS와 PostgreSQL을 기반으로 구축되었습니다.

## 🛠️ 필수 요구 사항

- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) 및 [Docker Compose](https://docs.docker.com/compose/)
- [npm](https://www.npmjs.com/)

## 🚀 프로젝트 실행 방법

본 프로젝트는 상위 `pixel-drawing-app` 루트 디렉토리에서 `docker-compose`를 통하여 프론트엔드 프로젝트와 함께 통합 실행하는 것을 권장합니다.
상세한 실행 방법은 [루트 디렉토리의 README.md](../README.md)를 참고해 주세요.

## 📖 API 문서

상세한 API 명세 및 프론트엔드 연동 방법은 아래 문서를 참고하세요.

- [**API 가이드 (REST & WebSocket)**](./doc/API_가이드.md)

## 🐳 Docker 상세 정보

- **ID**: `pixel-drawing-db`
- **Port**: `5432` (기본값)
- **Image**: `postgres:16-alpine` (Dockerfile.postgres 기반 커스텀 빌드)
- **Volume**: `postgres_data` 볼륨을 통해 컨테이너 삭제 후에도 데이터가 유지됩니다.

## 📄 라이선스

This project is [MIT licensed](LICENSE).
