import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CanvasService } from './canvas.service';

@WebSocketGateway({ namespace: '/canvas', cors: true })
export class CanvasGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // canvasId별 연결된 socketId Set을 직접 추적
  private readonly roomClients = new Map<number, Set<string>>();

  constructor(private readonly canvasService: CanvasService) {}

  /**
   * 클라이언트가 연결될 때 쿼리 스트링에서 canvasId를 추출하여 해당 Room에 조인시킵니다.
   */
  handleConnection(client: Socket) {
    const canvasIdParam = client.handshake.query.canvasId;
    if (canvasIdParam && typeof canvasIdParam === 'string') {
      const canvasId = parseInt(canvasIdParam, 10);
      client.join(`canvas_${canvasId}`);

      if (!this.roomClients.has(canvasId)) {
        this.roomClients.set(canvasId, new Set());
      }
      this.roomClients.get(canvasId)!.add(client.id);

      console.log(`Client ${client.id} joined canvas room: canvas_${canvasId}`);
    } else {
      console.warn(`Client ${client.id} connected without canvasId.`);
    }
  }

  /**
   * 클라이언트가 연결을 끊을 때 호출됩니다.
   * 해당 캔버스 룸에 남은 유저가 없으면 썸네일을 즉시 갱신합니다.
   */
  async handleDisconnect(client: Socket) {
    const canvasIdParam = client.handshake.query.canvasId;
    if (!canvasIdParam || typeof canvasIdParam !== 'string') return;

    const canvasId = parseInt(canvasIdParam, 10);
    const clients = this.roomClients.get(canvasId);
    if (!clients) return;

    clients.delete(client.id);
    console.log(`Client ${client.id} left canvas room: canvas_${canvasId} (남은 유저: ${clients.size})`);

    if (clients.size === 0) {
      this.roomClients.delete(canvasId);
      await this.canvasService.notifySessionEnd(canvasId);
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
