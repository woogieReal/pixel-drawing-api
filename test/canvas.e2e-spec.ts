import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';

describe('CanvasController (e2e)', () => {
  let app: INestApplication;

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
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      // 데이터베이스 연결을 명시적으로 닫아 프로세스가 남는 것을 방지합니다.
      const dataSource = app.get(require('typeorm').DataSource);
      if (dataSource && dataSource.isInitialized) {
        await dataSource.destroy();
      }
      await app.close();
    }
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

  it('/canvas (GET) - 캔버스 목록을 페이지네이션으로 조회해야 함', async () => {
    // 1. 테스트용 캔버스 5개 생성
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/canvas')
        .send({ width: i + 2, height: i + 2 })
        .expect(201);
    }

    // 2. 첫 페이지 조회 (limit=3)
    const response = await request(app.getHttpServer())
      .get('/canvas?page=1&limit=3')
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('limit', 3);
    expect(response.body).toHaveProperty('totalPages');

    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBe(3);
    expect(response.body.total).toBeGreaterThanOrEqual(5);
    expect(response.body.totalPages).toBe(Math.ceil(response.body.total / 3));

    // 3. 각 항목에 pixelData 없고 필수 필드 있어야 함
    const item = response.body.items[0];
    expect(item).toHaveProperty('canvasId');
    expect(item).toHaveProperty('width');
    expect(item).toHaveProperty('height');
    expect(item).toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('pixelData');

    // 4. canvasId 오름차순 정렬 확인
    for (let i = 1; i < response.body.items.length; i++) {
      expect(response.body.items[i].canvasId).toBeGreaterThanOrEqual(response.body.items[i - 1].canvasId);
    }
  });

  it('/canvas (GET) - 두 번째 페이지를 조회하면 다른 항목이 반환돼야 함', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/canvas?page=1&limit=2')
      .expect(200);

    const page2 = await request(app.getHttpServer())
      .get('/canvas?page=2&limit=2')
      .expect(200);

    // 두 페이지의 canvasId가 겹치지 않아야 함
    const ids1 = page1.body.items.map((i: any) => i.canvasId);
    const ids2 = page2.body.items.map((i: any) => i.canvasId);
    expect(ids1.some((id: number) => ids2.includes(id))).toBe(false);
    expect(page2.body.page).toBe(2);
  });

  it('/canvas (GET) - limit이 100을 초과하면 400을 반환해야 함', async () => {
    await request(app.getHttpServer())
      .get('/canvas?page=1&limit=101')
      .expect(400);
  });

  describe('PATCH /canvas/:id/resize', () => {
    let canvasId: number;

    beforeAll(async () => {
      // Create a 5x5 canvas for resize tests
      const res = await request(app.getHttpServer())
        .post('/canvas')
        .send({ width: 5, height: 5 })
        .expect(201);
      canvasId = res.body.canvasId;
    });

    it('should successfully resize canvas to the right', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/canvas/${canvasId}/resize`)
        .send({ direction: 'right', amount: 3 })
        .expect(200);

      expect(res.body.canvasId).toBe(canvasId);
      expect(res.body.width).toBe(8); // 5 + 3 = 8
      expect(res.body.height).toBe(5);
      expect(res.body.pixelData).toBeDefined();

      const buffer = Buffer.from(res.body.pixelData, 'base64');
      expect(buffer.length).toBe(8 * 5 * 3); // 120 bytes
    });

    it('should successfully resize canvas down', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/canvas/${canvasId}/resize`)
        .send({ direction: 'down', amount: 2 })
        .expect(200);

      expect(res.body.width).toBe(8);
      expect(res.body.height).toBe(7); // 5 + 2 = 7
      
      const buffer = Buffer.from(res.body.pixelData, 'base64');
      expect(buffer.length).toBe(8 * 7 * 3);
    });

    it('should return 400 when amount exceeds maximum limit', async () => {
      await request(app.getHttpServer())
        .patch(`/canvas/${canvasId}/resize`)
        .send({ direction: 'right', amount: 51 }) // Max is 50
        .expect(400);
    });

    it('should return 400 when total size exceeds 256x256', async () => {
      // First create a 250x250 canvas
      const largeCanvasRes = await request(app.getHttpServer())
        .post('/canvas')
        .send({ width: 250, height: 250 })
        .expect(201);
      const largeCanvasId = largeCanvasRes.body.canvasId;

      await request(app.getHttpServer())
        .patch(`/canvas/${largeCanvasId}/resize`)
        .send({ direction: 'up', amount: 10 }) // 250 + 10 = 260 (>256)
        .expect(400);
    });

    it('should return 400 for invalid direction', async () => {
      await request(app.getHttpServer())
        .patch(`/canvas/${canvasId}/resize`)
        .send({ direction: 'diagonal', amount: 5 })
        .expect(400);
    });
  });
});
