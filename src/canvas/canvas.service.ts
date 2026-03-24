import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entities/canvas.entity';
import { CreateCanvasDto } from './dto/create-canvas.dto';

@Injectable()
export class CanvasService implements OnModuleInit, OnModuleDestroy {
  private readonly canvasCache = new Map<number, Canvas>();
  private readonly dirtyCanvasIds = new Set<number>();
  private flushTimer: NodeJS.Timeout;

  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
  ) { }

  onModuleInit() {
    // 1초마다 주기적으로 DB에 덤프 (주기는 상황에 따라 조절 가능)
    this.flushTimer = setInterval(() => this.flushToDatabase(), 1000);
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  async onModuleDestroy() {
    clearInterval(this.flushTimer);
    console.log('서버 종료 중... 남은 픽셀 데이터를 DB에 저장합니다.');
    await this.flushToDatabase();
  }

  async create(createCanvasDto: CreateCanvasDto): Promise<Canvas> {
    const { width, height } = createCanvasDto;

    // 픽셀 데이터 초기화 (RGB 3바이트 * 가로 * 세로)
    // 모든 값을 255(0xFF)로 채워 흰색으로 초기화
    const bufferSize = width * height * 3;
    const pixelData = Buffer.alloc(bufferSize, 255);

    const canvas = this.canvasRepository.create({
      width,
      height,
      pixelData,
    });

    return await this.canvasRepository.save(canvas);
  }

  async findAll(page: number, limit: number) {
    const [items, total] = await this.canvasRepository.findAndCount({
      select: ['canvasId', 'width', 'height', 'updatedAt'],
      order: { canvasId: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(canvasId: number): Promise<Canvas> {
    const canvas = await this.canvasRepository.findOneBy({ canvasId });
    if (!canvas) {
      throw new NotFoundException(`캔버스(ID: ${canvasId})를 찾을 수 없습니다.`);
    }
    return canvas;
  }

  /**
   * WebSocket을 통해 전달받은 5바이트 픽셀 데이터(x, y, r, g, b)를 
   * 메모리 캐시에 먼저 업데이트하고, dirty 플래그를 표시합니다.
   * @param canvasId 업데이트할 캔버스 ID
   * @param data 5바이트 버퍼 (x, y, r, g, b)
   */
  async updatePixelRaw(canvasId: number, data: Buffer): Promise<void> {
    if (data.length !== 5) {
      throw new Error('유효하지 않은 패킷 길이입니다. (5바이트 필요)');
    }

    // 1. 캐시에서 먼저 찾고, 없으면 DB에서 로드
    let canvas = this.canvasCache.get(canvasId);
    if (!canvas) {
      canvas = await this.findOne(canvasId);
      this.canvasCache.set(canvasId, canvas);
    }

    const x = data.readUInt8(0);
    const y = data.readUInt8(1);
    const r = data.readUInt8(2);
    const g = data.readUInt8(3);
    const b = data.readUInt8(4);

    // 좌표 유효성 검사
    if (x >= canvas.width || y >= canvas.height) {
      throw new Error(`좌표가 캔버스 크기를 벗어났습니다. (최대: ${canvas.width - 1}, ${canvas.height - 1})`);
    }

    // Offset 계산 (y * width + x) * 3
    const offset = (y * canvas.width + x) * 3;

    // 2. 메모리 상의 Buffer 업데이트
    canvas.pixelData.writeUInt8(r, offset);
    canvas.pixelData.writeUInt8(g, offset + 1);
    canvas.pixelData.writeUInt8(b, offset + 2);

    // 3. 변경 사항이 있음을 표시 (DB 저장은 flushTimer에서 처리)
    this.dirtyCanvasIds.add(canvasId);
  }

  /**
   * 변경된 캔버스 데이터들을 모아서 DB에 한꺼번에 저장합니다.
   * (테스트 등에서 수동 호출 가능하도록 public으로 공개)
   */
  async flushToDatabase() {
    if (this.dirtyCanvasIds.size === 0) return;

    const idsToFlush = Array.from(this.dirtyCanvasIds);
    this.dirtyCanvasIds.clear(); // 처리 시작 전 비우기 (추가 변경 대비)

    console.log(`[Flush] ${idsToFlush.length}개의 캔버스 변경사항을 DB에 저장합니다.`);

    for (const canvasId of idsToFlush) {
      const canvas = this.canvasCache.get(canvasId);
      if (canvas) {
        try {
          await this.canvasRepository.save(canvas);
        } catch (error) {
          console.error(`캔버스(ID: ${canvasId}) 저장 실패:`, error);
          // 실패 시 다음 주기에 다시 시도하도록 dirty 목록에 다시 추가 고려 가능
          this.dirtyCanvasIds.add(canvasId);
        }
      }
    }
  }
}
