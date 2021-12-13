import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainService } from './blockchain.service';
import { EnteredPool } from './entities/entered-pool.entity';
import { Pool } from './entities/pool.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pool, EnteredPool])],
  providers: [BlockchainService],
  exports: [BlockchainService],
})
export class BlockchainModule {}
