// script to get multisig command for collecting protocol fees via timelock / executing multicall directly on contract (where no multisig is set)

require('dotenv').config()
const fs = require('fs')
const ethers = require("ethers");
const axios = require('axios');

const IERC20_ABI = require("../contracts/IERC20.json")
const CONTRACT_RAW = require("../contracts/Compoundor.json");
const { sign } = require('crypto');

const config = require('../config');

const network = process.env.NETWORK
const exchange = process.env.EXCHANGE || "uniswap-v3"

const provider = new ethers.providers.JsonRpcProvider(process.env["RPC_URL_" + network.toUpperCase()])
const signer = new ethers.Wallet(network == "bnb" && exchange == "uniswap-v3" ? process.env.COMPOUNDER_PRIVATE_KEY_BNB : process.env.COMPOUNDER_PRIVATE_KEY, provider)

const contractAddress = config.getConfig(exchange, network, "contractAddress")
const contract = new ethers.Contract(contractAddress, CONTRACT_RAW.abi, provider)
const timeLockAddress = process.env["TIME_LOCK_" + network.toUpperCase()]
const timeLockContract = timeLockAddress ? new ethers.Contract(timeLockAddress, ["function schedule(address,uint256,bytes,bytes32,bytes32,uint256)"], provider) : null

const revertFinance = "0xe247a0B71C396B024d8048529801763eda4928d3" // WITHDRAWER account (to swap tokens afterwards)

async function getBalances(network, owner) {
    const graphApiUrl = config.getConfig(exchange, network, "compoundor-subgraph")
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
        calls.push(tx.data)
    }

    const mtx = await contract.populateTransaction.multicall(calls)

    if (timeLockContract) {
        const tlx = await timeLockContract.populateTransaction.schedule(contractAddress, 0, mtx.data, ethers.constants.HashZero, ethers.constants.HashZero, 86400)
        fs.writeFileSync(process.env.NETWORK.toLowerCase() + "_call.json", JSON.stringify(tlx))
    } else {
        // call directly
        const tx = await signer.sendTransaction(mtx)
        console.log(tx)
        const txre = await tx.wait()
        console.log(txre)
    }

}

async function run() {
    await createTxs(network, timeLockContract ? timeLockContract.address : signer.address)
}

run()
