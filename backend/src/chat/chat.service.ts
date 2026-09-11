import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto, SendMessageDto } from './dto';
import { Message } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class ChatService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationsService: NotificationsService,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    private readonly roomInclude = {
        initiator: {
            select: { id: true, firstName: true, lastName: true, profileImage: true, role: true },
        },
        participant: {
            select: { id: true, firstName: true, lastName: true, profileImage: true, role: true },
        },
        listing: {
            select: {
                id: true,
                title: true,
                slug: true,
                images: true,
                type: true,
                price: true,
                sellerId: true,
                auction: {
                    select: {
                        id: true,
                        status: true,
                        winnerId: true,
                        buyerFeePaid: true,
                        winningBidAmount: true,
                    },
                },
            },
        },
    };

    private withOtherUser<T extends { initiatorId: string; initiator: unknown; participant: unknown }>(room: T, userId: string) {
        return {
            ...room,
            otherUser: room.initiatorId === userId ? room.participant : room.initiator,
        };
    }

    /**
     * Auction conversations are part of the paid handover flow, not a public
     * enquiry channel. For an auction-linked room the exact pair must be the
     * seller and the winning dealer, and the £125 buyer fee must already be
     * paid. Retail/classified rooms remain normal buyer/seller conversations.
     */
    private assertAuctionRoomState(room: any, userId?: string): void {
        const listing = room?.listing;
        if (!listing || listing.type !== 'AUCTION') return;

        const auction = listing.auction;
        if (!auction?.winnerId) {
            throw new ForbiddenException('Auction chat is not available until a winner has been confirmed.');
        }
        if (!auction.buyerFeePaid) {
            throw new ForbiddenException('The £125 auction buyer fee must be paid before seller chat is available.');
        }

        const parties = new Set([room.initiatorId, room.participantId]);
        if (!listing.sellerId || !parties.has(listing.sellerId) || !parties.has(auction.winnerId) || parties.size !== 2) {
            throw new ForbiddenException('This auction chat is restricted to the seller and winning dealer.');
        }

        if (userId && userId !== listing.sellerId && userId !== auction.winnerId) {
            throw new ForbiddenException('This auction chat is restricted to the seller and winning dealer.');
        }
    }

    private async assertCanReferenceListing(userId: string, participantId: string, listingId: string): Promise<void> {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: {
                sellerId: true,
                type: true,
                auction: { select: { winnerId: true, buyerFeePaid: true } },
            },
        });
        if (!listing) throw new NotFoundException('Listing not found');
        if (listing.type !== 'AUCTION') return;

        if (!listing.auction?.winnerId) {
            throw new ForbiddenException('Auction chat is not available until a winner has been confirmed.');
        }
        if (!listing.auction.buyerFeePaid) {
            throw new ForbiddenException('The £125 auction buyer fee must be paid before seller chat is available.');
        }

        const parties = new Set([userId, participantId]);
        if (!listing.sellerId || !parties.has(listing.sellerId) || !parties.has(listing.auction.winnerId) || parties.size !== 2) {
            throw new ForbiddenException('Auction chat is restricted to the seller and winning dealer.');
        }
    }

    async findOrCreateRoom(userId: string, dto: CreateRoomDto) {
        const { participantId, listingId } = dto;
        if (participantId === userId) throw new ForbiddenException('You cannot start a chat with yourself.');

        if (listingId) {
            await this.assertCanReferenceListing(userId, participantId, listingId);
        }

        const existingRoom = await this.prisma.chatRoom.findFirst({
            where: {
                OR: [
                    { initiatorId: userId, participantId },
                    { initiatorId: participantId, participantId: userId },
                ],
                deletedAt: null,
            },
        });

        if (existingRoom) {
            const room = (listingId && listingId !== existingRoom.listingId)
                ? await this.prisma.chatRoom.update({
                    where: { id: existingRoom.id },
                    data: { listingId },
                    include: this.roomInclude,
                })
                : await this.prisma.chatRoom.findUniqueOrThrow({
                    where: { id: existingRoom.id },
                    include: this.roomInclude,
                });
            this.assertAuctionRoomState(room, userId);
            return this.withOtherUser(room, userId);
        }

        const room = await this.prisma.chatRoom.create({
            data: { initiatorId: userId, participantId, listingId },
            include: this.roomInclude,
        });
        this.assertAuctionRoomState(room, userId);
        return this.withOtherUser(room, userId);
    }

    async findOrCreateSupportRoom(userId: string) {
        const supportAccount = await this.prisma.user.findFirst({
            where: { role: 'ADMIN', deletedAt: null },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });
        if (!supportAccount) throw new NotFoundException('Support is not available right now.');
        if (supportAccount.id === userId) throw new ForbiddenException('You are the support account.');
        return this.findOrCreateRoom(userId, { participantId: supportAccount.id });
    }

    async getUserRooms(userId: string): Promise<any[]> {
        const rooms = await this.prisma.chatRoom.findMany({
            where: {
                OR: [{ initiatorId: userId }, { participantId: userId }],
                deletedAt: null,
            },
            include: {
                ...this.roomInclude,
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { id: true, content: true, senderId: true, isRead: true, createdAt: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const accessible = rooms.filter((room: any) => {
            try { this.assertAuctionRoomState(room, userId); return true; }
            catch { return false; }
        });

        return Promise.all(accessible.map(async (room) => {
            const unreadCount = await this.prisma.message.count({
                where: {
                    chatRoomId: room.id,
                    senderId: { not: userId },
                    isRead: false,
                    deletedAt: null,
                },
            });
            const { otherUser } = this.withOtherUser(room, userId);
            return {
                id: room.id,
                otherUser,
                listing: room.listing,
                lastMessage: room.messages[0] || null,
                unreadCount,
                updatedAt: room.updatedAt,
            };
        }));
    }

    async getRoom(roomId: string, userId: string) {
        const room = await this.prisma.chatRoom.findUnique({
            where: { id: roomId },
            include: this.roomInclude,
        });
        if (!room || room.deletedAt) throw new NotFoundException('Chat room not found');
        if (room.initiatorId !== userId && room.participantId !== userId) {
            throw new ForbiddenException('You are not a member of this chat room');
        }
        this.assertAuctionRoomState(room, userId);
        return this.withOtherUser(room, userId);
    }

    async getRoomMessages(roomId: string, userId: string, page = 1, limit = 50): Promise<{ data: Message[]; total: number }> {
        await this.getRoom(roomId, userId);
        const skip = (page - 1) * limit;
        const [messages, total] = await Promise.all([
            this.prisma.message.findMany({
                where: { chatRoomId: roomId, deletedAt: null },
                include: { sender: { select: { id: true, firstName: true, lastName: true, profileImage: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.message.count({ where: { chatRoomId: roomId, deletedAt: null } }),
        ]);
        return { data: messages.reverse(), total };
    }

    async sendMessage(roomId: string, senderId: string, dto: SendMessageDto): Promise<Message> {
        await this.getRoom(roomId, senderId);
        const message = await this.prisma.message.create({
            data: { chatRoomId: roomId, senderId, content: dto.content },
            include: { sender: { select: { id: true, firstName: true, lastName: true, profileImage: true } } },
        });
        await this.prisma.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });

        const room = await this.prisma.chatRoom.findUnique({
            where: { id: roomId },
            select: { initiatorId: true, participantId: true },
        });
        if (room) {
            const recipientId = room.initiatorId === senderId ? room.participantId : room.initiatorId;
            try {
                const notification = await this.notificationsService.create({
                    userId: recipientId,
                    type: 'MESSAGE_RECEIVED',
                    title: 'New Message',
                    message: dto.content.substring(0, 50) + (dto.content.length > 50 ? '...' : ''),
                    link: `/dashboard/user?tab=messages&room=${roomId}`,
                    data: { roomId, messageId: message.id },
                });
                this.notificationsGateway.sendNotification(recipientId, notification);
            } catch (notifErr: any) {
                console.warn(`[ChatService] Failed to send message notification: ${notifErr?.message}`);
            }
        }
        return message;
    }

    async markMessagesAsRead(roomId: string, userId: string): Promise<number> {
        await this.getRoom(roomId, userId);
        const result = await this.prisma.message.updateMany({
            where: { chatRoomId: roomId, senderId: { not: userId }, isRead: false },
            data: { isRead: true },
        });
        return result.count;
    }

    private async accessibleRoomIds(userId: string): Promise<string[]> {
        const rooms = await this.prisma.chatRoom.findMany({
            where: {
                OR: [{ initiatorId: userId }, { participantId: userId }],
                deletedAt: null,
            },
            include: {
                listing: {
                    select: {
                        id: true,
                        type: true,
                        sellerId: true,
                        auction: { select: { winnerId: true, buyerFeePaid: true } },
                    },
                },
            },
        });
        return rooms.filter((room: any) => {
            try { this.assertAuctionRoomState(room, userId); return true; }
            catch { return false; }
        }).map((room) => room.id);
    }

    async getUnreadCount(userId: string): Promise<number> {
        const roomIds = await this.accessibleRoomIds(userId);
        if (roomIds.length === 0) return 0;
        return this.prisma.message.count({
            where: {
                chatRoomId: { in: roomIds },
                senderId: { not: userId },
                isRead: false,
                deletedAt: null,
            },
        });
    }

    async getUserRoomIds(userId: string): Promise<string[]> {
        return this.accessibleRoomIds(userId);
    }
}
