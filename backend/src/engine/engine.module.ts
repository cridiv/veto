import { Global, Module } from '@nestjs/common';
import { PolicyLoaderService } from './loader/policy-loader.service';
import { PolicyEngineService } from './engine.service';
import { DatabaseModule } from '../db/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [PolicyLoaderService, PolicyEngineService],
  exports: [PolicyLoaderService, PolicyEngineService],
})
export class EngineModule {}
