import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { TokenDTO } from './dto/token.dto';

@Controller('/blockchain')
export class BlockchainController {
  constructor(private blockchainService: BlockchainService) {}
  @Get('/leaderboards/:poolID')
  leaderboards(@Param('poolID') poolID) {
    return this.blockchainService.leaderboardCalculator(parseInt(poolID));
  }

  @Get('/winners/:poolID')
  winners(@Param('poolID') poolID) {
    return this.blockchainService.getWinners(parseInt(poolID));
  }

  @Get('/ended-pools')
  endedPools() {
    return this.blockchainService.getEndedPools();
  }

  @Get('/upcoming-pools')
  upcomingPools() {
    return this.blockchainService.getUpcomingPools();
  }

  @Get('/active-pools')
  activePools() {
    return this.blockchainService.getActivePools();
  }

  @Get('/tokens')
  tokens() {
    return this.blockchainService.getTokensData();
  }

  @Post('/token')
  addToken(@Body() tokenDTO: TokenDTO) {
    return this.blockchainService.addToken(tokenDTO);
  }
}
