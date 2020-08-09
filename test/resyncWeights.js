/* eslint-env es6 */

const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ElasticSupplyPool = artifacts.require('ElasticSupplyPool');
const ESPFactory = artifacts.require('ESPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');


contract('elasticSupplyPool', async (accounts) => {
    const admin = accounts[0];
    const { toWei } = web3.utils;
    const startWeights = [toWei('1'), toWei('1')];
    const MAX = web3.utils.toTwosComplement(-1);

    let crpFactory;
    let bFactory;
    let crpPool;
    let CRPPOOL;
    let usdc;
    let dai;
    let USDC;
    let DAI;

    // These are the intial settings for newCrp:
    const swapFee = 10 ** 15;
    const SYMBOL = 'BAL-USDC-DAI';
    const permissions = {
        canPauseSwapping: false,
        canChangeSwapFee: false,
        canChangeWeights: true,
        canAddRemoveTokens: false,
        canWhitelistLPs: false,
        canChangeCap: false,
    };

    describe('resyncWeight', () => {
        before(async () => {
            bFactory = await BFactory.deployed();
            crpFactory = await ESPFactory.deployed();

            usdc = await TToken.new('USD Stablecoin', 'USDC', 18);
            dai = await TToken.new('Dai Stablecoin', 'DAI', 18);

            USDC = usdc.address;
            DAI = dai.address;

            // admin balances
            await dai.mint(admin, toWei('15000'));
            await usdc.mint(admin, toWei('15000'));

            const tokenAddresses = [USDC, DAI];
            const startBalances = [toWei('10000'), toWei('10000')];

            CRPPOOL = await crpFactory.newEsp.call(
                bFactory.address,
                SYMBOL,
                tokenAddresses,
                startBalances,
                startWeights,
                swapFee,
                permissions,
            );

            await crpFactory.newEsp(
                bFactory.address,
                SYMBOL,
                tokenAddresses,
                startBalances,
                startWeights,
                swapFee,
                permissions,
            );

            crpPool = await ElasticSupplyPool.at(CRPPOOL);
            const CRPPOOL_ADDRESS = crpPool.address;
            await usdc.approve(CRPPOOL_ADDRESS, MAX);
            await dai.approve(CRPPOOL_ADDRESS, MAX);

            await crpPool.createPool(toWei('100'));
        });

        it('resync weights should gulp and not move price', async () => {
            const bPoolAddr = await crpPool.bPool();
            const bPool = await BPool.at(bPoolAddr);

            // both pools are out of balance
            // calling gulp after transfer will move the price
            await dai.transfer(bPoolAddr, toWei('1000'));

            // resync weights, safely calls gulp and adjusts weights
            // proportionally so that price does not move
            const spotPriceBefore = await bPool.getSpotPrice.call(dai.address, usdc.address);
            const usdcWeightBefore = await bPool.getDenormalizedWeight.call(usdc.address);
            const daiWeightBefore = await bPool.getDenormalizedWeight.call(dai.address);
            const totalWeightBefore = await bPool.getTotalDenormalizedWeight.call();

            await crpPool.resyncWeight(dai.address);

            const spotPriceAfter = await bPool.getSpotPrice.call(dai.address, usdc.address);
            const usdcWeightAfter = await bPool.getDenormalizedWeight.call(usdc.address);
            const daiWeightAfter = await bPool.getDenormalizedWeight.call(dai.address);
            const totalWeightAfter = await bPool.getTotalDenormalizedWeight.call();

            assert.equal(spotPriceBefore.toString(), spotPriceAfter.toString());
            assert.equal(usdcWeightBefore.toString(), usdcWeightAfter.toString());

            assert.equal(daiWeightBefore, toWei('1'));
            assert.equal(daiWeightAfter, toWei('1.1'));

            assert.equal(totalWeightBefore, toWei('2'));
            assert.equal(totalWeightAfter, toWei('2.1'));
        });

        it('Should not allow calling updateWeight', async () => {
            await truffleAssert.reverts(
                crpPool.updateWeight(DAI, toWei('3')),
                'ERR_UNSUPPORTED_OPERATION',
            );
        });

        it('Should not allow calling updateWeightsGradually', async () => {
            await truffleAssert.reverts(
                crpPool.updateWeightsGradually(startWeights, 10, 10),
                'ERR_UNSUPPORTED_OPERATION',
            );
        });

        it('Should not allow calling pokeWeights', async () => {
            await truffleAssert.reverts(
                crpPool.pokeWeights(), 'ERR_UNSUPPORTED_OPERATION',
            );
        });

        it('Should not allow calling overloaded createPool', async () => {
            await truffleAssert.reverts(
                crpPool.createPool(toWei('100'), 10, 10), 'ERR_UNSUPPORTED_OPERATION',
            );
        });
    });
});
