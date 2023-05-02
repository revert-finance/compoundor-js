require('dotenv').config()
const fs = require('fs')
const ethers = require("ethers");
const axios = require('axios');

const IERC20_ABI = require("../contracts/IERC20.json")
const CONTRACT_RAW = require("../contracts/Compoundor.json")

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
const signer = new ethers.Wallet(process.env.COMPOUNDER_PRIVATE_KEY, provider)

const contractAddress = "0x5411894842e610c4d0f6ed4c232da689400f94a1"
const contract = new ethers.Contract(contractAddress, CONTRACT_RAW.abi, provider)
const timeLockContract = new ethers.Contract(process.env.TIME_LOCK, ["function schedule(address,uint256,bytes,bytes32,bytes32,uint256)"], provider)
const revertFinance = "0x8cadb20a4811f363dadb863a190708bed26245f8"

const tokens = ["WETH", "WBTC", "WMATIC", "USDC", "USDT", "DAI"]

async function getBalances(network, owner) {
    const graphApiUrl = "https://api.thegraph.com/subgraphs/name/revert-finance/compoundor-" + network
    let result = await axios.post(graphApiUrl, {
        query: `{accountBalances(first: 1000, where: { balance_gt: 0, account: "${owner}"}) { token balance }}`
    })
    return result.data.data.accountBalances
}

async function createTxs(network, owner) {
    const balances = await getBalances(network, owner)
    const calls = []
    for (const bal of balances) {
        const token = new ethers.Contract(bal.token, IERC20_ABI, provider)
        const tx = await contract.populateTransaction.withdrawBalance(bal.token, revertFinance, bal.balance)
        const symbol = await token.symbol()
        console.log(symbol)
        const decimals = await token.decimals()
        console.log(ethers.utils.formatUnits(bal.balance, decimals))
        //console.log(tx.data)
        if (tokens.includes(symbol)) {
            calls.push(tx.data)
        }
    }

    const mtx = await contract.populateTransaction.multicall(calls)
    const tlx = await timeLockContract.populateTransaction.schedule(contractAddress, 0, mtx.data, ethers.constants.HashZero, ethers.constants.HashZero, 86400)
    
    fs.writeFileSync(process.env.NETWORK.toLowerCase() + "_call.json", JSON.stringify(tlx))
}

async function run() {
    await createTxs(process.env.NETWORK, process.env.TIME_LOCK)
}

run()
