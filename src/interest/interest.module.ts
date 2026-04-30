import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InterestService } from './interest.service';

@Module({
  imports: [PrismaModule],
  providers: [InterestService],
  exports: [InterestService],
})
export class InterestModule {}
