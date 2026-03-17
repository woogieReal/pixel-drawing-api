import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { Canvas } from './entities/canvas.entity';
import { CanvasGateway } from './canvas.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Canvas])],
  providers: [CanvasService, CanvasGateway],
  controllers: [CanvasController],
  exports: [CanvasService],
})
export class CanvasModule {}
