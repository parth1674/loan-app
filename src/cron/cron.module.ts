import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "../prisma/prisma.module";
import { InterestModule } from "../interest/interest.module";
import { InterestCron } from "./interest.cron";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    InterestModule,
  ],
  providers: [InterestCron],
})
export class CronModule {}
