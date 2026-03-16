import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entities/canvas.entity';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
  ) {}
}
