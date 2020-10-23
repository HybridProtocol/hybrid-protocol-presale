# Configurable Rights Pool

<em style="color:orange">WARNING: this code has not been fully audited. Sam Sun has done a one day review, but a longer audit will take place later in August 2020. The code as it stands today is meant to be used for testing/development purposes only. DO NOT add significant amounts of funds to smart pools using this repo before the proper audit takes place.</em>

This is a smart pool factory that allows anyone to deploy smart pools with (in the reference implementation) seven 
different rights that can be individually chosen:

1) canPauseSwapping: pool creator can pause swaps (base pools can turn swapping on, but not off)
2) canChangeSwapFee: pool creator can change trading fees (subject to min/max values)
3) canChangeWeights: pool creator can change weights, either individually, or following a plan for gradual updates
4) canAddRemoveTokens: pool creator can add/remove tokens (subject to the base pool limits)
5) canWhitelistLPs: pool creator can specify a list of addresses allowed to add/remove liquidity
6) canChangeCap: pool creator can change the BSP cap (max # of pool tokens)
7) canRemoveAllTokens: pool creator can remove all tokens from a pool (and potentially call createPool again)

### CRPFactory.sol

Creates new ConfigurableRightsPools & stores their addresses in a registry.

#### `newCrp`

Creates new ConfigurableRightsPools with the caller as the contract controller.

##### Params
* `address factoryAddress` - BFactory address.
* `PoolParams poolParams` - Structure holding the main parameters that define this pool
* `RightsManager.Rights rights` - Structure defined in an external linked library, with boolean flags for each right


##### Pool Params structure
* `string tokenSymbol` - Symbol of the Balancer Pool Token representing this pool
* `string tokenName` - Name of the Balancer Pool Token representing this pool
* `address[] tokens` - Array of 2-8 token addresses. The pool will hold these.
* `uint256[] startBalances` - Array of initial balances for the tokens specified above.
* `uint256[] startWeights` - Array of initial weights for the tokens specified above.
* `uint swapFee` - Initial swap fee for the pool (subject to min/max limits)

##### Example Code

Note that the weights are "denormalized" values, from 1 to 50 (really 49, as there must be at least two tokens, and the sum must be <= 50>). <br>The denormalized weight of a token is half of its proportional weight (as a percentage). <br>So, a 98% / 2% pool's tokens would have denormalized weights of 49 and 1.

```javascript
const permissions = {
    canPauseSwapping: true,
    canChangeSwapFee: true,
    canChangeWeights: true,
    canAddRemoveTokens: false,
    canWhitelistLPs: false,
    canChangeCap: false,
    canRemoveAllTokens: false,
};

const poolParams = {
    tokenSymbol: 'BPT',
    tokenName: 'BTP Example Name',
    tokens: [XYZ, WETH, DAI], // contract addresses
    startBalances: [toWei('80000'), toWei('40'), toWei('10000')],
    startWeights: [toWei('12'), toWei('1.5'), toWei('1.5')],
    swapFee: toWei('0.003'), // 0.3%
};

await crpFactory.newCrp(
    bfactory.address,
    poolParams,
    permissions
);
```

### ConfigurableRightsPool.sol

> **Pause Swapping Right**

`setPublicSwap(bool publicSwap)`

Turn swapping on (if publicSwap is true), or off - if the pool has that right assigned.

> **Change Swap Fee Right**

`setSwapFee(uint swapFee)`

Set the pool's swap fee (within min/max limits set by the underlying pool)

> **Change weights Right**

`upDateWeight(address token, uint newWeight)`

Updates weight for a given token, while keeping prices the same.
<br>This will change the token balances, and cause tokens to be transferred to or from the caller's wallet
<br>NB: This cannot be done while a gradual update is underway (see below)

`updateWeightsGradually(uint[] newWeights, uint startBlock, uint endBlock)`

Transform all weights gradually and linearly from their present values to those specified in newWeights.
<br>The weights are actually changed, between the specified start and end blocks, by pokeWeights.
<br>This is very flexible. For instance, to halt the update sequence, call this function again with current weights.

`pokeWeights()`

Can be called by anyone (e.g., every block), to move the weights along the scheduled trajectory.

> **Add/Remove tokens Right**

`commitAddToken(address token, uint balance, uint denormalizedWeight)`

Precommits a new token that can be applied addTokenTimeLockInBlocks blocks in the future.

`applyAddToken()`

Applies the token committed in the step above, and mints pool shares -
<br>(if at least addTokenTimeLockInBlocks blocks have passed since the commit).

`removeToken(address token)`

Removes an existing token and returns the balance to the controller.

> **Whitelist Liquidity Provider Right**

`whitelistLiquidityProvider(address provider)`

Add an address, after which this address can join a pool. (Initially, no one can add liquidity, including the controller)

`removeWhitelistedLiquidityProvider(address provider)`

Remove an address, after which this address can no longer join a pool. (Has no effect on existing LPs.)

> Creating a pool from the Factory

`createPool(uint initialSupply)`

Creates a pool with the given initial supply of Pool Tokens (with the asset allocation and weights specified by the factory)
<br>Use this constructor if you canChangeWeights is false, or you accept the default block time parameters for gradual weight change

`createPool(uint initialSupply, uint minimumWeightChangeBlockPeriod, uint addTokenTimeLockInBlocks)`

This overload allows you to specify the block timing parameters (within limits), at pool creation time. They are fixed thereafter.
<br>So you cannot call updateWeightsGradually with a duration <em>(endBlock - startBlock) < minimumWeightChangeBlockPeriod</em>.
<br><em>addTokenTimeLockInBlocks</em> is the total number of blocks that have to pass before a new commited token can be applied

> Adding/Removing Liquidity

`joinPool(uint poolAmountOut, uint[] maxAmountsIn)`

Deposit at most the token amounts specified in <em>maxAmountsIn</em>, and receive <em>poolAmountOut</em> pool tokens in return.

`exitPool(uint poolAmountIn, uint[] minAmountsOut)`

Redeem <em>poolAmountIn</em> pool tokens for at least the token amounts specified in <em>minAmountsOut</em>

There are additional variations for specifying exact amounts (Uniswap-style)

### PCToken.sol

Balancer Smart Pool token. A standard ERC-20 with some extra math functions. Note that the math is normalized such that "1" is 10^18. These tokens have 18 decimals, and a configurable token symbol. (The token name is composed at run time from
a fixed prefix and the symbol.)

### IBFactory.sol

Interface for the [Balancer Factory](https://github.com/balancer-labs/balancer-core/blob/master/contracts/BFactory.sol).

## NOTE

You cannot exit 100% using Pool Tokens (rebind will revert). It is possible to do using unbind with special permissions, but the trade-off is a potential loss of security.

Specifically, if a CRP has the canRemoveAllTokens permission, it is possible to call removeToken for every token in the pool, and recover all assets without loss. (Otherwise, with only canAddRemoveTokens permission, the pool would always need to contain at least two tokens, and you could only "withdraw" 1/3 of the balance at a time through the exit methods.) There are special cases where this is appropriate (e.g., an "auction," where only the controller provides liquidity), but any pools with either "removeToken" right enabled require a high level of trust, since the controller could remove all assets from the pool at any time.

## How to create Configurable Right Pool
At first need to get factory for Configurable Right Pool creation. It avaiable by address in **Rinkeby** testnet

```javascript
const crpFactory = await CRPFactory.at('0x999A3Ab5CF12F884DAc51B426eF1B04A7C3C8deD')
```
For this one need to describe permission and pool parameters
Permission params:

```javascript
const permissions = { 
  canPauseSwapping: true,
  canChangeSwapFee: true,
  canChangeWeights: true,
  canAddRemoveTokens: false,
  canWhitelistLPs: false,
  canChangeCap: false,
  canRemoveAllTokens: false
}
```
For pool params need to get deployed test WETH and XYZ tokens and determine additional values

```javascript
const WETH = '0x1c6b4a446157FB1d609A7F8f077DAF82936a5191'
const XYZ = '0x9D1944Fda601A031Ceb0a2b180ae36238eCb2C13'

const startWeights = [toWei('1'), toWei('39')];
const startBalances = [toWei('80000'), toWei('40')];
const swapFee = 10 ** 15;
```
Pool params:

```javascript
const poolParams = { 
  poolTokenSymbol: 'AYE',
  poolTokenName: 'AYE',
  constituentTokens: [WETH, XYZ],
  tokenBalances: startBalances,
  tokenWeights: startWeights,
  swapFee: swapFee
}
```
In addition need to know Balancer Factory address

```javascript
const BFactoryAddress = '0x3D088F1Ed83B32D141934973042FBc5A0980F89a'
```
Finally CRP could be created
```javascript
const crp = await crpFactory.newCrp(BFactoryAddress, poolParams, permissions)
```
but you can get it in **Rinkeby** testnet by the address
```javascript
const crp = await ConfigurableRightsPool.at('0x974327bdc8eF4367Af6E3A412E12EB4d7bb52D45')
```




### Update weights
In order to make the contract update weights according to plan, you need to call external function `pokeWeights()`. But at first pool has to be created by the CRP. For this one need approve pool tokens
for CRP address 

```javascript
await weth.approve(crp.address, MAX)
await xyz.approve(crp.address, MAX)
```
and then pool could be created
```javascript
await crp.createPool(toWei('100'), 10, 10)
```
Finally, weights could be changed

```javascript
await crp.pokeWeights()
```

Example of transaction you can find by the link https://rinkeby.etherscan.io/tx/0x4b9b36945f2629adeb1228543bc836bb8160a9c9b133b021c54a838032285511
