import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FirewallService } from './firewall.service';
import type { Decision, Approval, FirewallStats } from '@veto/contracts';

@Controller('v1')
export class FirewallController {
  constructor(private readonly firewallService: FirewallService) {}

  /**
   * Main gate endpoint: Submits an ActionRequest, evaluates, and returns a Decision.
   */
  @Post('check')
  async check(@Body() body: unknown): Promise<Decision> {
    return this.firewallService.checkAction(body);
  }

  /**
   * Server-Sent Events stream: Emits real-time decisions and approval updates.
   */
  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.firewallService.getEventsStream();
  }

  /**
   * Toggles the firewall mode ON / OFF.
   */
  @Post('mode')
  setMode(@Body() body: unknown): { enabled: boolean } {
    return this.firewallService.setMode(body);
  }

  @Get('mode')
  getMode(): { enabled: boolean } {
    return this.firewallService.getMode();
  }

  /**
   * Polls the status of an approval.
   */
  @Get('approvals/:id')
  getApproval(@Param('id') id: string): Approval {
    return this.firewallService.getApproval(id);
  }

  /**
   * Resolves a pending approval with 'approve' or 'deny'.
   */
  @Post('approvals/:id')
  resolveApproval(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Approval {
    return this.firewallService.resolveApproval(id, body);
  }

  /**
   * Queries the historical audit log with optional filters.
   */
  @Get('actions')
  getActions(
    @Query('limit') limit?: string,
    @Query('verdict') verdict?: string,
    @Query('agentId') agentId?: string,
  ): any[] {
    return this.firewallService.getActions({
      limit: limit ? parseInt(limit, 10) : undefined,
      verdict,
      agentId,
    });
  }

  /**
   * Returns aggregated statistics by verdict, layer, and agent.
   */
  @Get('stats')
  getStats(@Query('agentId') agentId?: string): FirewallStats {
    return this.firewallService.getStats(agentId);
  }
}
