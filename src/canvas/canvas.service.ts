import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entities/canvas.entity';
import { CreateCanvasDto } from './dto/create-canvas.dto';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
  ) { }

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

  async findOne(canvasId: number): Promise<Canvas> {
    const canvas = await this.canvasRepository.findOneBy({ canvasId });
    if (!canvas) {
      throw new NotFoundException(`캔버스(ID: ${canvasId})를 찾을 수 없습니다.`);
    }
    return canvas;
  }

  /**
   * WebSocket을 통해 전달받은 5바이트 픽셀 데이터(x, y, r, g, b)를 단일 캔버스에 업데이트하고 DB에 저장합니다.
   * @param canvasId 업데이트할 캔버스 ID
   * @param data 5바이트 버퍼 (x, y, r, g, b)
   */
  async updatePixelRaw(canvasId: number, data: Buffer): Promise<void> {
    if (data.length !== 5) {
      throw new Error('유효하지 않은 패킷 길이입니다. (5바이트 필요)');
    }

    const canvas = await this.findOne(canvasId);

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

    // Buffer 강제 덮어쓰기
    canvas.pixelData.writeUInt8(r, offset);
    canvas.pixelData.writeUInt8(g, offset + 1);
    canvas.pixelData.writeUInt8(b, offset + 2);

    // 변경된 엔티티 저장 (전체 덮어쓰기)
    await this.canvasRepository.save(canvas);
  }
}
