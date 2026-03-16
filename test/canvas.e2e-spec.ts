import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';

describe('CanvasController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/canvas (POST) - 새로운 빈 캔버스를 생성해야 함', async () => {
    const width = 10;
    const height = 10;
    const response = await request(app.getHttpServer())
      .post('/canvas')
      .send({ width, height })
      .expect(201);

    expect(response.body).toHaveProperty('canvasId');
    expect(response.body.width).toBe(width);
    expect(response.body.height).toBe(height);
    expect(response.body.pixelData).toBeDefined();

    // PostgreSQL의 BYTEA 데이터는 JSON 응답 시 기본적으로 Base64 문자열이나 데이터 배열 객체로 반환됩니다.
    // 데이터가 존재하고 크기가 올바른지 확인합니다.
    // 10x10 RGB의 경우 10 * 10 * 3 = 300바이트여야 합니다.
    if (typeof response.body.pixelData === 'string') {
      // Base64로 인코딩된 문자열인 경우
      const buffer = Buffer.from(response.body.pixelData, 'base64');
      expect(buffer.length).toBe(width * height * 3);
      expect(buffer[0]).toBe(255); // 흰색이어야 함
    } else if (response.body.pixelData.type === 'Buffer' || Array.isArray(response.body.pixelData.data)) {
      // { type: 'Buffer', data: [...] } 형태의 객체로 반환된 경우
      expect(response.body.pixelData.data.length).toBe(width * height * 3);
      expect(response.body.pixelData.data[0]).toBe(255);
    }
  });


  it('/canvas (POST) - 256을 초과하는 크기로 생성 시 400 에러를 반환해야 함', async () => {
    await request(app.getHttpServer())
      .post('/canvas')
      .send({ width: 257, height: 256 })
      .expect(400);
  });

  it('/canvas/:id (GET) - 특정 ID의 캔버스를 조회해야 함', async () => {
    // 1. 먼저 테스트용 캔버스 생성
    const createResponse = await request(app.getHttpServer())
      .post('/canvas')
      .send({ width: 5, height: 5 })
      .expect(201);

    const canvasId = createResponse.body.canvasId;

    // 2. 생성된 ID로 조회
    const getResponse = await request(app.getHttpServer())
      .get(`/canvas/${canvasId}`)
      .expect(200);

    expect(getResponse.body.canvasId).toBe(canvasId);
    expect(getResponse.body.width).toBe(5);
    expect(getResponse.body.height).toBe(5);
    expect(typeof getResponse.body.pixelData).toBe('string'); // Controller에서 Base64 변환됨
  });

  it('/canvas/:id (GET) - 존재하지 않는 ID 조회 시 404를 반환해야 함', async () => {
    await request(app.getHttpServer())
      .get('/canvas/999999')
      .expect(404);
  });
});
