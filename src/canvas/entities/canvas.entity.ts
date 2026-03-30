import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('canvases')
export class Canvas {
  @PrimaryGeneratedColumn({ name: 'canvas_id' })
  canvasId: number;

  @Column('int')
  width: number;

  @Column('int')
  height: number;

  @Column({ name: 'pixel_data', type: 'bytea' })
  pixelData: Buffer; // 모든 픽셀의 RGB 데이터를 담는 바이너리 버퍼

  @Column({ name: 'thumbnail', type: 'bytea', nullable: true })
  thumbnail: Buffer | null; // 최대 64x64 다운샘플 RGB 썸네일

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
