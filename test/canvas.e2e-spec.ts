import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';

describe('CanvasController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
});
