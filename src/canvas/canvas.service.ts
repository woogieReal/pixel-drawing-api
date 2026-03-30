import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entities/canvas.entity';
import { CreateCanvasDto } from './dto/create-canvas.dto';
import { ResizeCanvasDto } from './dto/resize-canvas.dto';

const THUMBNAIL_MAX_SIZE = 64;
const THUMBNAIL_FLUSH_INTERVAL_MS = 30_000;

@Injectable()
export class CanvasService implements OnModuleInit, OnModuleDestroy {
  private readonly canvasCache = new Map<number, Canvas>();
  private readonly dirtyCanvasIds = new Set<number>();
  private readonly dirtyThumbnailIds = new Set<number>();
  private flushTimer: NodeJS.Timeout;
  private thumbnailTimer: NodeJS.Timeout;

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

    // 30초마다 dirty 캔버스들의 썸네일 갱신
    this.thumbnailTimer = setInterval(() => this.flushThumbnails(), THUMBNAIL_FLUSH_INTERVAL_MS);
    if (this.thumbnailTimer.unref) {
      this.thumbnailTimer.unref();
    }
  }

  async onModuleDestroy() {
    clearInterval(this.flushTimer);
    clearInterval(this.thumbnailTimer);
    console.log('서버 종료 중... 남은 픽셀 데이터를 DB에 저장합니다.');
    await this.flushThumbnails();
    await this.flushToDatabase();
  }

  /**
   * pixelData(RGB)를 최대 64x64로 nearest-neighbor 다운샘플하여 썸네일 Buffer를 생성합니다.
   * 64보다 작은 캔버스는 원본 크기 그대로 반환합니다.
   */
  private generateThumbnail(canvas: Canvas): Buffer {
    const thumbW = Math.min(canvas.width, THUMBNAIL_MAX_SIZE);
    const thumbH = Math.min(canvas.height, THUMBNAIL_MAX_SIZE);
    const thumb = Buffer.alloc(thumbW * thumbH * 3);

    for (let ty = 0; ty < thumbH; ty++) {
      for (let tx = 0; tx < thumbW; tx++) {
        const sx = Math.floor(tx * canvas.width / thumbW);
        const sy = Math.floor(ty * canvas.height / thumbH);
        const srcOffset = (sy * canvas.width + sx) * 3;
        const dstOffset = (ty * thumbW + tx) * 3;
        thumb[dstOffset]     = canvas.pixelData[srcOffset];
        thumb[dstOffset + 1] = canvas.pixelData[srcOffset + 1];
        thumb[dstOffset + 2] = canvas.pixelData[srcOffset + 2];
      }
    }

    return thumb;
  }

  /**
   * dirtyThumbnailIds에 쌓인 캔버스들의 썸네일을 재생성하고
   * dirtyCanvasIds에 추가하여 다음 DB flush에서 저장되도록 합니다.
   */
  private async flushThumbnails() {
    if (this.dirtyThumbnailIds.size === 0) return;

    const ids = Array.from(this.dirtyThumbnailIds);
    this.dirtyThumbnailIds.clear();

    console.log(`[Thumbnail] ${ids.length}개의 캔버스 썸네일을 갱신합니다.`);

    for (const canvasId of ids) {
      const canvas = this.canvasCache.get(canvasId);
      if (!canvas) continue;

      canvas.thumbnail = this.generateThumbnail(canvas);
      this.dirtyCanvasIds.add(canvasId); // 다음 1초 flush에서 DB에 저장
    }
  }

  /**
   * 마지막 유저가 캔버스 룸에서 나갈 때 즉시 썸네일을 갱신합니다.
   */
  async notifySessionEnd(canvasId: number): Promise<void> {
    if (!this.dirtyThumbnailIds.has(canvasId)) return;

    this.dirtyThumbnailIds.delete(canvasId);

    const canvas = this.canvasCache.get(canvasId);
    if (!canvas) return;

    canvas.thumbnail = this.generateThumbnail(canvas);
    this.dirtyCanvasIds.add(canvasId);
    console.log(`[Thumbnail] 캔버스(ID: ${canvasId}) 세션 종료 - 썸네일 즉시 갱신`);
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
      thumbnail: null,
    });

    const saved = await this.canvasRepository.save(canvas);
    saved.thumbnail = this.generateThumbnail(saved);
    return await this.canvasRepository.save(saved);
  }

  async findAll(page: number, limit: number) {
    const [items, total] = await this.canvasRepository.findAndCount({
      select: ['canvasId', 'width', 'height', 'updatedAt', 'thumbnail'],
      order: { canvasId: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map(item => ({
        canvasId: item.canvasId,
        width: item.width,
        height: item.height,
        updatedAt: item.updatedAt,
        thumbnail: item.thumbnail ? item.thumbnail.toString('base64') : null,
      })),
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

  async resizeCanvas(canvasId: number, dto: ResizeCanvasDto): Promise<Canvas> {
    const { direction, amount } = dto;
    const canvas = await this.findOne(canvasId);

    let newWidth = canvas.width;
    let newHeight = canvas.height;

    if (direction === 'up' || direction === 'down') {
      newHeight += amount;
    } else if (direction === 'left' || direction === 'right') {
      newWidth += amount;
    }

    if (newWidth > 256 || newHeight > 256) {
      throw new BadRequestException(`캔버스 크기는 최대 256x256 입니다. (요청: ${newWidth}x${newHeight})`);
    }

    const newBufferSize = newWidth * newHeight * 3;
    const newPixelData = Buffer.alloc(newBufferSize, 255);

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        let destX = x;
        let destY = y;

        if (direction === 'left') destX += amount;
        if (direction === 'up') destY += amount;

        const srcOffset = (y * canvas.width + x) * 3;
        const destOffset = (destY * newWidth + destX) * 3;

        canvas.pixelData.copy(newPixelData, destOffset, srcOffset, srcOffset + 3);
      }
    }

    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.pixelData = newPixelData;
    canvas.thumbnail = this.generateThumbnail(canvas);

    const savedCanvas = await this.canvasRepository.save(canvas);

    if (this.canvasCache.has(canvasId)) {
      this.canvasCache.set(canvasId, savedCanvas);
    }

    return savedCanvas;
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

    // 4. 썸네일 갱신 대상으로 표시
    this.dirtyThumbnailIds.add(canvasId);
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
