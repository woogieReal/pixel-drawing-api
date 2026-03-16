import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { Canvas } from './entities/canvas.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Canvas])],
  providers: [CanvasService],
  controllers: [CanvasController],
  exports: [CanvasService],
})
export class CanvasModule {}
