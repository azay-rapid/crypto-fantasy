import { Injectable } from '@nestjs/common';
import { ABI } from './blockchain.abi';
const Web3 = require('web3');

@Injectable()
export class BlockchainService {
  private web3;
  private subscription;
  private CONTRACT_ADDRESS;
  private myContract;
  constructor() {
    this.web3 = new Web3(
      'wss://speedy-nodes-nyc.moralis.io/593cb6b743abad211497ad94/bsc/testnet/ws',
    );
    this.CONTRACT_ADDRESS = '0x8360165c5076Ee1F8f0834c43B31D1096c7B9597';
    this.myContract = new this.web3.eth.Contract(ABI, this.CONTRACT_ADDRESS);
    const options = {
      filter: {
        value: [],
      },
      fromBlock: 0,
    };

    //PoolCreated Event
    this.myContract.events
      .poolCreated(options)
      .on('data', (event) => console.log('data', event))
      .on('changed', (changed) => console.log('changed', changed))
      .on('error', (err) => {
        throw err;
      })
      .on('connected', (str) => console.log(str));

    //Entered Pool
    this.myContract.events
      .enteredPool(options)
      .on('data', (event) => console.log('data', event))
      .on('changed', (changed) => console.log('changed', changed))
      .on('error', (err) => {
        throw err;
      })
      .on('connected', (str) => console.log(str));

    //rewardsDistributed
    this.myContract.events
      .rewardsDistributed(options)
      .on('data', (event) => console.log(event))
      .on('changed', (changed) => console.log(changed))
      .on('error', (err) => {
        throw err;
      })
      .on('connected', (str) => console.log(str));
  }
}
