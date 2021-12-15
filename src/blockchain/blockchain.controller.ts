import { Controller, Get, Param } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';

@Controller('/blockchain')
export class BlockchainController {
  constructor(private blockchainService: BlockchainService) {}
  @Get('/leaderboards/:poolID')
  leaderboards(@Param('poolID') poolID) {
    return this.blockchainService.leaderboardCalculator(parseInt(poolID));
  }
}
