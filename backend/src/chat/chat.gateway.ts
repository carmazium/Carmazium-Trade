import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AuthService } from '../auth/auth.service';
import { WsMessageDto, WsTypingDto, WsRoomIdDto } from './dto';
import { WS_CORS } from '../core/allowed-origins';

@WebSocketGateway({
    cors: WS_CORS,
    namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    private connectedUsers: Map<string, string[]> = new Map();
    private static readonly MAX_SOCKETS_PER_USER = 5;

    constructor(
        private readonly chatService: ChatService,
        private readonly authService: AuthService,
    ) { }

    afterInit(): void {
        this.logger.log('Chat WebSocket Gateway initialized');
    }

    async handleConnection(client: Socket): Promise<void> {
        try {
            const req = client.request as any;
            let userId = req?.session?.userId as string | undefined;

            // A cookie proves possession of a session, not that the account is
            // still valid. Revalidate it so deleted/role-changed accounts do not
            // retain a WebSocket connection after HTTP access has been revoked.
            if (userId) {
                const user = await this.authService.validateSession(userId);
                if (!user) userId = undefined;
            }

            if (!userId) {
                const token = client.handshake.auth?.token || client.handshake.query?.token;
                if (token) {
                    const user = await this.authService.verifySupabaseToken(String(token));
                    if (user) userId = user.id;
                }
            }

            if (!userId) {
                this.logger.warn(`Connection rejected: no valid session/token - ${client.id}`);
                client.emit('error', { code: 'AUTH_REQUIRED', message: 'Please log in before connecting to chat' });
                client.disconnect();
                return;
            }

            client.data.userId = userId;

            let socketIds = this.connectedUsers.get(userId);
            if (!socketIds) {
                socketIds = [];
                this.connectedUsers.set(userId, socketIds);
            }
            while (socketIds.length >= ChatGateway.MAX_SOCKETS_PER_USER && socketIds.length > 0) {
                const oldestId = socketIds.shift();
                const oldestSocket = this.server?.sockets?.sockets?.get(oldestId!);
                if (oldestSocket) {
                    oldestSocket.emit('error', { code: 'CONNECTION_LIMIT', message: 'Too many connections; reconnecting.' });
                    oldestSocket.disconnect(true);
                }
            }
            const wasOffline = socketIds.length === 0;
            socketIds.push(client.id);

            // ChatService returns only rooms the user is currently entitled to.
            // For auction rooms this excludes everything until the £125 fee is paid.
            const roomIds = await this.chatService.getUserRoomIds(userId);
            for (const roomId of roomIds) await client.join(`room:${roomId}`);

            if (wasOffline) {
                for (const roomId of roomIds) {
                    client.to(`room:${roomId}`).emit('presence:update', { userId, online: true });
                }
            }

            const rooms = await this.chatService.getUserRooms(userId);
            const onlineUserIds = rooms
                .map((r: any) => r.otherUser?.id as string | undefined)
                .filter((id): id is string => !!id && this.connectedUsers.has(id));
            client.emit('presence:snapshot', { onlineUserIds });

            this.logger.log(`User ${userId} connected with ${roomIds.length} rooms - Socket: ${client.id}`);
        } catch (error: any) {
            this.logger.error(`Connection error: ${error.message}`, error.stack);
            client.emit('error', { code: 'CONNECTION_ERROR', message: 'Authentication failed' });
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket): Promise<void> {
        const userId = client.data.userId;
        if (!userId) return;

        const socketIds = this.connectedUsers.get(userId);
        let wentOffline = false;
        if (socketIds) {
            const idx = socketIds.indexOf(client.id);
            if (idx !== -1) socketIds.splice(idx, 1);
            if (socketIds.length === 0) {
                this.connectedUsers.delete(userId);
                wentOffline = true;
            }
        }

        if (wentOffline) {
            const roomIds = await this.chatService.getUserRoomIds(userId);
            for (const roomId of roomIds) {
                this.server.to(`room:${roomId}`).emit('presence:update', { userId, online: false });
            }
        }
        this.logger.log(`User ${userId} disconnected - Socket: ${client.id}`);
    }

    @SubscribeMessage('message:send')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: WsMessageDto): Promise<void> {
        const userId = client.data.userId;
        if (!userId) return;
        try {
            const message = await this.chatService.sendMessage(data.roomId, userId, { content: data.content });
            this.server.to(`room:${data.roomId}`).emit('message:new', message);
        } catch (error: any) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('room:join')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: WsRoomIdDto): Promise<void> {
        const userId = client.data.userId;
        if (!userId) return;
        try {
            await this.chatService.getRoom(data.roomId, userId);
            await client.join(`room:${data.roomId}`);
            client.emit('room:joined', { roomId: data.roomId });
        } catch (error: any) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('message:read')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleMarkRead(@ConnectedSocket() client: Socket, @MessageBody() data: WsRoomIdDto): Promise<void> {
        const userId = client.data.userId;
        if (!userId) return;
        try {
            const count = await this.chatService.markMessagesAsRead(data.roomId, userId);
            this.server.to(`room:${data.roomId}`).emit('messages:read', { roomId: data.roomId, readBy: userId, count });
        } catch (error: any) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('typing:start')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleTypingStart(@ConnectedSocket() client: Socket, @MessageBody() data: WsTypingDto): Promise<void> {
        const userId = client.data.userId;
        if (!userId) return;
        try {
            await this.chatService.getRoom(data.roomId, userId);
            client.to(`room:${data.roomId}`).emit('user:typing', { roomId: data.roomId, userId, isTyping: true });
        } catch (error: any) {
            client.emit('error', { message: error.message });
        }
    }

    @SubscribeMessage('typing:stop')
    @UsePipes(new ValidationPipe({ transform: true }))
    async handleTypingStop(@ConnectedSocket() client: Socket, @MessageBody() data: WsTypingDto): Promise<void> {
        const userId = client.data.userId;
        if (!userId) return;
        try {
            await this.chatService.getRoom(data.roomId, userId);
            client.to(`room:${data.roomId}`).emit('user:typing', { roomId: data.roomId, userId, isTyping: false });
        } catch (error: any) {
            client.emit('error', { message: error.message });
        }
    }

    joinRoomForUser(userId: string, roomId: string): void {
        const socketIds = this.connectedUsers.get(userId);
        if (!socketIds) return;
        for (const socketId of socketIds) {
            this.server?.sockets?.sockets?.get(socketId)?.join(`room:${roomId}`);
        }
    }

    isUserOnline(userId: string): boolean {
        return this.connectedUsers.has(userId) && (this.connectedUsers.get(userId)?.length ?? 0) > 0;
    }

    getOnlineUsers(): string[] {
        return Array.from(this.connectedUsers.keys()).filter(
            (uid) => (this.connectedUsers.get(uid)?.length ?? 0) > 0,
        );
    }
}
