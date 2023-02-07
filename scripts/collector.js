require('dotenv').config()
const ethers = require("ethers");
const axios = require('axios');

const IERC20_ABI = require("../contracts/IERC20.json")
const CONTRACT_RAW = require("../contracts/Compoundor.json")

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
const signer = new ethers.Wallet(process.env.COMPOUNDER_PRIVATE_KEY, provider)

const contractAddress = "0x5411894842e610c4d0f6ed4c232da689400f94a1"
const contract = new ethers.Contract(contractAddress, CONTRACT_RAW.abi, provider)
const revertFinance = "0x8cadb20a4811f363dadb863a190708bed26245f8"

async function getBalances(network, owner) {
    const graphApiUrl = "https://api.thegraph.com/subgraphs/name/revert-finance/compoundor-" + network
    let result = await axios.post(graphApiUrl, {
        query: `{accountBalances(first: 1000, where: { balance_gt: 0, account: "${owner}"}) { token balance }}`
    })
    return result.data.data.accountBalances
}

async function createTxs(network, owner, execute) {
    const balances = await getBalances(network, owner)
    const calls = []
    for (const bal of balances) {
        const token = new ethers.Contract(bal.token, IERC20_ABI, provider)
        const tx = await contract.populateTransaction.withdrawBalance(bal.token, owner, bal.balance)
        console.log(await token.symbol())
        const decimals = await token.decimals()
        console.log(ethers.utils.formatUnits(bal.balance, decimals))
        console.log(tx.data)
        calls.push(tx.data)
    }

    if (execute && calls.length > 0) {
        const tx = await contract.connect(signer).multicall(calls)
        console.log(tx)
    }
}

async function run() {
    await createTxs(process.env.NETWORK, await signer.getAddress(), true)
}

run()
