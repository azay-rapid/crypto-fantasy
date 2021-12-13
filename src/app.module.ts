import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { EnteredPool } from './blockchain/entities/entered-pool.entity';
import { Pool } from './blockchain/entities/pool.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mongodb',
      url: 'mongodb+srv://cryptofantasy:example@cluster0.944gs.mongodb.net/cryptofantasy?retryWrites=true&w=majority',
      synchronize: true,
      useUnifiedTopology: true,
      entities: [Pool, EnteredPool],
    }),
    BlockchainModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
