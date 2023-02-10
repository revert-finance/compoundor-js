require('dotenv').config()
const ethers = require("ethers");
const axios = require('axios');
const univ3prices = require('@thanpolas/univ3prices')


const BigNumber = ethers.BigNumber;

const IERC20_ABI = require("./contracts/IERC20.json")
const CONTRACT_RAW = require("./contracts/Compoundor.json")
const MULTI_RAW = require("./contracts/MultiCompoundor.json")
const FACTORY_RAW = require("./contracts/IUniswapV3Factory.json")
const POOL_RAW = require("./contracts/IUniswapV3Pool.json")
const NPM_RAW = require("./contracts/INonfungiblePositionManager.json")

const checkInterval = 60000 // quick check each 60 secs

const forceCheckInterval = 60000 * 60 * 12 // force check each 12 hours
const checkBalancesInterval = 60000 * 60 * 4 // check balances each 4 hours
const updatePositionsInterval = 60000 // each minute load position list from the graph
const minGainCostPercent = BigNumber.from(process.env.COMPOUND_PERCENTAGE || "125") // keep 25% after fees
const minMultiGainCostPercent = BigNumber.from(process.env.MULTI_COMPOUND_PERCENTAGE || "1000")
const defaultGasLimit = BigNumber.from(500000)
const maxGasLimit = BigNumber.from(5000000)

const factoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984"
const npmAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"

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
const txWaitMs = {
    "mainnet": 20000,
    "polygon": 5000,
    "optimism": 3000,
    "arbitrum": 3000
}
const lowAlertBalances = {
    "mainnet": BigNumber.from("100000000000000000"),  // 0.1 ETH
    "polygon": BigNumber.from("10000000000000000000"), // 10 MATIC
    "optimism": BigNumber.from("10000000000000000"), // 0.01 ETH
    "arbitrum": BigNumber.from("10000000000000000")  // 0.01 ETH
}

const network = process.env.NETWORK
const nativeTokenAddress = nativeTokenAddresses[network]
const nativeTokenSymbol = network === "polygon" ? "MATIC" : "ETH"


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

const useMultiCompoundor = network === "optimism"
const multiCompoundorAddress = "0xbDd1D443118554fEb151406622a3B586992b49D3"
const multiCompoundor = new ethers.Contract(multiCompoundorAddress, MULTI_RAW.abi, provider)

const factory = new ethers.Contract(factoryAddress, FACTORY_RAW.abi, provider)
const npm = new ethers.Contract(npmAddress, NPM_RAW.abi, provider)

const signer = new ethers.Wallet(process.env.COMPOUNDER_PRIVATE_KEY, provider)

const trackedPositions = {}
const pricePoolCache = {}

let lastTxHash = null
let lastTxNonce = null
let errorCount = 0
let compoundErrorCount = 0

const graphApiUrl = "https://api.thegraph.com/subgraphs/name/revert-finance/compoundor-" + network

async function getPositions() {

    const tokens = []
    const take = 1000
    let result
    let currentId = ""
    do {
        result = await axios.post(graphApiUrl, {
            query: `{ tokens(where: { account_not: null, id_gt: "${currentId}"}, first: ${take}, orderBy: id) { id } }`
        })
        tokens.push(...result.data.data.tokens.map(t => parseInt(t.id, 10)))
        if (result.data.data.tokens.length == take) {
            currentId = result.data.data.tokens[result.data.data.tokens.length - 1].id // paging by id
        }
    } while (result.data.data.tokens.length == take)
  
    return tokens
}

async function updateTrackedPositions() {
    try {
        const nftIds = await getPositions()
        for (const nftId of nftIds) {
            if (!trackedPositions[nftId]) {
                await addTrackedPosition(nftId)
            }
        }
        for (const nftId of Object.values(trackedPositions).map(x => x.nftId)) {
            if (nftIds.indexOf(nftId) === -1) {
                delete trackedPositions[nftId];
                console.log("Remove tracked position", nftId)
            }
        }
    } catch (err) {
        console.log("Error in updateTrackedPositions", err)
    }
}


async function checkBalances() {
    try {
        const balance = await provider.getBalance(signer.address);
        if (balance.lt(lowAlertBalances[network])) {
            await sendDiscordAlert(`LOW BALANCE on ${network} ${ethers.utils.formatEther(balance)} ${nativeTokenSymbol}`)
        }
    } catch (err) {
        console.log("Error in checkBalances", err)
    }
}


async function sendDiscordInfo(msg) {
    await sendDiscordMessage(msg, process.env.DISCORD_CHANNEL)
}

async function sendDiscordAlert(msg) {
    await sendDiscordMessage(msg, process.env.DISCORD_CHANNEL_ALERT)
}

async function sendDiscordMessage(msg, channel) {
    try {
        const config = {
            headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`
            }
        }
        await axios.post(`https://discordapp.com/api/channels/${channel}/messages`, { "content": msg }, config)
    } catch (err) {
        console.log("Error sending to discord", err)
    }
}
   
async function addTrackedPosition(nftId) {
    console.log("Add tracked position", nftId)
    const position = await npm.positions(nftId)
    trackedPositions[nftId] = { nftId, token0: position.token0.toLowerCase(), token1: position.token1.toLowerCase(), fee: position.fee, liquidity: position.liquidity, tickLower: position.tickLower, tickUpper: position.tickUpper }
}

function updateTrackedPosition(nftId, gains, gasLimit) {
    const now = new Date().getTime()

    // only update gains per sec when data available
    if (trackedPositions[nftId].lastCheck) {
        const timeElapsedMs = now - trackedPositions[nftId].lastCheck
        if (gains.gt(trackedPositions[nftId].lastGains)) {
            trackedPositions[nftId].gainsPerSec = (gains.sub(trackedPositions[nftId].lastGains).mul(1000)).div(timeElapsedMs)
        }
    }
    trackedPositions[nftId].lastCheck = now
    trackedPositions[nftId].lastGains = gains
    trackedPositions[nftId].lastGasLimit = gasLimit
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

        if (!tokenPrice0X96) {
            cache[position.token0] = tokenPrice1X96.mul(priceX96).div(BigNumber.from(2).pow(96))
        }
        if (!tokenPrice1X96) {
            cache[position.token1] = (priceX96.gt(0) ? tokenPrice0X96.mul(BigNumber.from(2).pow(96)).div(priceX96) : BigNumber.from(0))
        }

        return [cache[position.token0], cache[position.token1]]
    } else {
        console.log("Couldn't find prices for position", position.token0, position.token1, position.fee)
        return [BigNumber.from(0), BigNumber.from(0)]
    }
}

async function getTokenETHPriceX96(address) {
    if (address.toLowerCase() == nativeTokenAddress.toLowerCase()) {
        return BigNumber.from(2).pow(96);
    }


    let price = null

    const pricePool = await findPricePoolForToken(address)
    if (pricePool.address > 0) {
        const poolContract = new ethers.Contract(pricePool.address, POOL_RAW.abi, provider)
        const slot0 = await poolContract.slot0()
        if (slot0.sqrtPriceX96.gt(0)) {
            price = pricePool.isToken1WETH ? slot0.sqrtPriceX96.pow(2).div(BigNumber.from(2).pow(192 - 96)) : BigNumber.from(2).pow(192 + 96).div(slot0.sqrtPriceX96.pow(2))
        }
    }

    return price
}

async function findPricePoolForToken(address) {

    if (pricePoolCache[address]) {
        return pricePoolCache[address]
    }

    const minimalBalanceETH = BigNumber.from(10).pow(18)
    let maxBalanceETH = BigNumber.from(0)
    let pricePoolAddress = null
    let isToken1WETH = null

    const nativeToken = new ethers.Contract(nativeTokenAddress, IERC20_ABI, provider)

    for (let fee of [100, 500, 3000, 10000]) {
        const candidatePricePoolAddress = await factory.getPool(address, nativeTokenAddress, fee)
        if (candidatePricePoolAddress > 0) {
            const poolContract = new ethers.Contract(candidatePricePoolAddress, POOL_RAW.abi, provider)

            const balanceETH = (await nativeToken.balanceOf(candidatePricePoolAddress))
            if (balanceETH.gt(maxBalanceETH) && balanceETH.gte(minimalBalanceETH)) {
                pricePoolAddress = candidatePricePoolAddress
                maxBalanceETH = balanceETH
                if (isToken1WETH === null) {
                    isToken1WETH = (await poolContract.token1()).toLowerCase() == nativeTokenAddress.toLowerCase();
                }
            }

        }
    }

    pricePoolCache[address] = { address: pricePoolAddress, isToken1WETH }

    return pricePoolCache[address]
}

function isReady(gains, cost, minPercent) {
    if (gains.mul(100).div(cost).gte(minPercent)) {
        return true;
    }
}

function needsCheck(trackedPosition, gasPrice) {

    // if it hasnt been checked before
    if (!trackedPosition.lastCheck) {
        return true;
    }

    // if it hasnt been checked for a long time - check
    if (new Date().getTime() - trackedPosition.lastCheck > forceCheckInterval) {
        return true
    }

    // if no liquity no check 
    if (trackedPosition.liquidity.eq(0)) {
        return false;
    }

    const timeElapsedMs = new Date().getTime() - trackedPosition.lastCheck
    const estimatedGains = (trackedPosition.gainsPerSec || BigNumber.from(0)).mul(BigNumber.from(timeElapsedMs).div(1000))

    // if its ready with current gas price - check
    if (isReady(trackedPosition.lastGains.add(estimatedGains), gasPrice.mul(trackedPosition.lastGasLimit), minGainCostPercent)) {
        return true;
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
            if (gasLimit.gt(maxGasLimit)) {
                return { error: true, message: "Gas cost exceeded" }
            }

            const res = await contract.connect(signer).callStatic.autoCompound({ tokenId: nftId, rewardConversion, withdrawReward, doSwap }, { gasLimit: gasLimit.mul(11).div(10) })
            reward0 = res.compounded0.div(100)
            reward1 = res.compounded1.div(100)
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
        return (await mainnetProvider.getGasPrice()).div(89) // TODO optimism estimation - for autocompound call - good enough for now
    }
    return await provider.getGasPrice()
}

async function waitWithTimeout(tx, timeoutMs) {
    return new Promise((resolve, reject) => {
        tx.wait(1).then(() => resolve()).catch(err => reject(err))
        setTimeout(() => resolve(), timeoutMs)
    })
}

async function createTxParams(gasLimit, gasPrice) {

    // add a bit of extra gaslimit
    const params = { gasLimit: gasLimit.mul(11).div(10) }

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

    // if there is a pending tx - check if added - if not overwrite with new gas value
    if (lastTxHash) {
        const txReceipt = await provider.getTransactionReceipt(lastTxHash)
        const txCount = await provider.getTransactionCount(signer.address)
        if ((txReceipt && txReceipt.blockNumber) || txCount > lastTxNonce) {
            lastTxHash = null
            lastTxNonce = null
        } else {
            console.log("Overwrite tx with nonce", lastTxNonce)
            params.nonce = lastTxNonce
        }
    }

    return params
}

async function doMultiCompound(positions, doSwap, rewardConversion) {

    if (positions.length === 0) {
        return
    }

    const chunkSize = 50
    for (let i = 0; i < positions.length; i += chunkSize) {
        const chunk = positions.slice(i, i + chunkSize)

        const totalGains = chunk.reduce((a, c) => a.add(c.gains), BigNumber.from(0))
        const gasPrice = await getGasPrice(true)
        const gasLimit = chunk.reduce((a, c) => a.add(c.gasLimit), BigNumber.from(0))

        // TODO add factor for cost estimating gas limit depending on position count - average for now
        const estimatingGasLimit = gasLimit.div(chunk.length)

        if (isReady(totalGains, gasPrice.mul(estimatingGasLimit), minMultiGainCostPercent)) {
            const params = await createTxParams(gasLimit, gasPrice)
            const nftIds = chunk.map(x => x.nftId)

            compoundErrorCount++

            let tx;
            if (doSwap) {
                if (rewardConversion == 1) {
                    tx = await multiCompoundor.connect(signer).runConv0Swap(nftIds, params)
                } else {
                    tx = await multiCompoundor.connect(signer).runConv1Swap(nftIds, params)
                }
            } else {
                if (rewardConversion == 1) {
                    tx = await multiCompoundor.connect(signer).runConv0NoSwap(nftIds, params)
                } else {
                    tx = await multiCompoundor.connect(signer).runConv1NoSwap(nftIds, params)
                }
            }

            compoundErrorCount = 0

            lastTxHash = tx.hash
            lastTxNonce = tx.nonce

            for (const pos of chunk) {
                await sendDiscordInfo(`Compounded position ${pos.nftId} on ${network} for ${ethers.utils.formatEther(pos.gains)} ${nativeTokenSymbol} - https://revert.finance/#/uniswap-position/${network}/${pos.nftId}`)
                updateTrackedPosition(pos.nftId, BigNumber.from(0), pos.gasLimit)
            }

            await waitWithTimeout(tx, txWaitMs[network])

            const msg = `Multi-Compounded ${nftIds.length} positions on ${network} ${doSwap ? "" : "non-"}swapping and converting to ${rewardConversion == 1 ? "TOKEN0" : "TOKEN1"}`
            console.log(msg)
        }
    }
}

async function autoCompoundPositions(runNumber = 0) {
    try {
        const tokenPriceCache = {}
        const multiCompoundable = []

        let gasPrice = await getGasPrice(true)
        console.log("Run", runNumber, "Current gas price", gasPrice.toString())

        for (const nftId of Object.keys(trackedPositions)) {

            try {

                const trackedPosition = trackedPositions[nftId]

                if (!trackedPosition) {
                    continue;
                }

                // first two times - must be all positions - to build growthperseconds
                if (runNumber >= 2 && !needsCheck(trackedPosition, gasPrice)) {
                    continue;
                }

                // check if liquidity is really 0
                if (trackedPosition.liquidity.eq(0)) {
                    const position = await npm.positions(nftId)
                    trackedPosition.liquidity = position.liquidity
                }

                // only check positions with liquidity
                if (trackedPosition.liquidity.gt(0)) {

                    const [tokenPrice0X96, tokenPrice1X96] = await getTokenETHPricesX96(trackedPosition, tokenPriceCache)

                    const indexOf0 = preferedRewardToken.indexOf(trackedPosition.token0)
                    const indexOf1 = preferedRewardToken.indexOf(trackedPosition.token1)

                    // if none prefered token found - keep original tokens - otherwise convert to first one in list
                    const rewardConversion = indexOf0 === -1 && indexOf1 == -1 ? 0 : (indexOf0 === -1 ? 2 : (indexOf1 === -1 ? 1 : (indexOf0 < indexOf1 ? 1 : 2)))

                    // dont withdraw reward for now
                    const withdrawReward = false

                    // update gas price to latest
                    if (!useMultiCompoundor) {
                        gasPrice = await getGasPrice(true)
                    }

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

                        if (isReady(result.gains, result.cost, minGainCostPercent)) {

                            if (!useMultiCompoundor) {
                                const params = await createTxParams(result.gasLimit, gasPrice)

                                compoundErrorCount++

                                const tx = await contract.connect(signer).autoCompound({ tokenId: nftId, rewardConversion, withdrawReward, doSwap: result.doSwap }, params)
                                lastTxHash = tx.hash
                                lastTxNonce = tx.nonce

                                await waitWithTimeout(tx, txWaitMs[network])

                                compoundErrorCount = 0

                                await sendDiscordInfo(`Compounded position ${nftId} on ${network} for ${ethers.utils.formatEther(result.gains)} ${nativeTokenSymbol} - https://revert.finance/#/uniswap-position/${network}/${nftId}`)

                                console.log("Autocompounded position", nftId, tx.hash)
                                updateTrackedPosition(nftId, result.gains, result.gasLimit)
                                updateTrackedPosition(nftId, BigNumber.from(0), result.gasLimit)
                            } else {
                                multiCompoundable.push({ nftId, doSwap: result.doSwap, rewardConversion, gains: result.gains, gasLimit: result.gasLimit })
                                updateTrackedPosition(nftId, result.gains, result.gasLimit)
                            }
                        } else {
                            updateTrackedPosition(nftId, result.gains, result.gasLimit)
                        }
                    } else {
                        updateTrackedPosition(nftId, BigNumber.from(0), defaultGasLimit)
                        console.log("Error calculating", nftId, resultA.message)
                    }
                } else {
                    updateTrackedPosition(nftId, BigNumber.from(0), defaultGasLimit)
                }

                // reset error counter
                errorCount = 0

            } catch (err) {
                errorCount++
                console.log("Error during autocompound position", nftId, err)

                // if many consecutive errors - stop this run
                if (errorCount >= 10 || compoundErrorCount >= 5) {
                    errorCount = 0
                    compoundErrorCount = 0
                    throw err
                }
            }
        }

        if (useMultiCompoundor) {
            const swapConv0 = multiCompoundable.filter(c => c.doSwap && (c.rewardConversion == 0 || c.rewardConversion == 1))
            await doMultiCompound(swapConv0, true, 1)

            const swapConv1 = multiCompoundable.filter(c => c.doSwap && c.rewardConversion == 2)
            await doMultiCompound(swapConv1, true, 2)

            const noSwapConv0 = multiCompoundable.filter(c => !c.doSwap && (c.rewardConversion == 0 || c.rewardConversion == 1))
            await doMultiCompound(noSwapConv0, false, 1)

            const noSwapConv1 = multiCompoundable.filter(c => !c.doSwap && c.rewardConversion == 2)
            await doMultiCompound(noSwapConv1, false, 2)
        }

    } catch (err) {
        await sendDiscordAlert(`Error on ${network}: ${err}`)
        console.log("Error during autocompound", err)
    }
    setTimeout(async () => { await autoCompoundPositions(runNumber + 1) }, checkInterval);
}

async function run() {
    await checkBalances()
    await updateTrackedPositions()
    await autoCompoundPositions()
    setInterval(async () => { await updateTrackedPositions() }, updatePositionsInterval);
    setInterval(async () => { await checkBalances() }, checkBalancesInterval);
}

run()
