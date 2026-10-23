import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './db/database.module';
import { FirewallModule } from './firewall/firewall.module';
import { EngineModule } from './engine/engine.module';

@Module({
  imports: [DatabaseModule, EngineModule, FirewallModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
