import { IsInt, Min, Max } from 'class-validator';

export class CreateCanvasDto {
  @IsInt()
  @Min(1)
  @Max(256)
  width: number;

  @IsInt()
  @Min(1)
  @Max(256)
  height: number;
}
