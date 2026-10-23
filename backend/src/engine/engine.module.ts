import { Global, Module } from '@nestjs/common';
import { PolicyLoaderService } from './loader/policy-loader.service';

@Global()
@Module({
  providers: [PolicyLoaderService],
  exports: [PolicyLoaderService],
})
export class EngineModule {}
