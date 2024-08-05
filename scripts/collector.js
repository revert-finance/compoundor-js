// script to get multisig command for collecting protocol fees via timelock / executing multicall directly on contract (where no multisig is set)

// once scheduled and when time is passed - anyone can execute it by calling this calldata on the timelock
// cast calldata "execute(address,uint256,bytes,bytes32,bytes32)" 0x5411894842e610C4D0F6Ed4C232DA689400f94A1 0 <same calldata which was scheduled> 0000000000000000000000000000000000000000000000000000000000000000 0000000000000000000000000000000000000000000000000000000000000000


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

// add tokens here if others need to be processed
const tokens = {
    "mainnet": [
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "0x626e8036deb333b408be468f951bdb42433cbf18",
        "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
        "0x77e06c9eccf2e797fd462a92b6d7642ef85b0a44",
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "0x38e382f74dfb84608f3c1f10187f6bef5951de93",
        "0xb23d80f5fefcddaa212212f028021b41ded428cf",
        "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24",
        "0x046eee2cc3188071c02bfc1745a6b17c656e3f3d",
        "0x059956483753947536204e89bfaD909E1a434Cc6",
        "0x6982508145454ce325ddbe47a25d4ec3d2311933",
        "0xacd2c239012d17beb128b0944d49015104113650",
        "0xc28eb2250d1ae32c7e74cfb6d6b86afc9beb6509",
        "0x7613C48E0cd50E42dD9Bf0f6c235063145f6f8DC",
        "0xd9fcd98c322942075a5c3860693e9f4f03aae07b",
        "0xD533a949740bb3306d119CC777fa900bA034cd52",
        "0x582d872a1b094fc48f5de31d3b73f2d9be47def1",
        "0x112b08621E27e10773ec95d250604a041f36C582",
        "0xd31a59c85ae9d8edefec411d448f90841571b89c",
        "0x236501327e701692a281934230af0b6be8df3353",
        "0xa35923162c49cf95e6bf26623385eb431ad920d3",
        "0xd29da236dd4aac627346e1bba06a619e8c22d7c5",
        "0x02f92800F57BCD74066F5709F1Daa1A4302Df875",
        "0x423f4e6138e475d85cf7ea071ac92097ed631eea",
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
        "0x6b175474e89094c44da98b954eedeac495271d0f",
        "0xF19308F923582A6f7c465e5CE7a9Dc1BEC6665B1"
    ],
    "base": [
        "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4",
        "0x4ed4e862860bed51a9570b96d89af5e1b0efefed",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        "0x4200000000000000000000000000000000000006",
        "0xAfb89a09D82FBDE58f18Ac6437B3fC81724e4dF6",
        "0x0d97F261b1e88845184f678e2d1e7a98D9FD38dE",
        "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
        "0x38d513Ec43ddA20f323f26c7bef74c5cF80b6477",
        "0x96419929d7949d6a801a6909c145c8eef6a40431",
        "0x940181a94a35a4569e4529a3cdfb74e38fd98631",
        "0x0578d8a44db98b23bf096a382e016e29a5ce0ffe",
        "0x24569d33653c404f90aF10A2b98d6E0030D3d267",
        "0x51B75da3Da2e413eA1B8eD3Eb078dc712304761C",
        "0xf6e932ca12afa26665dc4dde7e27be02a7c02e50",
        "0x21eceaf3bf88ef0797e3927d855ca5bb569a47fc",
        "0x6985884C4392D348587B19cb9eAAf157F13271cd",
        "0x4621b7a9c75199271f773ebd9a499dbd165c3191",
        "0x532f27101965dd16442e59d40670faf5ebb142e4"
    ],
    "optimism": [
        "0x4200000000000000000000000000000000000006",
        "0x8700daec35af8ff88c16bdf0418774cb3d7599b4",
        "0x4200000000000000000000000000000000000042",
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
        "0xdc6ff44d5d932cbd77b52e5612ba0529dc6226f1",
        "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
        "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
        "0x9560e827af36c94d2ac33a39bce1fe78631088db",
        "0x296f55f8fb28e498b858d0bcda06d955b2cb3f97",
        "0x68f180fcce6836688e9084f035309e29bf0a2095",
        "0x3c8b650257cfb5f272f799f5e2b4e65093a11a05",
        "0xb0b195aefa3650a6908f15cdac7d92f8a5791b0b",
        "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
        "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6",
        "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb"
    ],
    "polygon": [
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
        "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
        "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        "0x61299774020da444af134c82fa83e3810b309991",
        "0xE261D618a959aFfFd53168Cd07D12E37B26761db",
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        "0x311434160d7537be358930def317afb606c0d737",
        "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
        "0x714db550b574b3e927af3d93e26127d15721d4c2",
        "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39",
        "0xfb7f8a2c0526d01bfb00192781b7a7761841b16c",
        "0xa3fa99a148fa48d14ed51d610c367c61876997f1",
        "0x172370d5cd63279efa6d502dab29171933a610af",
        "0xc3c7d422809852031b44ab29eec9f1eff2a58756",
        "0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3"

    ],
    "arbitrum": [
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        "0x18c11FD286C5EC11c3b683Caa813B77f5163A122",
        "0x912ce59144191c1204e64559fe8253a0e49e6548",
        "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
        "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        "0x6694340fc020c5e6b96567843da2df01b2ce1eb6",
        "0x4cb9a7ae498cedcbb5eae9f25736ae7d428c9d66",
        "0x3082cc23568ea640225c2467653db90e9250aaa0",
        "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
        "0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8",
        "0x539bde0d7dbd336b79148aa742883198bbf60342",
        "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0",
        "0xaaa6c1e32c55a7bfa8066a6fae9b42650f262418",
        "0x13ad51ed4f1b7e9dc168d8a00cb3f4ddd85efa60",
        "0x6985884c4392d348587b19cb9eaaf157f13271cd"
    ],
    "bnb": [
        "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        "0x55d398326f99059ff775485246999027b3197955",
        "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
        "0x031b41e504677879370e9dbcf937283a8691fa7f",
        "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        "0x1fa4a73a3f0133f0025378af00236f3abdee5d63",
        "0xad29abb318791d579433d831ed122afeaf29dcfe",
        "0x570a5d26f7765ecb712c0924e4de545b89fd43df"
    ]
}

function getMultisigAddress(network) {
    return {
        "mainnet": "0xaac25e85e752425Dd1A92674CEeAF603758D3124",
        "polygon": "0x11E48Ebf00B14f647a6bFF92333EBa3C5cd998D8",
        "optimism": "0xf1c9750C166329636B0A832dbd598d960fCE6893",
        "arbitrum": "0x3e456ED2793988dc08f1482371b50bA2bC518175",
        "bnb": "0x8CE47C746EEDDd547d679e0F1a0B4bAdEA2950c3",
        "base": "0x45B220860A39f717Dc7daFF4fc08B69CB89d1cc9"
    }[network];
}

async function createTxs(network, owner) {
    const balances = await getBalances(network, owner)
    const calls = []
    for (const bal of balances) {
        if (tokens[network].filter(x => x.toLowerCase() === bal.token.toLowerCase()).length > 0) {
            const token = new ethers.Contract(bal.token, IERC20_ABI, provider)
            const tx = await contract.populateTransaction.withdrawBalance(bal.token, revertFinance, bal.balance)
            const symbol = await token.symbol()
            console.log(symbol)
            const decimals = await token.decimals()
            console.log(ethers.utils.formatUnits(bal.balance, decimals))
            calls.push(tx.data)
        }
    }

    const mtx = await contract.populateTransaction.multicall(calls)

    if (timeLockContract) {
        // create call for multisig to send to timelock contract
        const tlx = await timeLockContract.populateTransaction.schedule(contractAddress, 0, mtx.data, ethers.constants.HashZero, ethers.constants.HashZero, 86400)
        fs.writeFileSync(process.env.NETWORK.toLowerCase() + "_call.json", JSON.stringify( { ...tlx, compoundorData: mtx.data }))
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
