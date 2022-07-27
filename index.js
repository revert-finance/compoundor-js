require('dotenv').config()
const ethers = require("ethers");
const axios = require('axios');


const BigNumber = ethers.BigNumber;

const CONTRACT_RAW = require("./contracts/Compoundor.json")
const FACTORY_RAW = require("./contracts/IUniswapV3Factory.json")
const POOL_RAW = require("./contracts/IUniswapV3Pool.json")
const NPM_RAW = require("./contracts/INonfungiblePositionManager.json")

const checkInterval = 30000 // quick check each 30 secs
const forceCheckInterval = 60000 * 10 // update each 10 mins
const updatePositionsInterval = 60000 // each minute load position list from the graph
const checkGainsInterval = 60000 * 60 // each hour check balances
const minGainCostPercent = BigNumber.from(99) // when gains / cost >= 99% do autocompound (protocol fee covers the rest)
const defaultGasLimit = BigNumber.from(500000)
const maxGasLimit = BigNumber.from(1000000)
const maxGasLimitArbitrum = BigNumber.from(2000000)

const factoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984"
const npmAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"

const nativeTokenName = {
    "mainnet": "ETH",
    "polygon": "MATIC",
    "optimism": "ETH",
    "arbitrum": "ETH"
}
const nativeTokenAddresses = {
    "mainnet": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "polygon": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    "optimism": "0x4200000000000000000000000000000000000006",
    "arbitrum": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"
}
const wethAddresses = {
    "mainnet": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "polygon": "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    "optimism": "0x4200000000000000000000000000000000000006",
    "arbitrum": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"
}
const usdcAddresses = {
    "mainnet": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "polygon": "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    "optimism": "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
    "arbitrum": "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
}
const usdtAddresses = {
    "mainnet": "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "polygon": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    "optimism": "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    "arbitrum": "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"
}
const daiAddresses = {
    "mainnet": "0x6b175474e89094c44da98b954eedeac495271d0f",
    "polygon": "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    "optimism": "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    "arbitrum": "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"
}

const network = process.env.NETWORK
const nativeTokenAddress = nativeTokenAddresses[network]

// order for reward token preference 
const preferedRewardToken = [nativeTokenAddress, wethAddresses[network], usdcAddresses[network], usdtAddresses[network], daiAddresses[network]]

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
const mainnetProvider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_RPC_URL)

// special gas price handling for polygon
if (network === "polygon") {
    const { createGetGasPrice } = require('./lib/polygongastracker');
    provider.getGasPrice = createGetGasPrice('rapid')
}

const contractAddress = "0x5411894842e610c4d0f6ed4c232da689400f94a1"

const contract = new ethers.Contract(contractAddress, CONTRACT_RAW.abi, provider)
const factory = new ethers.Contract(factoryAddress, FACTORY_RAW.abi, provider)
const npm = new ethers.Contract(npmAddress, NPM_RAW.abi, provider)

const signer = new ethers.Wallet(process.env.COMPOUNDER_PRIVATE_KEY, provider)

const trackedPositions = {}

const graphApiUrl = "https://api.thegraph.com/subgraphs/name/revert-finance/compoundor-" + network

async function getPositions() {
    const result = await axios.post(graphApiUrl, {
        query: "{ tokens(where: { account_not: null }) { id } }"
    })
    return result.data.data.tokens.map(t => parseInt(t.id, 10))
}

async function getTokenBalances(account) {
    const result = await axios.post(graphApiUrl, {
        query: "{ accountBalances(where: { account: \"" + account + "\" }) { token, balance } }"
    })
    return result.data.data.accountBalances
}

async function updateTrackedPositions() {
    const nftIds = await getPositions()
    for (const nftId of nftIds) {
        if (!trackedPositions[nftId]) {
            await addTrackedPosition(nftId)
        }
    }
}

async function addTrackedPosition(nftId) {
    console.log("Add tracked position", nftId)
    const position = await npm.positions(nftId)
    trackedPositions[nftId] = { nftId, token0: position.token0.toLowerCase(), token1: position.token1.toLowerCase(), fee: position.fee, liquidity: position.liquidity, tickLower: position.tickLower, tickUpper: position.tickUpper }
}

function updateTrackedPosition(nftId, gains, cost) {
    const now = new Date().getTime()
    if (trackedPositions[nftId].lastCheck) {
        const timeElapsedMs = now - trackedPositions[nftId].lastCheck
        trackedPositions[nftId].gainsPerSec = (gains.sub(trackedPositions[nftId].lastGains).mul(1000)).div(timeElapsedMs)
    }
    trackedPositions[nftId].lastCheck = now
    trackedPositions[nftId].lastGains = gains
    trackedPositions[nftId].lastCost = cost
}

async function getTokenETHPricesX96(position, cache) {

    const tokenPrice0X96 = cache[position.token0] || await getTokenETHPriceX96(position.token0)
    const tokenPrice1X96 = cache[position.token1] || await getTokenETHPriceX96(position.token1)

    cache[position.token0] = tokenPrice0X96
    cache[position.token1] = tokenPrice1X96

    if (tokenPrice0X96 && tokenPrice1X96) {
        return [tokenPrice0X96, tokenPrice1X96]
    } else if (tokenPrice0X96 || tokenPrice1X96) {
        // if only one has ETH pair - calculate other with pool price
        const poolAddress = await factory.getPool(position.token0, position.token1, position.fee);
        const poolContract = new ethers.Contract(poolAddress, POOL_RAW.abi, provider)
        const slot0 = await poolContract.slot0()
        const priceX96 = slot0.sqrtPriceX96.pow(2).div(BigNumber.from(2).pow(192 - 96))
        return [tokenPrice0X96 || tokenPrice1X96.mul(priceX96).div(BigNumber.from(2).pow(96)), tokenPrice1X96 || tokenPrice0X96.mul(BigNumber.from(2).pow(96)).div(priceX96)]
    } else {
        // TODO decide what to do here... should never happen
        throw Error("Couldn't find prices for position", position.token0, position.token1, position.fee)
    }
}

async function getTokenETHPriceX96(address) {
    if (address.toLowerCase() == nativeTokenAddress.toLowerCase()) {
        return BigNumber.from(2).pow(96);
    }

    // TODO take average or highest liquidity
    for (let fee of [100, 500, 3000, 10000]) {
        const poolAddress = await factory.getPool(address, nativeTokenAddress, fee);
        if (poolAddress > 0) {
            const poolContract = new ethers.Contract(poolAddress, POOL_RAW.abi, provider)
            const isToken1WETH = (await poolContract.token1()).toLowerCase() == nativeTokenAddress.toLowerCase();
            const slot0 = await poolContract.slot0()
            if (slot0.sqrtPriceX96.gt(0)) {
                return isToken1WETH ? slot0.sqrtPriceX96.pow(2).div(BigNumber.from(2).pow(192 - 96)) : BigNumber.from(2).pow(192 + 96).div(slot0.sqrtPriceX96.pow(2))
            }
        }
    }

    return null
}

function isReady(gains, cost) {
    if (gains.mul(100).div(cost).gte(minGainCostPercent)) {
        return true;
    }
}

function needsCheck(trackedPosition, gasPrice) {
    // if it hasnt been checked before
    if (!trackedPosition.lastCheck) {
        return true;
    }

    const timeElapsedMs = new Date().getTime() - trackedPosition.lastCheck
    const estimatedGains = (trackedPosition.gainsPerSec || BigNumber.from(0)).mul(BigNumber.from(timeElapsedMs).div(1000))

    // if its ready with current gas price - check
    if (isReady(trackedPosition.lastGains.add(estimatedGains), gasPrice.mul(trackedPosition.lastCost))) {
        return true;
    }
    // if it hasnt been checked for a long time - check
    if (new Date().getTime() - trackedPosition.lastCheck > forceCheckInterval) {
        return true
    }
    return false;
}

async function calculateCostAndGains(nftId, rewardConversion, withdrawReward, doSwap, gasPrice, tokenPrice0X96, tokenPrice1X96) {

    try {
        let gasLimit = defaultGasLimit
        let reward0 = BigNumber.from(0)
        let reward1 = BigNumber.from(0)

        // only autocompound when fees available
        const fees = await npm.connect(ethers.constants.AddressZero).callStatic.collect([nftId, signer.address, BigNumber.from(2).pow(128).sub(1), BigNumber.from(2).pow(128).sub(1)])
        if (fees.amount0.gt(0) || fees.amount1.gt(0)) {

            gasLimit = await contract.connect(signer).estimateGas.autoCompound({ tokenId: nftId, rewardConversion, withdrawReward, doSwap })

            // to high cost - skip
            if (network !== "arbitrum" && gasLimit.gt(maxGasLimit) || network === "arbitrum" && gasLimit.gt(maxGasLimitArbitrum)) {
                return { error: true, message: "Gas cost exceeded" }
            }

            [reward0, reward1] = await contract.connect(signer).callStatic.autoCompound({ tokenId: nftId, rewardConversion, withdrawReward, doSwap }, { gasLimit: gasLimit.mul(11).div(10) })
        }

        const cost = gasPrice.mul(gasLimit)

        const gain0 = reward0.mul(tokenPrice0X96).div(BigNumber.from(2).pow(96))
        const gain1 = reward1.mul(tokenPrice1X96).div(BigNumber.from(2).pow(96))

        const gains = gain0.add(gain1)

        return { gains, cost, gasLimit, doSwap }

    } catch (err) {
        return { error: true, message: err.message }
    }
}

async function getGasPrice(isEstimation) {
    if (network == "optimism" && isEstimation) {
        return (await mainnetProvider.getGasPrice()).div(89) // optimism estimation - for autocompound call
    }
    return await provider.getGasPrice()
}

async function checkGains() {
    const tokenBalances = await getTokenBalances(await signer.getAddress())
    let gains = BigNumber.from(0)
    for(const balance of tokenBalances) {
        const tokenPriceX96 = await getTokenETHPriceX96(balance.token)
        const gain = BigNumber.from(balance.balance).mul(tokenPriceX96).div(BigNumber.from(2).pow(96))
        gains = gains.add(gain)
    }
    console.log(ethers.utils.formatEther(gains), nativeTokenName[network])
}

async function autoCompoundPositions() {

    const tokenPriceCache = {}
    const toRemove = []

    try {
        let gasPrice = await getGasPrice(true)

        console.log("Current gas price", gasPrice.toString())

        for (const nftId in trackedPositions) {

            const trackedPosition = trackedPositions[nftId]

            if (!needsCheck(trackedPosition, gasPrice)) {
                continue;
            }

            // update gas price to latest
            gasPrice = await getGasPrice(true)
            const [tokenPrice0X96, tokenPrice1X96] = await getTokenETHPricesX96(trackedPosition, tokenPriceCache)

            const indexOf0 = preferedRewardToken.indexOf(trackedPosition.token0)
            const indexOf1 = preferedRewardToken.indexOf(trackedPosition.token1)

            // if none prefered token found - keep original tokens - otherwise convert to first one in list
            const rewardConversion = indexOf0 === -1 && indexOf1 == -1 ? 0 : (indexOf0 === -1 ? 2 : (indexOf1 === -1 ? 1 : (indexOf0 < indexOf1 ? 1 : 2)))

            // dont withdraw reward for now
            const withdrawReward = false

            // try with and without swap
            const resultA = await calculateCostAndGains(nftId, rewardConversion, withdrawReward, true, gasPrice, tokenPrice0X96, tokenPrice1X96)
            const resultB = await calculateCostAndGains(nftId, rewardConversion, withdrawReward, false, gasPrice, tokenPrice0X96, tokenPrice1X96)

            if (!resultA.error || !resultB.error) {
                let result = null
                if (!resultA.error && !resultB.error) {
                    result = resultA.gains.sub(resultA.cost).gt(resultB.gains.sub(resultB.cost)) ? resultA : resultB
                } else if (!resultA.error) {
                    result = resultA
                } else {
                    result = resultB
                }

                console.log("Position progress", nftId, result.gains.mul(100).div(result.cost) + "%")

                if (isReady(result.gains, result.cost)) {
                    const params = { gasLimit: result.gasLimit.mul(11).div(10) }
                    if (network == "mainnet") {
                        // mainnet EIP-1559 handling
                        const feeData = await provider.getFeeData()
                        params.maxFeePerGas = feeData.maxFeePerGas
                        params.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
                    } else if (network == "optimism") {
                        params.gasPrice = await getGasPrice(false)
                    } else {
                        params.gasPrice = gasPrice
                    }
                    const tx = await contract.connect(signer).autoCompound({ tokenId: nftId, rewardConversion, withdrawReward, doSwap: result.doSwap }, params)
                    console.log("Autocompounded position", nftId, tx.hash)
                    updateTrackedPosition(nftId, BigNumber.from(0), result.cost)
                } else {
                    updateTrackedPosition(nftId, result.gains, result.cost)
                }
            } else {
                updateTrackedPosition(nftId, BigNumber.from(0), defaultGasLimit.mul(gasPrice))
                console.log("Error calculating", nftId, resultA.message)
            }
        }

        // remove errored positions - usually happens because they were removed
        toRemove.forEach(nftId => {
            console.log("Removed tracked position", nftId)
            delete trackedPositions[nftId]
        })
    } catch (err) {
        console.log("Error during autocompound", err)
    }

    setTimeout(async () => { await autoCompoundPositions() }, checkInterval);

}

async function run() {

    await updateTrackedPositions()
    await autoCompoundPositions()

    await checkGains()

    setInterval(async () => { await updateTrackedPositions() }, updatePositionsInterval);
    setInterval(async () => { await checkGains() }, checkGainsInterval);
}

run()