import { Controller, Post, Body, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { CreateCanvasDto } from './dto/create-canvas.dto';

@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Post()
  async create(@Body() createCanvasDto: CreateCanvasDto) {
    const canvas = await this.canvasService.create(createCanvasDto);
    return {
      ...canvas,
      pixelData: canvas.pixelData.toString('base64'),
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const canvas = await this.canvasService.findOne(id);
    return {
      ...canvas,
      pixelData: canvas.pixelData.toString('base64'),
    };
  }
}
