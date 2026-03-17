import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from './../src/app.module';

describe('CanvasGateway (e2e)', () => {
  let app: INestApplication;
  let serverHttpServer: any;
  let canvasId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.listen(0); // 랜덤 포트로 서버 시작
    serverHttpServer = app.getHttpServer();

    // 웹소켓 테스트를 위한 캔버스 생성
    const response = await request(serverHttpServer)
      .post('/canvas')
      .send({ width: 10, height: 10 })
      .expect(201);
    
    canvasId = response.body.canvasId;
  });

  afterAll(async () => {
    if (app) {
      // 1. 데이터베이스 연결 명시적 종료
      const dataSource = app.get(require('typeorm').DataSource);
      if (dataSource && dataSource.isInitialized) {
        await dataSource.destroy();
      }
      // 2. Nest 애플리케이션 종료
      await app.close();
      // 3. 비동기 작업이 완전히 끝날 수 있도록 아주 짧은 대기 시간을 줍니다.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  describe('WebSocket 연결 및 바이너리 패킷 통신', () => {
    let clientSocket1: Socket;
    let clientSocket2: Socket;

    beforeEach((done) => {
      const port = serverHttpServer.address().port;
      const url = `http://localhost:${port}/canvas?canvasId=${canvasId}`;

      clientSocket1 = io(url, { transports: ['websocket'] });
      clientSocket2 = io(url, { transports: ['websocket'] });

      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 2) done();
      };

      clientSocket1.on('connect', checkDone);
      clientSocket2.on('connect', checkDone);
    });

    afterEach(() => {
      clientSocket1.disconnect();
      clientSocket2.disconnect();
    });

    it('client1이 바이너리 패킷으로 픽셀을 업데이트하면, client2가 브로드캐스트를 받아야 함 (DB 갱신 포함)', (done) => {
      const x = 5;
      const y = 5;
      const r = 255;
      const g = 0;
      const b = 0; // Red 색상

      // 5바이트 패킷 생성
      const payload = Buffer.alloc(5);
      payload.writeUInt8(x, 0);
      payload.writeUInt8(y, 1);
      payload.writeUInt8(r, 2);
      payload.writeUInt8(g, 3);
      payload.writeUInt8(b, 4);

      // client2는 브로드캐스트를 기다림
      clientSocket2.on('pixelUpdated', async (data: ArrayBuffer) => {
        // socket.io-client는 Buffer를 ArrayBuffer로 수신할 수 있음
        const receivedBuffer = Buffer.from(data);
        
        expect(receivedBuffer.length).toBe(5);
        expect(receivedBuffer.readUInt8(0)).toBe(x);
        expect(receivedBuffer.readUInt8(1)).toBe(y);
        expect(receivedBuffer.readUInt8(2)).toBe(r);
        expect(receivedBuffer.readUInt8(3)).toBe(g);
        expect(receivedBuffer.readUInt8(4)).toBe(b);

        // 실제 DB에 반영되었는지 REST API로 검증
        const getResponse = await request(serverHttpServer)
          .get(`/canvas/${canvasId}`)
          .expect(200);

        // 응답은 Base64
        const dbPixelData = Buffer.from(getResponse.body.pixelData, 'base64');
        
        // Offset 계산 = (y * width + x) * 3 = (5 * 10 + 5) * 3 = 165
        const offset = (5 * 10 + 5) * 3;
        
        expect(dbPixelData.readUInt8(offset)).toBe(255); // R
        expect(dbPixelData.readUInt8(offset + 1)).toBe(0); // G
        expect(dbPixelData.readUInt8(offset + 2)).toBe(0); // B

        done();
      });

      // client1이 draw 이벤트 발생
      clientSocket1.emit('draw', payload);
    });
    
    it('유효하지 않은 패킷 전송 시 error 이벤트를 발생시켜야 함', (done) => {
      // 3바이트 크기의 잘못된 패킷
      const invalidPayload = Buffer.alloc(3);

      clientSocket1.on('error', (errMsg) => {
        expect(errMsg).toContain('Invalid packet structure');
        done();
      });

      clientSocket1.emit('draw', invalidPayload);
    });
  });
});
