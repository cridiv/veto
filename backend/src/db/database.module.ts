import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { ActionsRepository } from './repositories/actions.repository';
import { ApprovalsRepository } from './repositories/approvals.repository';
import { StatsRepository } from './repositories/stats.repository';

@Global()
@Module({
  providers: [
    DatabaseService,
    ActionsRepository,
    ApprovalsRepository,
    StatsRepository,
  ],
  exports: [
    DatabaseService,
    ActionsRepository,
    ApprovalsRepository,
    StatsRepository,
  ],
})
export class DatabaseModule {}
