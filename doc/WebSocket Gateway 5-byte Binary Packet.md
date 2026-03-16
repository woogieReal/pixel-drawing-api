# WebSocket Gateway 5-byte Binary Packet Implementation

## 개요
기존 HTTP API와 연결된 `pixel_data (BYTEA)`를 실시간으로 업데이트하기 위해 **WebSocket Gateway**를 구축했습니다. 네트워크 성능 최적화를 위해 JSON 대신 **5바이트 바이너리 패킷**을 사용하도록 설계 및 구현을 완료했습니다.

## 1. 주요 구현 내용

### A. 라이브러리 설치
NestJS 환경에서 WebSocket 통신을 위해 다음 패키지를 설치했습니다.
- `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`

### B. [CanvasGateway](file:///home/woogiereal/projects/pixel-drawing-api/src/canvas/canvas.gateway.ts#12-68) 구현 (`namespace: '/canvas'`)
- **연결 (Connection):**
  클라이언트가 소켓 연결 시 Query Parameter로 전달하는 `canvasId`를 인식하여 `canvas_{id}` 형태의 독립된 소켓 Room에(`client.join`) 입장시킵니다.
- **바이너리 이벤트 수신 (`draw`):**
  수신된 `payload`가 Buffer 객체이고 길이가 정확히 5바이트인지 검증합니다.
- **브로드캐스트:**
  업데이트 성공 시, 동일한 `canvasId` Room 내의 다른 클라이언트들에게 `pixelUpdated` 이벤트를 통해 받은 바이너리 데이터를 그대로 브로드캐스트합니다.

### C. `CanvasService.updatePixelRaw` (바이너리 직접 수정)
성능 하락을 방지하기 위해 새로운 배열을 생성하지 않고, **DB에서 불러온 기존 Buffer(`pixelData`) 인스턴스를 직접 수정**합니다.
- `data.readUInt8()`을 사용해 (x, y, R, G, B) 값을 추출합니다.
- `offset = (y * width + x) * 3` 공식으로 위치를 계산합니다.
- `canvas.pixelData.writeUInt8(color, offset)`을 통해 RGB 값을 덮어쓴 후 DB에 `save()` 합니다.

---

## 2. 검증 프로세스 및 결과

소켓 동작 및 바이너리 패킷 파싱 검증을 위해 **E2E 테스트([test/canvas-gateway.e2e-spec.ts](file:///home/woogiereal/projects/pixel-drawing-api/test/canvas-gateway.e2e-spec.ts))**를 작성하여 성공적으로 마쳤습니다.

### 검증 파이프라인
1. HTTP POST로 새 캔버스를 생성하고 `canvasId`를 발급.
2. `socket.io-client`를 이용해 두 명의 가상 클라이언트(client1, client2)가 해당 캔버스 Room에 연결.
3. `client1`이 5바이트 Buffer(x=5, y=5, Red=255, Green=0, Blue=0)를 생성해 `draw` 이벤트로 전송.
4. `client2`가 `pixelUpdated` 이벤트를 통해 브로드캐스트된 바이너리 데이터를 수신 여부 확인. (ArrayBuffer 수신 및 Buffer 변환 후 파싱 확인 완료)
5. 마지막으로, 실제 DB에 올바른 Offset 위치에 (255, 0, 0) 값이 `writeUInt8`로 저장되었는지 HTTP GET 요청으로 최종 검증.

> **테스트 결과 (성공)**
> ```bash
>  PASS  test/canvas-gateway.e2e-spec.ts
>   CanvasGateway (e2e)
>     WebSocket 연결 및 바이너리 패킷 통신
>       ✓ client1이 바이너리 패킷으로 픽셀을 업데이트하면, client2가 브로드캐스트를 받아야 함 (DB 갱신 포함) (74 ms)
>       ✓ 유효하지 않은 패킷 전송 시 error 이벤트를 발생시켜야 함 (19 ms)
> ```

## 3. 요약
이제 클라이언트는 `/canvas?canvasId={id}`로 WebSocket 연결을 맺은 뒤, `Uint8Array` 형태의 5바이트 배열(x, y, R, G, B)을 `draw` 이벤트로 쏘기만 하면 실시간 픽셀 드로잉 동기화가 이루어집니다.
