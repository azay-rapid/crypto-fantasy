import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { EnteredPool } from './blockchain/entities/entered-pool.entity';
import { Pool } from './blockchain/entities/pool.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TokenList } from './blockchain/entities/token-list.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    BlockchainModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        return {
          type: 'mongodb',
          url: configService.get('MONGO_URL'),
          synchronize: true,
          useUnifiedTopology: true,
          entities: [Pool, EnteredPool, TokenList],
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
