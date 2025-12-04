import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { LoanModule } from './loan/loan.module';
import { NewsletterModule } from './newsletter/newsletter.module';

@Module({
  imports: [AuthModule, LoanModule, NewsletterModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
