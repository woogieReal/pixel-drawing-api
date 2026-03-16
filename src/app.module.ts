import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanvasModule } from './canvas/canvas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'admin'),
        password: configService.get<string>('DB_PASSWORD', 'admin_password'),
        database: configService.get<string>('DB_DATABASE', 'pixel_drawing_db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // 주의: 개발 환경에서만 사용
      }),
    }),
    CanvasModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
