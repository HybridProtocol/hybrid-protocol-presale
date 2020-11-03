/* eslint-env es6 */

const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const Decimal = require('decimal.js');

// Refer to this article for background:
// https://medium.com/balancer-protocol/building-liquidity-into-token-distribution-a49d4286e0d4

contract('Hybrid Presale', async (accounts) => {
    const admin = accounts[0];
    const { toWei, fromWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);
    const SYMBOL = 'HPPT';
    const NAME = 'Hybrid Presale Pool Token';

    const permissions = {
        canPauseSwapping: false,
        canChangeSwapFee: false,
        canChangeWeights: true,
        canAddRemoveTokens: false,
        canWhitelistLPs: false,
        canChangeCap: false,
    };

    
    describe('Factory LBP', () => {
        let controller;
        let CONTROLLER;
        let USDC;
        let HBT;
        let hbt;
        let usdc;

        const startWeights = [toWei('36'), toWei('4')];
        const startBalances = [toWei('9000000'), toWei('1000000')];
        const swapFee = 10**15;

        before(async () => {
            bFactory = await BFactory.deployed();
            crpFactory = await CRPFactory.deployed();
            usdc = await TToken.new('USDC', 'USDC Token', 18);
            hbt = await TToken.new('HBT Token', 'HBT', 18);
 
            USDC = usdc.address;
            HBT = hbt.address;

            // admin balances
            // These should be higher than the initial amount supplied
            // Changing weights pushes/pulls tokens as necessary to keep the prices stable
            await hbt.mint(admin, toWei('10000'));
            await usdc.mint(admin, toWei('100000'));

            const poolParams = {
                poolTokenSymbol: SYMBOL,
                poolTokenName: NAME,
                constituentTokens: [USDC, HBT],
                tokenBalances: startBalances,
                tokenWeights: startWeights,
                swapFee: swapFee,
                }

            CONTROLLER = await crpFactory.newCrp.call(
                bFactory.address,
                poolParams,
                permissions,
            );

            await crpFactory.newCrp(
                bFactory.address,
                poolParams,
                permissions,
            );

            controller = await ConfigurableRightsPool.at(CONTROLLER);

            const CONTROLLER_ADDRESS = controller.address;

            await hbt.approve(CONTROLLER_ADDRESS, MAX);
            await usdc.approve(CONTROLLER_ADDRESS, MAX);

            await controller.createPool(toWei('1000'), 10, 10);
        });

        describe('Presale LBP', () => {
            it('Should be able to update weights directly', async () => {
                let i;

                let weightUSDC = await controller.getDenormalizedWeight(USDC);
                let weightHBT = await controller.getDenormalizedWeight(HBT);
                const startWeightUSDC = weightUSDC;
                const startWeightHBT = weightHBT;

                let total = Decimal(fromWei(weightUSDC)).plus(Decimal(fromWei(weightHBT)));
                let pctUSDC = Decimal(fromWei(weightUSDC)).div(total);
                let pctHBT = Decimal(fromWei(weightHBT)).div(total);
                assert.equal(pctUSDC.toString(), '0.9');
                assert.equal(pctHBT.toString(), '0.1');
                // Steepness parameter
                const b = 1;

                const bPoolAddr = await controller.bPool();
                const underlyingPool = await BPool.at(bPoolAddr);
    
                /* Exponential curve formula (for 90/10%)
                   "b" parameterizes the "steepness" of the curve
                   Higher values of b mean weights converge to the asymptotes faster
                  
                   pctUSDC = 0.9 * pow(3, - blocksElapsed *6500 / 5)
                   pctHBT = 1 - pctUSDC
                 
                   */

                /* Follow it for 32500 blocks/weight changes
                   For the first 32000 blocks, set the weights manually, since they're not linear
                   For the last 500 blocks, the curve is close enough to the asymptote to be nearly linear,
                   So make it easier and use the updateWeightsGradually call */

                for (i = 1; i <= 32000; i++) {
                    weightUSDC = await controller.getDenormalizedWeight(USDC);
                    weightHBT = await controller.getDenormalizedWeight(HBT);
                    block = await web3.eth.getBlock("latest");
                    console.log('Block: ' + block.number + '. Weights -> USDC: ' +
                        (fromWei(weightUSDC)*2.5).toFixed(4) + '%\tHBT: ' +
                        (fromWei(weightHBT)*2.5).toFixed(4) + '%');
                    await time.advanceBlock();

                    // Calculate the normalized weights
                    normUSDC = Math.floor(0.9 * Math.pow(3, -i / (6500 * 5)));
                    normHBT = 1 - normUSDC;

                    console.log(`\nNew weights: USDC weight: ${normUSDC}; HBT weight: ${normHBT}`);

                    // Changing weghts transfers tokens!
                    await controller.updateWeight(USDC, toWei(normUSDC.toFixed(4)));
                    await controller.updateWeight(HBT, toWei(normHBT.toFixed(4)));

                    const adminUSDC = await usdc.balanceOf.call(admin);
                    const adminHBT = await hbt.balanceOf.call(admin);
                    console.log(`Admin balances after: ${Decimal(fromWei(adminUSDC)).toFixed(2)} USDC; ${Decimal(fromWei(adminHBT)).toFixed(2)} HBT`);
                    const poolUSDC = await usdc.balanceOf.call(underlyingPool.address);
                    const poolHBT = await hbt.balanceOf.call(underlyingPool.address);
                    console.log(`Pool balances after: ${Decimal(fromWei(poolUSDC)).toFixed(2)} USDC; ${Decimal(fromWei(poolHBT)).toFixed(2)} HBT`);
                }

                // End weights are the reverse of the starting weights
                const endWeights = [startWeightHBT, startWeightUSDC]
                // Do linear for the rest of the curve
                await controller.updateWeightsGradually(endWeights, block.number, block.number + 15);

                for (i = 1; i <= 500; i++) {
                    weightUSDC = await controller.getDenormalizedWeight(USDC);
                    weightHBT = await controller.getDenormalizedWeight(HBT);
                    block = await web3.eth.getBlock("latest");
                    console.log('Block: ' + block.number + '. Weights -> USDC: ' +
                        (fromWei(weightUSDC)*2.5).toFixed(4) + '%\tHBT: ' +
                        (fromWei(weightHBT)*2.5).toFixed(4) + '%');

                    await controller.pokeWeights();
                }
            });
        });        
    });
});
