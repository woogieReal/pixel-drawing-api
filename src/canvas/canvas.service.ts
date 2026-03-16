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
}
