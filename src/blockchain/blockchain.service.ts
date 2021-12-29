import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ABI,
  AggregatorV3InterfaceABI,
  FactoryABI,
  PairABI,
  TokenABI,
} from './blockchain.abi';
import { CronJob } from 'cron';
import { InjectRepository } from '@nestjs/typeorm';
import { Pool } from './entities/pool.entity';
import { Repository } from 'typeorm';
import { EnteredPool } from './entities/entered-pool.entity';
import { TokenPrice } from './entities/token-price.type';
import { ConfigService } from '@nestjs/config';
import { Winner } from './entities/winners.type';
import { TokenList, TokenType } from './entities/token-list.entity';
import { TokenDTO } from './dto/token.dto';
const Web3 = require('web3');

@Injectable()
export class BlockchainService implements OnModuleInit {
  private web3SocketConnection;
  private web3;
  private myContract;
  constructor(
    @InjectRepository(Pool) private poolRepository: Repository<Pool>,
    @InjectRepository(EnteredPool)
    private enteredPoolRepository: Repository<EnteredPool>,
    @InjectRepository(TokenList)
    private tokenListRepository: Repository<TokenList>,
    private configService: ConfigService,
  ) {}
  async onModuleInit() {
    this.initiatewebSocket();
  }

  async initiatewebSocket() {
    const reconnectOptions = {
      timeout: 30000,
      clientConfig: {
        maxReceivedFrameSize: 100000000,
        maxReceivedMessageSize: 100000000,
        keepalive: true,
        keepaliveInterval: -1,
      },

      reconnect: {
        auto: true,
        delay: 5000, // ms
        maxAttempts: 99999999,
        onTimeout: true,
      },
    };
    const that = this;
    this.web3SocketConnection = new Web3.providers.WebsocketProvider(
      this.configService.get('WEB3_WSS_PROVIDER'),
      reconnectOptions,
    );

    this.web3SocketConnection.on('connect', () => {
      console.log('! provider connected'); // <- fires after successful connection
      this.startListeningEvents();
    });

    this.web3SocketConnection.on('error', function (err) {
      console.log('~ on-error:', err); // <- never fires
      that.initiatewebSocket();
    });

    this.web3SocketConnection.on('end', async (err) => {
      console.log('~ on-end:', err); // <- never fires
      that.initiatewebSocket();
    });

    this.web3SocketConnection.on('close', (event) => {
      console.log('~ on-close:', event); // <- never fires
      that.initiatewebSocket();
    });
  }

  async startListeningEvents() {
    const web3Connect = new Web3(this.web3SocketConnection);
    const CONTRACT_ADDRESS = '0x096a5c3A871B33C77d1Bf57807F9076459AEC45d';
    this.myContract = new web3Connect.eth.Contract(
      ABI,
      '0x096a5c3A871B33C77d1Bf57807F9076459AEC45d',
    );
    const options = {
      filter: {
        value: [],
      },
      fromBlock: 'latest',
    };

    // this.myContract.getPastEvents('poolCreated', options, (err, event) => {
    //   if (err) return;
    //   console.log('this', event);
    // });
    //PoolCreated Event
    this.myContract.events.poolCreated(options).on('data', async (event) => {
      console.log(event);
      //save the event to db
      const { poolID, entryFees, startTime, endTime, tokenAddress } =
        event.returnValues;
      let pool = await this.poolRepository.findOne({
        poolID: parseInt(poolID),
      });
      if (pool) return;
      pool = this.poolRepository.create({
        poolID: parseInt(poolID),
        entryFees: parseInt(entryFees),
        startTime: parseInt(startTime),
        endTime: parseInt(endTime),
        tokenAddress,
        openPrice: [],
        closePrice: [],
        winners: [],
      });
      await this.poolRepository.save(pool);
      let startJob, endJob;
      try {
        startJob = new CronJob(
          new Date(parseInt(event.returnValues.startTime) * 1000),
          () => {
            this.startCallback(startJob, pool);
          },
          null,
          true,
          'Asia/Kolkata',
        );
      } catch (e) {
        console.log(`Error: Pool ${poolID} has start date from past!`);
      }

      try {
        endJob = new CronJob(
          new Date(parseInt(event.returnValues.endTime) * 1000),
          async () => {
            await this.endCallback(endJob, pool);
            await this.computeWinners(pool.poolID);
          },
          null,
          true,
          'Asia/Kolkata',
        );
      } catch (e) {
        console.log(`Error: Pool ${poolID} has end date from past!`);
      }
      if (startJob) startJob.start();
      if (startJob && endJob) endJob.start();
    });

    //Entered Pool
    this.myContract.events.enteredPool(options).on('data', async (event) => {
      console.log(event);
      const { user, aggregatorAddress, poolID } = event.returnValues;
      let enteredPool = await this.enteredPoolRepository.findOne({
        user,
        poolID: parseInt(poolID),
      });
      if (enteredPool) return;
      const addr = aggregatorAddress.map((addr) => addr.toLowerCase());
      enteredPool = this.enteredPoolRepository.create({
        user,
        aggregatorAddress: addr,
        poolID: parseInt(poolID),
      });

      await this.enteredPoolRepository.save(enteredPool);
    });
  }

  async startCallback(startJob, pool) {
    const openPrice = await this.getCurrentTokenPrices();
    await this.poolRepository.update({ poolID: pool.poolID }, { openPrice });
    startJob.stop();
  }

  async endCallback(endJob, pool) {
    const closePrice = await this.getCurrentTokenPrices();
    await this.poolRepository.update({ poolID: pool.poolID }, { closePrice });
    endJob.stop();
  }

  async getCurrentTokenPrices() {
    const web3 = new Web3(this.configService.get('WEB3_HTTP_PROVIDER'));
    const Aggregator = await this.tokenListRepository.find();

    const prices: TokenPrice[] = [];
    for (let i = 0; i < Aggregator.length; i++) {
      const priceFeed = new web3.eth.Contract(
        AggregatorV3InterfaceABI,
        Aggregator[i]['address'],
      );
      if (Aggregator[i].type === TokenType.AGGR) {
        await priceFeed.methods
          .latestRoundData()
          .call()
          .then(async (priceData) => {
            prices.push({
              ...Aggregator[i],
              address: Aggregator[i].address.toLowerCase(),
              price: priceData[1],
              decimal: await priceFeed.methods.decimals().call(),
            });
          });
      } else {
        const factoryContract = new web3.eth.Contract(
          FactoryABI,
          '0xca143ce32fe78f1f7019d7d551a6402fc5350c73',
        );
        const BNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
        const tokenX = Aggregator[i]['address'];
        const pairAddress = await factoryContract.methods
          .getPair(tokenX, BNB)
          .call();
        const token = new web3.eth.Contract(TokenABI, tokenX);
        const tokenDecimal = await token.methods.decimals().call();
        const pairInstance = new web3.eth.Contract(PairABI, pairAddress);
        const data = await pairInstance.methods.getReserves().call();
        let price1 = 0;
        if (BNB > tokenX) {
          price1 = data[1] / 10 ** 18 / (data[0] / 10 ** tokenDecimal);
        } else {
          price1 = data[0] / 10 ** 18 / (data[1] / 10 ** tokenDecimal);
        }
        const priceFeed = new web3.eth.Contract(
          AggregatorV3InterfaceABI,
          '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
        );
        const priceData = await priceFeed.methods.latestRoundData().call();
        const priceInUSD = price1 * (priceData[1] / 10 ** 8);
        prices.push({
          ...Aggregator[i],
          address: Aggregator[i].address.toLowerCase(),
          price: priceInUSD.toString(),
          decimal: 0,
        });
      }
    }

    return prices;
  }

  async computeWinners(poolID) {
    //get the pool
    const pool = await this.poolRepository.findOne({ poolID });

    //format poolOpenPrice and poolClosePrice
    const openPrice = {};
    pool.openPrice.forEach((item) => {
      openPrice[item.address.toLowerCase()] = item.price;
    });
    const closePrice = {};
    pool.closePrice.forEach((item) => {
      closePrice[item.address.toLowerCase()] = item.price;
    });

    //get all the participants of the pool
    const all = await this.enteredPoolRepository.find({ poolID });
    if (all.length === 0) return;
    //claculate the score/points of the participants
    const participants = all.map((participant) => {
      return {
        user: participant.user,
        score: this.calculateScore(
          participant.aggregatorAddress,
          openPrice,
          closePrice,
        ),
      };
    });
    //sort them in descending order of their score
    participants.sort((a, b) => b.score - a.score);

    //distribute price among the top players and return the winners
    const winners = this.distributePrice(
      participants,
      participants.length * pool.entryFees,
    );
    // save them to DB
    await this.poolRepository.update({ poolID }, { winners });
    await this.transactBalance(poolID, winners);
  }

  private calculateScore(addresses, poolOpenPrice, poolClosePrice) {
    let score = 0;
    for (let i = 0; i < 10; ++i) {
      const a = parseFloat(poolOpenPrice[addresses[i].toLowerCase()]);
      const b = parseFloat(poolClosePrice[addresses[i].toLowerCase()]);
      const c = 10000;
      score += Number(((b - a) * c) / a);
    }
    return score;
  }

  private distributePrice(participants, totalPoolAmount) {
    if (participants.length === 0) return [];
    const priceShare = [
      [70, 30],
      [50, 30, 20],
      [40, 24, 16, 12, 8],
      [30, 20, 12, 10, 8, 6, 5, 4, 3, 2],
      [30, 20, 10, 7.5, 6, 5, 4, 3, 2.5, 2, 1],
      [28, 18, 10, 7.5, 6, 5, 4, 3, 2, 1.5, 1, 0.5],
      [25, 15, 9, 7.5, 6, 5, 4, 3, 2, 1.5, 1, 0.7, 0.5],
      [25, 15, 8, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.6, 0.5],
      [23, 14, 7, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.6, 0.5, 0.4],
      [22, 12, 7, 6, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.6, 0.5, 0.4, 0.3],
    ];

    const distribute = (prices) => {
      const winners = [];
      for (let i = 0; i < prices.length && i < 10; ++i) {
        winners.push({
          ...participants[i],
          amount: (totalPoolAmount * prices[i]) / 100,
        });
      }
      let j = 10;
      for (let i = 10; i < prices.length; ++i) {
        for (let k = 0; k < 10; ++k) {
          winners.push({
            ...participants[j],
            amount: (totalPoolAmount * prices[i]) / 100,
          });
          ++j;
        }
      }

      return winners;
    };
    if (participants.length > 800) {
      return distribute(priceShare[9]);
    } else if (participants.length > 600) {
      return distribute(priceShare[8]);
    } else if (participants.length > 400) {
      return distribute(priceShare[7]);
    } else if (participants.length > 300) {
      return distribute(priceShare[6]);
    } else if (participants.length > 200) {
      return distribute(priceShare[5]);
    } else if (participants.length > 100) {
      return distribute(priceShare[4]);
    } else if (participants.length > 50) {
      return distribute(priceShare[3]);
    } else if (participants.length > 30) {
      return distribute(priceShare[2]);
    } else if (participants.length >= 3) {
      return distribute(priceShare[1]);
    } else if (participants.length == 1) {
      return [
        {
          user: participants[0].user,
          amount: totalPoolAmount,
        },
      ];
    }

    return distribute(priceShare[0]);
  }

  private async transactBalance(poolID: number, winnerList: Winner[]) {
    const web3 = new Web3(this.configService.get('WEB3_HTTP_PROVIDER'));
    const account = '0x7338860D9D43645a56ad9f9E530fA31602aafb7A'; //Your account address
    const privateKey = this.configService.get('ETH_PRIVATE_KEY');
    const contractAddress = '0x36324bB60e8A52EdDEAf54c18e05b0Ba29F4C0eC'; // Deployed manually
    const contract = new web3.eth.Contract(ABI, contractAddress, {
      from: account,
      gasLimit: 3000000,
    });
    const winner = winnerList.map((item) => item.user.toString());
    const amount = winnerList.map((item) => item.amount.toString());
    //new script
    const { address } = web3.eth.accounts.wallet.add(privateKey);
    try {
      const tx = await contract.methods.setWinner(poolID, winner, amount).send({
        from: address,
      });
    } catch (e) {
      console.log(`set winner for pool ${poolID} failed!`);
    }
  }

  async leaderboardCalculator(poolID: number) {
    const pool = await this.poolRepository.findOne({ poolID });
    if (!pool) {
      throw new NotFoundException('Sorry! Pool not Found');
    }
    const { openPrice, winners } = pool;

    //pool ended
    if (winners.length > 0) {
      return winners;
    }
    //pool not yet started
    if (openPrice.length <= 0) {
      throw new BadRequestException('Pool Not yet started!');
    }

    const all = await this.enteredPoolRepository.find({ poolID });

    //if no participants return
    if (all.length <= 0) {
      return {};
    }

    const openTokenRate = {};
    openPrice.forEach((tokenRate) => {
      openTokenRate[tokenRate.address.toLowerCase()] = tokenRate.price;
    });

    const currentPrice = await this.getCurrentTokenPrices();
    const currentTokenRate = {};
    currentPrice.forEach((tokenRate) => {
      currentTokenRate[tokenRate.address.toLowerCase()] = tokenRate.price;
    });

    //claculate the score/points of the participants
    const participants = all.map((participant) => {
      return {
        user: participant.user,
        score: this.calculateScore(
          participant.aggregatorAddress,
          openTokenRate,
          currentTokenRate,
        ),
      };
    });
    //sort them in descending order of their score
    participants.sort((a, b) => b.score - a.score);

    return participants;
  }

  async getPlayersCount(poolID: number) {
    return await this.enteredPoolRepository.count({ poolID });
  }

  async fillPlayersCount(pools: Pool[]) {
    return await Promise.all(
      pools.map(async (pool) => ({
        ...pool,
        playerCount: await this.getPlayersCount(pool.poolID),
      })),
    );
  }

  async getEndedPools() {
    const currTime = Math.floor(Date.now() / 1000 - 300);
    const pools = await this.poolRepository.find({
      where: { endTime: { $lt: currTime } },
      select: [
        'poolID',
        'entryFees',
        'startTime',
        'endTime',
        'winners',
        'tokenAddress',
      ],
      order: {
        _id: -1,
      },
      take: 10,
    });

    return await this.fillPlayersCount(pools);
  }

  async getUpcomingPools() {
    const currTime = Math.floor(Date.now() / 1000);
    const pools = await this.poolRepository.find({
      where: { startTime: { $gt: currTime } },
      select: ['poolID', 'entryFees', 'startTime', 'endTime', 'tokenAddress'],
      order: { _id: -1 },
    });
    return await this.fillPlayersCount(pools);
  }

  async getActivePools() {
    const currTime = Math.floor(Date.now() / 1000);
    const pools = await this.poolRepository.find({
      where: {
        $and: [
          { startTime: { $lt: currTime } },
          { endTime: { $gt: currTime } },
        ],
      },
      select: [
        'poolID',
        'entryFees',
        'tokenAddress',
        'startTime',
        'endTime',
        'openPrice',
      ],
      order: {
        _id: -1,
      },
    });

    return await this.fillPlayersCount(pools);
  }

  async getTokensData() {
    return await this.getCurrentTokenPrices();
  }

  async getWinners(poolID) {
    const pool = await this.poolRepository.findOne({ poolID });
    if (!pool) {
      throw new NotFoundException();
    }
    if (pool.closePrice.length === 0) {
      return {
        message: 'Pool not yet ended!',
      };
    }
    return pool.winners;
  }

  private async validateToken(address) {
    const web3 = new Web3(this.configService.get('WEB3_HTTP_PROVIDER'));
    const factoryConntract = new web3.eth.Contract(
      FactoryABI,
      '0xca143ce32fe78f1f7019d7d551a6402fc5350c73',
    );
    const BNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc0958';
    const tokenX = address;
    const pairAddress = await factoryConntract.methods
      .getPair(tokenX, BNB)
      .call();
    if (pairAddress == '0x0000000000000000000000000000000000000000') {
      return false;
    } else {
      return true;
    }
  }

  async addToken(tokenDTO: TokenDTO) {
    if (!this.validateToken(tokenDTO.address)) {
      throw new BadRequestException('Invalid token address');
    }

    const t = await this.tokenListRepository.findOne({
      address: tokenDTO.address.toLowerCase(),
    });
    if (t) {
      return t;
    }

    const token = this.tokenListRepository.create({
      ...tokenDTO,
      address: tokenDTO.address.toLowerCase(),
      type: TokenType.CUST,
    });

    await this.tokenListRepository.save(token);

    return token;
  }
}
