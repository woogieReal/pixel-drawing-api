import { Controller } from '@nestjs/common';
import { CanvasService } from './canvas.service';

@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}
}
