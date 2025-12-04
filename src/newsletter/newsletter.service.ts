// src/newsletter/newsletter.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NewsletterService {
  constructor(private prisma: PrismaService) {}

  async subscribe(email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const trimmed = email.trim().toLowerCase();

    try {
      const subscriber = await this.prisma.newsletterSubscriber.create({
        data: {
          email: trimmed,
        },
      });

      return {
        message: 'Subscribed successfully',
        subscriberId: subscriber.id,
      };
    } catch (err: any) {
      // Prisma unique constraint error (already subscribed)
      if (err.code === 'P2002') {
        throw new BadRequestException('Email already subscribed');
      }
      console.error('Newsletter subscribe error:', err);
      throw new BadRequestException('Failed to subscribe');
    }
  }
}
