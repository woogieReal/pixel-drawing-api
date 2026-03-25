import { IsString, IsIn, IsInt, Min, Max } from 'class-validator';

export class ResizeCanvasDto {
  @IsString()
  @IsIn(['up', 'down', 'left', 'right'])
  direction: 'up' | 'down' | 'left' | 'right';

  @IsInt()
  @Min(1)
  @Max(50)
  amount: number;
}
