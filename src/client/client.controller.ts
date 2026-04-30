import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LoanService } from "../loan/loan.service";

@UseGuards(JwtAuthGuard)
@Controller("client")
export class ClientController {
  constructor(private readonly loanService: LoanService) {}

  @Get("dashboard")
  async getDashboard(@Req() req: any) {
    return this.loanService.getDashboard(req.user.id);
  }
}
