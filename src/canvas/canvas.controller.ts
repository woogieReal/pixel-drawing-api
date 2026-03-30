import { Controller, Post, Body, Get, Param, ParseIntPipe, Query, Patch, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { CreateCanvasDto } from './dto/create-canvas.dto';
import { PaginateCanvasDto } from './dto/paginate-canvas.dto';
import { ResizeCanvasDto } from './dto/resize-canvas.dto';
import { CanvasGateway } from './canvas.gateway';

@Controller('canvas')
export class CanvasController {
  constructor(
    private readonly canvasService: CanvasService,
    private readonly canvasGateway: CanvasGateway,
  ) {}

  @Get()
  async findAll(@Query() query: PaginateCanvasDto) {
    return this.canvasService.findAll(query.page, query.limit);
  }

  @Post()
  async create(@Body() createCanvasDto: CreateCanvasDto) {
    const canvas = await this.canvasService.create(createCanvasDto);
    return {
      canvasId: canvas.canvasId,
      width: canvas.width,
      height: canvas.height,
      pixelData: canvas.pixelData.toString('base64'),
      updatedAt: canvas.updatedAt,
    };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const canvas = await this.canvasService.findOne(id);
    return {
      canvasId: canvas.canvasId,
      width: canvas.width,
      height: canvas.height,
      pixelData: canvas.pixelData.toString('base64'),
      updatedAt: canvas.updatedAt,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.canvasService.remove(id);
    this.canvasGateway.broadcastDelete(id);
  }

  @Patch(':id/resize')
  async resize(
    @Param('id', ParseIntPipe) id: number,
    @Body() resizeCanvasDto: ResizeCanvasDto,
  ) {
    const canvas = await this.canvasService.resizeCanvas(id, resizeCanvasDto);
    const pixelData = canvas.pixelData.toString('base64');
    
    // 웹소켓을 통해 변경사항 브로드캐스트
    this.canvasGateway.broadcastResize(id, canvas.width, canvas.height, pixelData);

    return {
      canvasId: canvas.canvasId,
      width: canvas.width,
      height: canvas.height,
      pixelData: pixelData,
      updatedAt: canvas.updatedAt,
    };
  }
}
