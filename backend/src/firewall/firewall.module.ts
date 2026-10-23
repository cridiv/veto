import { Module } from '@nestjs/common';
import { FirewallController } from './firewall.controller';
import { FirewallService } from './firewall.service';

@Module({
  controllers: [FirewallController],
  providers: [FirewallService],
  exports: [FirewallService],
})
export class FirewallModule {}
