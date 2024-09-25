require('dotenv').config()
const ethers = require("ethers");
const axios = require('axios');
const fs = require('fs')

const config = require('./config');

const BigNumber = ethers.BigNumber;

const IERC20_ABI = require("./contracts/IERC20.json")
const CONTRACT_RAW = require("./contracts/Compoundor.json")
const MULTI_RAW = require("./contracts/MultiCompoundor.json")
const FACTORY_RAW = require("./contracts/IUniswapV3Factory.json")
const POOL_RAW = require("./contracts/IUniswapV3Pool.json")
const NPM_RAW = require("./contracts/INonfungiblePositionManager.json")

const whaleAmountUSD = 50000 // check more frequently
const whaleInterval = 60000 * 5 // whales are checked every 5 minutes
const checkInterval = 60000 // quick check each minute
const secondCheckInterval = 60000 * 60 // second check after 60 minutes to estimate fees
const forceCheckInterval = 60000 * 60 * 6 // force check each 6 hours
const checkBalancesInterval = 60000 * 10 // check balances each 10 minutes
const updatePositionsInterval = 60000 // each minute load position list from the graph
const minGainCostPercent = BigNumber.from(process.env.COMPOUND_PERCENTAGE || "100")
const defaultGasLimit = BigNumber.from(500000)
const maxGasLimit = BigNumber.from(5000000)

const network = process.env.NETWORK
const exchange = process.env.EXCHANGE || "uniswap-v3"

const factoryAddress = config.getConfig(exchange, network, "factoryAddress")
const npmAddress = config.getConfig(exchange, network, "npmAddress")

const nativeTokenAddress = config.getConfig(exchange, network, "nativeToken")
const nativeTokenSymbol = config.getConfig(exchange, network, "nativeTokenSymbol")

const txWaitMs = config.getConfig(exchange, network, "txWaitMs")
const lowAlertBalance = config.getConfig(exchange, network, "lowAlertBalance")

// order for reward token preference
const preferedRewardToken = [nativeTokenAddress, config.getConfig(exchange, network, "weth"), config.getConfig(exchange, network, "usdc"), config.getConfig(exchange, network, "usdt"), config.getConfig(exchange, network, "dai")]

const provider = new ethers.providers.JsonRpcProvider(process.env["RPC_URL_" + network.toUpperCase()])
const mainnetProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_MAINNET)

const contractAddress = config.getConfig(exchange, network, "contractAddress")
const contract = new ethers.Contract(contractAddress, CONTRACT_RAW.abi, provider)

const multiCompoundorAddress = config.getConfig(exchange, network, "multiCompoundorAddress")
const useMultiCompoundor = !!multiCompoundorAddress
const multiCompoundor = useMultiCompoundor ? new ethers.Contract(multiCompoundorAddress, MULTI_RAW.abi, provider) : null

const factory = new ethers.Contract(factoryAddress, FACTORY_RAW.abi, provider)
const npm = new ethers.Contract(npmAddress, NPM_RAW.abi, provider)

const signer = new ethers.Wallet(process.env.COMPOUNDER_PRIVATE_KEY, provider)

const trackedPositions = {}
const pricePoolCache = {}

let lastTxHash = null
let lastTxNonce = null
let errorCount = 0
let compoundErrorCount = 0

let discordNonce = 0
let noBalanceAlertSent = false

const graphApiUrl = config.getConfig(exchange, network, "compoundor-subgraph")
const uniswapGraphApiUrl = config.getConfig(exchange, network, "subgraph")

async function getPositionValue(id) {

    try {
        const result = await axios.post(uniswapGraphApiUrl, {
            query: `{ position(id: "${id}") { amountDepositedUSD amountWithdrawnUSD } }`
        })
        return parseFloat(result.data.data.position.amountDepositedUSD) - parseFloat(result.data.data.position.amountWithdrawnUSD)
    } catch (err) {
        return 0
    }
}

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
        if (balance.lt(lowAlertBalance)) {
            await sendDiscordMessage(`LOW BALANCE for Old Compoundor Operator ${ethers.utils.formatEther(balance)} ${nativeTokenSymbol} on ${exchange !== "uniswap-v3" ? exchange + " " : ""} ${network} -> TOP UP ${signer.address}`, process.env.DISCORD_CHANNEL_BALANCE)
        } else {
            noBalanceAlertSent = false
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

async function sendDiscordAlertUrgent(msg) {
    await sendDiscordMessage(msg, process.env.DISCORD_CHANNEL_ALERT_URGENT)
}


async function sendDiscordMessage(msg, channel) {
    try {
        fs.writeFileSync(`../discord/${process.pid}_${new Date().getTime()}_${discordNonce++}.txt`, `${channel}:${msg}`)
    } catch (err) {
        console.log("Error sending to discord", err)
    }
}
   
async function addTrackedPosition(nftId) {
    try {
        const owner = await npm.ownerOf(nftId)
        if (owner.toLowerCase() === contractAddress.toLowerCase()) {
            const position = await npm.positions(nftId)
            const value = position.liquidity.gt(0) ? await getPositionValue(nftId) : 0
            console.log("Add tracked position", nftId, value)
            trackedPositions[nftId] = { nftId, value, token0: position.token0.toLowerCase(), token1: position.token1.toLowerCase(), fee: position.fee, liquidity: position.liquidity, tickLower: position.tickLower, tickUpper: position.tickUpper }
        } else {
            trackedPositions[nftId] = { nftId, ignore: true }
        }
    } catch (err) {
        console.log("Error adding position", nftId)
    }
}

function updateTrackedPosition(nftId, gains, gasLimit) {
    const now = new Date().getTime()

    // only update gains per sec when data available
    if (trackedPositions[nftId].lastCheck) {
        const timeElapsedMs = now - trackedPositions[nftId].lastCheck
        if (gains.gt(trackedPositions[nftId].lastGains)) {
            trackedPositions[nftId].gainsPerSec = (gains.sub(trackedPositions[nftId].lastGains).mul(1000)).div(timeElapsedMs)
        } else {
            // first time here
            if (!trackedPositions[nftId].gainsPerSec) {
                trackedPositions[nftId].gainsPerSec = BigNumber.from(0)
            }
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

    const timeElapsedMs = new Date().getTime() - trackedPosition.lastCheck

    // if it hasnt been checked
    if (!trackedPosition.lastCheck) {
        return true;
    }

    // if it hasnt been checked twice and has liquidity
    if (!trackedPosition.gainsPerSec && trackedPosition.liquidity.gt(0) && timeElapsedMs > secondCheckInterval) {
        return true
    }

    // if it hasnt been checked for a long time - check
    if (new Date().getTime() - trackedPosition.lastCheck > forceCheckInterval) {
        return true
    }

    // if no liquity no check 
    if (trackedPosition.liquidity.eq(0)) {
        return false;
    }

    if (trackedPosition.value >= whaleAmountUSD && timeElapsedMs > whaleInterval) {
        return true
    }

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

async function getGasPrice() {
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
        const gasPrice = await getGasPrice()
        const gasLimit = chunk.reduce((a, c) => a.add(c.gasLimit), BigNumber.from(0))

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

        await waitWithTimeout(tx, txWaitMs)

        const msg = `Multi-Compounded ${nftIds.length} positions on ${network} ${doSwap ? "" : "non-"}swapping and converting to ${rewardConversion == 1 ? "TOKEN0" : "TOKEN1"}`
        console.log(msg)
    }
}

function getRevertUrlForDiscord(id) {
    const exchangeName = network === "evmos" ? "forge-position" : (exchange === "pancakeswap-v3" ? "pancake-position" : "uniswap-position")
    return `<https://revert.finance/#/${exchangeName}/${network}/${id.toString()}>`
}

async function autoCompoundPositions(runNumber = 0) {
    try {
        const tokenPriceCache = {}
        const multiCompoundable = []

        let gasPrice = await getGasPrice()
        console.log("Run", runNumber, "Current gas price", gasPrice.toString())

        for (const nftId of Object.keys(trackedPositions)) {

            try {

                const trackedPosition = trackedPositions[nftId]

                if (!trackedPosition || trackedPosition.ignore) {
                    continue;
                }

                // first two times - must be all positions - to build growthperseconds
                if (!needsCheck(trackedPosition, gasPrice)) {
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
                        gasPrice = await getGasPrice()
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

                                await waitWithTimeout(tx, txWaitMs)

                                compoundErrorCount = 0

                                await sendDiscordInfo(`Compounded position ${getRevertUrlForDiscord(nftId)} for ${ethers.utils.formatEther(result.gains)} ${nativeTokenSymbol}`)

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

                if (!noBalanceAlertSent && err.reason === "insufficient funds for intrinsic transaction cost") {
                    await sendDiscordAlertUrgent(`NO BALANCE for Operator on ${exchange !== "uniswap-v3" ? exchange + " " : ""}${network} -> TOP UP min ${ethers.utils.formatEther(lowAlertBalance)} ${nativeTokenSymbol} to ${signer.address}`)
                    noBalanceAlertSent = true
                }

                errorCount++
                console.log("Error during autocompound position", nftId, err)

                // wait 10 secs after each error
                await new Promise(resolve => setTimeout(resolve, Math.max(errorCount, compoundErrorCount) * 10000));

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
