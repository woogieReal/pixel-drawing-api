import { Controller, Post, Body, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { CreateCanvasDto } from './dto/create-canvas.dto';
import { PaginateCanvasDto } from './dto/paginate-canvas.dto';

@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Get()
  async findAll(@Query() query: PaginateCanvasDto) {
    return this.canvasService.findAll(query.page, query.limit);
  }

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
