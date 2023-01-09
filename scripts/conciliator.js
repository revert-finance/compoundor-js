require('dotenv').config()
const ethers = require("ethers");
const axios = require('axios');

const BigNumber = ethers.BigNumber

const IERC20_ABI = require("../contracts/IERC20.json")
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
const contractAddress = "0x5411894842e610c4d0f6ed4c232da689400f94a1"

async function getBalancesPaged(network) {
    const graphApiUrl = "https://api.thegraph.com/subgraphs/name/revert-finance/compoundor-" + network
    const balances = []
    const take = 1000
    let result
    let currentFrom = ""
    do {
        result = await axios.post(graphApiUrl, {
            query: `{accountBalances(first: ${take}, where: { balance_gt: 0, id_gt: "${currentFrom}" }, orderBy: id) { id token balance }}`
        })

        if (result.data.data.accountBalances.length == take) {
            currentFrom = result.data.data.accountBalances[result.data.data.accountBalances.length - 1].id // paging by id
        }

        for (const balance of result.data.data.accountBalances) {
           balances.push(balance)
        }

    } while (result.data.data.accountBalances.length == take)

    return balances
}

async function run() {
    const balances = await getBalancesPaged(process.env.NETWORK)
    const sums = {}
    for (const balance of balances) {
        if (!sums[balance.token]) {
            sums[balance.token] = BigNumber.from(0)
        }
        sums[balance.token] = sums[balance.token].add(BigNumber.from(balance.balance))
    }
    for (const t in sums) {
        const token = new ethers.Contract(t, IERC20_ABI, provider)
        const symbol = await token.symbol()
        const balance = await token.balanceOf(contractAddress)
        if (balance.lt(sums[t])) {
            console.log("MISSING ", symbol, balance.toString(), sums[t].toString())
        }
    }
}

run()
