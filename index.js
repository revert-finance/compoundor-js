require('dotenv').config()

const ethers = require("ethers");

const BigNumber = ethers.BigNumber;

const CONTRACT_RAW = require("./contracts/Contract.json")
const FACTORY_RAW = require("./contracts/IUniswapV3Factory.json")
const POOL_RAW = require("./contracts/IUniswapV3Pool.json")
const NPM_RAW = require("./contracts/INonfungiblePositionManager.json")

const checkInterval = 5000 // quick check each 5 secs
const forceCheckInterval = 60000 * 10 // update each 10 mins
const minGainCostPercent = BigNumber.from(180) // when gains / cost >= 180% do autocompound - before reaching 200%

const factoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984"
const npmAddress = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"

const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
const wsProvider = new ethers.providers.WebSocketProvider(process.env.WS_URL)

const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_RAW.abi, provider)
const factory = new ethers.Contract(factoryAddress, FACTORY_RAW.abi, provider)
const npm = new ethers.Contract(npmAddress, NPM_RAW.abi, provider)

const signer = new ethers.Wallet(process.env.COMPOUNDER_PRIVATE_KEY, provider)

const trackedPositions = {}

async function trackPositions() {
    const depositedFilter = contract.filters.TokenDeposited()
    const withdrawnFilter = contract.filters.TokenWithdrawn()

    const deposited = await contract.queryFilter(depositedFilter)
    const withdrawn = await contract.queryFilter(withdrawnFilter)

    const logs = deposited.concat(withdrawn)
    logs.sort((a, b) => a.blockNumber - b.blockNumber)

    for (const log of logs) {
        if (log.event == "TokenDeposited") {
            await addTrackedPosition(log.args.tokenId)
        } else {
            await removeTrackedPosition(log.args.tokenId)
        }
    }

    // setup ws listeners
    wsProvider.on(depositedFilter, async (...args) => {
        const event = args[args.length - 1]
        const log = contract.interface.parseLog(event)
        await addTrackedPosition(log.args.tokenId)
    })
    wsProvider.on(withdrawnFilter, async (...args) => {
        const event = args[args.length - 1]
        const log = contract.interface.parseLog(event)
        await removeTrackedPosition(log.args.tokenId)
    })
}

async function addTrackedPosition(nftId) {
    const position = await npm.positions(nftId)
    trackedPositions[nftId] = { nftId, token0: position.token0, token1: position.token1, fee: position.fee }
}

async function removeTrackedPosition(nftId) {
    delete trackedPositions[nftId]
}

function updateTrackedPosition(nftId, gains, cost) {
    const now = new Date().getTime()
    if (trackedPositions[nftId].lastCheck) {
        const timeElapsedMs = now - trackedPositions[nftId].lastCheck
        trackedPositions[nftId].gainsPerMs = trackedPositions[nftId].lastGains.sub(gains).div(timeElapsedMs)
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
        const poolContract = await ethers.getContractAt("IUniswapV3Pool", poolAddress);
        const slot0 = await poolContract.slot0()
        const priceX96 = slot0.sqrtPriceX96.pow(2).div(BigNumber.from(2).pow(192 - 96))
        return [tokenPrice0X96 || tokenPrice1X96.mul(priceX96).div(BigNumber.from(2).pow(96)), tokenPrice1X96 || tokenPrice0X96.mul(BigNumber.from(2).pow(96)).div(priceX96)]
    } else {
        // TODO decide what to do here... should never happen
        throw Error("Couldn't find prices for position", position.token0, position.token1, position.fee)
    }
}

async function getTokenETHPriceX96(address) {
    if (address == wethAddress) {
        return BigNumber.from(2).pow(96);
    }
    
    // TODO take average or highest liquidity
    for (let fee of [100, 500, 3000, 10000]) {
        const poolAddress = await factory.getPool(address, wethAddress, fee);
        if (poolAddress > 0) {
            const poolContract = new ethers.Contract(poolAddress, POOL_RAW.abi, provider)
            const isToken1WETH = (await poolContract.token1()).toLowerCase() == wethAddress.toLowerCase();
            const slot0 = await poolContract.slot0()
            return isToken1WETH ? slot0.sqrtPriceX96.pow(2).div(BigNumber.from(2).pow(192 - 96)) : BigNumber.from(2).pow(192 + 96).div(slot0.sqrtPriceX96.pow(2))
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
    const estimatedGains = (trackedPosition.gainsPerMs || BigNumber.from(0)).mul(timeElapsedMs)

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

async function autoCompoundPositions() {
    
    const tokenPriceCache = {}

    try {

        let gasPrice = await provider.getGasPrice()

        console.log("Current gas price", gasPrice.toString())

        for (const nftId in trackedPositions) {

            const trackedPosition = trackedPositions[nftId]

            if (!needsCheck(trackedPosition, gasPrice)) {
                continue;
            }

            const deadline = (await provider.getBlock("latest")).timestamp + 300 //Math.floor(new Date().getTime() / 1000) + 300
            console.log(deadline)
            const [bonus0, bonus1] = await contract.connect(signer).callStatic.autoCompound( { tokenId: nftId, bonusConversion: 0, withdrawBonus: false, doSwap: true, deadline })
            const gasCost = await contract.connect(signer).estimateGas.autoCompound({ tokenId: nftId, bonusConversion: 0, withdrawBonus: false, doSwap: true, deadline })
            
            // update gas price to latest
            gasPrice = await provider.getGasPrice()

            const cost = gasPrice.mul(gasCost)

            const [tokenPrice0X96, tokenPrice1X96] = await getTokenETHPricesX96(trackedPosition, tokenPriceCache)

            const gain0 = bonus0.mul(tokenPrice0X96).div(BigNumber.from(2).pow(96))
            const gain1 = bonus1.mul(tokenPrice1X96).div(BigNumber.from(2).pow(96))
        
            const gains = gain0.add(gain1)

            if (isReady(gains, cost)) {
                const tx = await contract.connect(signer).autoCompound({ tokenId: nftId, bonusConversion: 0, withdrawBonus: false, doSwap: true, deadline })
                console.log("Autocompounded position", nftId, tx)
                updateTrackedPosition(nftId, 0, cost)
            } else {
                updateTrackedPosition(nftId, gains, cost)
            }
        }
    } catch (err) {
        console.log("Error during autocompound", err)
    }

    setTimeout(async () => { autoCompoundPositions() }, checkInterval);
}

async function run() {
    await trackPositions()
    await autoCompoundPositions()
}

run()