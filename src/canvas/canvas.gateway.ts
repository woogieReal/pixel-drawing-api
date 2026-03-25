import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CanvasService } from './canvas.service';

@WebSocketGateway({ namespace: '/canvas', cors: true })
export class CanvasGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly canvasService: CanvasService) {}

  /**
   * 클라이언트가 연결될 때 쿼리 스트링에서 canvasId를 추출하여 해당 Room에 조인시킵니다.
   */
  handleConnection(client: Socket) {
    const canvasId = client.handshake.query.canvasId;
    if (canvasId && typeof canvasId === 'string') {
      client.join(`canvas_${canvasId}`);
      console.log(`Client ${client.id} joined canvas room: canvas_${canvasId}`);
    } else {
      console.warn(`Client ${client.id} connected without canvasId.`);
      // 원한다면 canvasId가 없을 때 연결을 끊을 수도 있습니다: client.disconnect();
    }
  }

  /**
   * 5바이트의 바이너리 버퍼(x,y,r,g,b)를 수신받고 DB를 갱신한 뒤,
   * 동일한 캔버스 Room에 속한 다른 클라이언트들에게 브로드캐스트합니다.
   */
  @SubscribeMessage('draw')
  async handleDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: Buffer,
  ) {
    const canvasIdParam = client.handshake.query.canvasId;
    if (!canvasIdParam || typeof canvasIdParam !== 'string') {
      client.emit('error', 'canvasId is required to draw.');
      return;
    }

    const canvasId = parseInt(canvasIdParam, 10);
    
    // 1. 유효성 검사
    if (!Buffer.isBuffer(payload) || payload.length !== 5) {
      client.emit('error', 'Invalid packet structure. Expected 5-byte buffer via binary message.');
      return;
    }

    try {
      // 2. DB 수정 로직 호출
      await this.canvasService.updatePixelRaw(canvasId, payload);

      // 3. 동일한 canvas Room의 다른 클라이언트들에게 변경사항(5바이트) 브로드캐스트
      client.broadcast.to(`canvas_${canvasId}`).emit('pixelUpdated', payload);
    } catch (error: any) {
      client.emit('error', error.message || 'Failed to update pixel.');
      console.error('Draw event error:', error);
    }
  }

  /**
   * 캔버스 크기가 변경되었을 때 전체 클라이언트에게 새 규격을 브로드캐스트합니다.
   */
  broadcastResize(canvasId: number, width: number, height: number, pixelData: string) {
    this.server.to(`canvas_${canvasId}`).emit('canvasResized', {
      width,
      height,
      pixelData,
    });
  }
}
