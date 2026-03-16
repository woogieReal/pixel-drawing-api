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
  pixelData: Buffer;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
