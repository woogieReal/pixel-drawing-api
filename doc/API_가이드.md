# Pixel Drawing API — 프론트엔드 연동 가이드

> 기준 서버 주소: `http://localhost:3100` (배포 환경에 따라 변경)

---

## 목차

1. [공통 사항](#1-공통-사항)
2. [REST API](#2-rest-api)
   - [캔버스 생성 — POST /canvas](#21-캔버스-생성--post-canvas)
   - [캔버스 목록 조회 — GET /canvas](#22-캔버스-목록-조회--get-canvas)
   - [캔버스 단건 조회 — GET /canvas/:id](#23-캔버스-단건-조회--get-canvasid)
   - [캔버스 확장 — PATCH /canvas/:id/resize](#24-캔버스-확장--patch-canvasidresize)
3. [WebSocket API](#3-websocket-api)
   - [연결](#31-연결)
   - [픽셀 그리기 — draw 이벤트](#32-픽셀-그리기--draw-이벤트)
   - [픽셀 수신 — pixelUpdated 이벤트](#33-픽셀-수신--pixelupdated-이벤트)
   - [에러 수신 — error 이벤트](#34-에러-수신--error-이벤트)
   - [캔버스 크기 변경 수신 — canvasResized 이벤트](#35-캔버스-크기-변경-수신--canvasresized-이벤트)
4. [픽셀 데이터 해석 방법](#4-픽셀-데이터-해석-방법)
5. [전체 연동 흐름 예시](#5-전체-연동-흐름-예시)
6. [특이사항 및 주의사항](#6-특이사항-및-주의사항)

---

## 1. 공통 사항

| 항목 | 내용 |
|------|------|
| 기본 포트 | `3100` |
| Content-Type | `application/json` |
| 요청 유효성 검사 | 누락되거나 허용되지 않은 필드 포함 시 `400 Bad Request` 반환 |
| WebSocket 라이브러리 | `socket.io-client` (Socket.IO 프로토콜) |
| WebSocket Namespace | `/canvas` |

---

## 2. REST API

### 2.1 캔버스 생성 — `POST /canvas`

새로운 빈 캔버스를 생성합니다. 모든 픽셀은 흰색(RGB: 255, 255, 255)으로 초기화됩니다.

**Request**

```http
POST /canvas
Content-Type: application/json

{
  "width": 64,
  "height": 64
}
```

| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|------|------|------|
| `width` | `number` | ✅ | 1 ~ 256 정수 | 캔버스 가로 픽셀 수 |
| `height` | `number` | ✅ | 1 ~ 256 정수 | 캔버스 세로 픽셀 수 |

**Response `201 Created`**

```json
{
  "canvasId": 1,
  "width": 64,
  "height": 64,
  "pixelData": "////....(Base64)",
  "updatedAt": "2026-03-24T12:00:00.000Z"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `canvasId` | `number` | 캔버스 고유 ID. 이후 WebSocket 연결 및 조회에 사용 |
| `pixelData` | `string` | 전체 픽셀 데이터 (Base64 인코딩된 바이너리). 해석 방법은 [4장](#4-픽셀-데이터-해석-방법) 참고 |

**Error**

| 코드 | 발생 조건 |
|------|----------|
| `400` | width/height 범위 초과, 정수가 아닌 값, 필드 누락 |

---

### 2.2 캔버스 목록 조회 — `GET /canvas`

캔버스 목록을 페이지네이션으로 조회합니다. `pixelData`는 포함되지 않습니다.

**Request**

```http
GET /canvas?page=1&limit=20
```

| 쿼리 파라미터 | 타입 | 기본값 | 제약 | 설명 |
|-------------|------|--------|------|------|
| `page` | `number` | `1` | 최소 1 | 조회할 페이지 번호 |
| `limit` | `number` | `20` | 1 ~ 100 | 페이지당 항목 수 |

**Response `200 OK`**

```json
{
  "items": [
    {
      "canvasId": 1,
      "width": 64,
      "height": 64,
      "updatedAt": "2026-03-24T12:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `items` | `array` | 현재 페이지의 캔버스 목록 |
| `total` | `number` | 전체 캔버스 개수 |
| `page` | `number` | 현재 페이지 번호 |
| `limit` | `number` | 페이지당 항목 수 |
| `totalPages` | `number` | 전체 페이지 수 (`Math.ceil(total / limit)`) |

> **참고**: `items` 배열은 `canvasId` 오름차순으로 정렬됩니다.

**Error**

| 코드 | 발생 조건 |
|------|----------|
| `400` | `limit` > 100, 정수가 아닌 값 |

---

### 2.3 캔버스 단건 조회 — `GET /canvas/:id`

특정 캔버스의 전체 데이터(픽셀 데이터 포함)를 조회합니다.

**Request**

```http
GET /canvas/1
```

**Response `200 OK`**

```json
{
  "canvasId": 1,
  "width": 64,
  "height": 64,
  "pixelData": "////....(Base64)",
  "updatedAt": "2026-03-24T12:00:00.000Z"
}
```

**Error**

| 코드 | 발생 조건 |
|------|----------|
| `404` | 해당 ID의 캔버스가 존재하지 않음 |
| `400` | ID가 정수가 아닌 경우 |


---

### 2.4 캔버스 확장 — `PATCH /canvas/:id/resize`

특정 캔버스의 크기를 지정된 방향으로 확장합니다. 확장된 영역은 흰색(RGB: 255, 255, 255)으로 채워집니다.

**Request**

```http
PATCH /canvas/1/resize
Content-Type: application/json

{
  "direction": "up",
  "amount": 10
}
```

| 필드 | 타입 | 필수 | 제약 | 설명 |
|------|------|------|------|------|
| `direction` | `string` | ✅ | `up`, `down`, `left`, `right` | 확장할 방향 |
| `amount` | `number` | ✅ | 1 ~ 50 정수 | 추가할 픽셀 행/열의 수 |

**Response `200 OK`**

```json
{
  "canvasId": 1,
  "width": 64,
  "height": 74,
  "pixelData": "////....(Base64)",
  "updatedAt": "2026-03-24T12:05:00.000Z"
}
```

**Error**

| 코드 | 발생 조건 |
|------|----------|
| `400` | 확장 후 크기가 256x256을 초과하는 경우, 유효하지 않은 방향, amount 범위 초과 |
| `404` | 해당 ID의 캔버스가 존재하지 않음 |

---

## 3. WebSocket API

라이브러리: [`socket.io-client`](https://socket.io/docs/v4/client-installation/)

```bash
npm install socket.io-client
```

### 3.1 연결

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3100/canvas', {
  query: { canvasId: '1' },   // 필수: 입장할 캔버스 ID (문자열)
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('연결 성공:', socket.id);
});
```

> **⚠️ 중요**: `canvasId`를 전달하지 않으면 해당 캔버스 Room에 입장되지 않아 브로드캐스트를 수신할 수 없습니다.

---

### 3.2 픽셀 그리기 — `draw` 이벤트

**5바이트** 바이너리 패킷을 전송합니다.

| 바이트 위치 | 의미 | 범위 |
|-----------|------|------|
| 0 | x 좌표 | 0 ~ width-1 |
| 1 | y 좌표 | 0 ~ height-1 |
| 2 | R (Red) | 0 ~ 255 |
| 3 | G (Green) | 0 ~ 255 |
| 4 | B (Blue) | 0 ~ 255 |

```javascript
function drawPixel(socket, x, y, r, g, b) {
  const packet = new Uint8Array(5);
  packet[0] = x;
  packet[1] = y;
  packet[2] = r;
  packet[3] = g;
  packet[4] = b;

  socket.emit('draw', packet.buffer); // ArrayBuffer 형태로 전송
}

// 예시: (10, 20) 위치에 빨간색 픽셀 그리기
drawPixel(socket, 10, 20, 255, 0, 0);
```

---

### 3.3 픽셀 수신 — `pixelUpdated` 이벤트

**같은 캔버스에 연결된 다른 클라이언트**가 픽셀을 그리면 수신됩니다. 자신이 보낸 `draw`는 수신되지 않습니다.

```javascript
socket.on('pixelUpdated', (data) => {
  // data는 ArrayBuffer로 수신됨
  const packet = new Uint8Array(data);
  const x = packet[0];
  const y = packet[1];
  const r = packet[2];
  const g = packet[3];
  const b = packet[4];

  // Canvas API로 해당 픽셀을 그리기
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(x, y, 1, 1);
});
```

---

### 3.4 에러 수신 — `error` 이벤트

```javascript
socket.on('error', (message) => {
  console.error('서버 오류:', message);
});
```

| 오류 메시지 | 발생 조건 |
|-----------|----------|
| `"canvasId is required to draw."` | `canvasId` 없이 연결 후 `draw` 이벤트 전송 |
| `"Invalid packet structure. Expected 5-byte buffer via binary message."` | 5바이트가 아닌 패킷 전송 |
| `"좌표가 캔버스 크기를 벗어났습니다."` | x/y가 캔버스 width/height를 초과 |
| `"캔버스 크기는 최대 256x256 입니다."` | 확장 후 크기 제한 초과 |

---

### 3.5 캔버스 크기 변경 수신 — `canvasResized` 이벤트

캔버스 크기가 변경(확장)되면 해당 룸의 **모든 클라이언트**(요청자 포함)에게 브로드캐스트됩니다.

**Payload**

```json
{
  "width": 64,
  "height": 74,
  "pixelData": "////....(신규 전체 Base64 데이터)"
}
```

**클라이언트 대응 가이드**

1.  이벤트를 수신하면 HTML Canvas의 `width`, `height` 속성을 즉시 업데이트합니다.
2.  `pixelData`를 다시 디코딩하여 전체 화면을 재렌더링합니다.
3.  기존 픽셀들의 상대적 위치가 변했을 수 있으므로(특히 `up`, `left` 확장 시), 이후 `draw` 이벤트 전송 시 변경된 규격에 맞춰 좌표를 계산해야 합니다.

---

## 4. 픽셀 데이터 해석 방법

`GET /canvas/:id`의 `pixelData`는 **Base64로 인코딩된 바이너리**입니다.

- 전체 크기: `width × height × 3` 바이트 (각 픽셀 = RGB 3바이트)
- 좌표 `(x, y)`의 픽셀 시작 오프셋: `(y × width + x) × 3`

```javascript
async function loadCanvas(canvasId) {
  const res = await fetch(`http://localhost:3100/canvas/${canvasId}`);
  const { width, height, pixelData } = await res.json();

  // Base64 → Uint8Array 변환
  const binary = atob(pixelData);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }

  // HTMLCanvasElement에 렌더링
  const canvas = document.getElementById('myCanvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 3;   // pixelData 내 오프셋
      const dstOffset = (y * width + x) * 4;   // ImageData는 RGBA (4바이트)
      imageData.data[dstOffset]     = buffer[srcOffset];     // R
      imageData.data[dstOffset + 1] = buffer[srcOffset + 1]; // G
      imageData.data[dstOffset + 2] = buffer[srcOffset + 2]; // B
      imageData.data[dstOffset + 3] = 255;                   // A (불투명)
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
```

> **주의**: 브라우저 Canvas API의 `ImageData`는 픽셀당 **RGBA 4바이트**를 사용합니다. 서버의 `pixelData`는 **RGB 3바이트**이므로 반드시 변환이 필요합니다.

---

## 5. 전체 연동 흐름 예시

```
[초기 진입]
1. GET /canvas              → 캔버스 목록 표시
2. 캔버스 선택
3. GET /canvas/:id          → pixelData 수신 → Canvas API로 초기 화면 렌더링
4. io('/canvas', { query: { canvasId } }) → WebSocket 연결

[실시간 드로잉]
5. 사용자 마우스 클릭 → drawPixel(socket, x, y, r, g, b) → draw 이벤트 전송
6. 다른 사용자의 픽셀 변경 → pixelUpdated 이벤트 수신 → Canvas API로 픽셀 업데이트
```

---

## 6. 특이사항 및 주의사항

### DB 반영 지연 (Write-Behind 캐싱)
WebSocket `draw` 이벤트는 수신 즉시 **메모리 캐시**에 반영되고, DB에는 **약 1초 주기**로 일괄 저장됩니다.

- 실시간 브로드캐스트(`pixelUpdated`)는 지연 없이 즉시 발생합니다.
- `GET /canvas/:id`로 픽셀 데이터를 조회했을 때, 최근 0~1초 이내의 변경사항이 반영되지 않을 수 있습니다.
- 이 때문에 초기 렌더링 이후에는 REST API 재조회보다 **WebSocket 이벤트**로 상태를 유지하는 것을 권장합니다.

### 픽셀 좌표 범위
`draw` 이벤트의 x, y 좌표가 캔버스 크기(width, height)를 벗어나면 서버에서 `error` 이벤트를 반환하고 업데이트는 무시됩니다.

### 자신이 보낸 픽셀은 브로드캐스트로 돌아오지 않음
`draw`를 보낸 클라이언트는 `pixelUpdated`를 수신하지 않습니다 (`broadcast` 방식). FE에서 자체적으로 로컬 Canvas에 즉시 반영해야 합니다.

### 픽셀 데이터 크기
256×256 캔버스 기준 약 **192KB**의 Base64 문자열이 응답됩니다. 목록 조회(`GET /canvas`)에는 `pixelData`가 포함되지 않습니다.
