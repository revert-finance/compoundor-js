require('dotenv').config()
const ethers = require("ethers")

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
const network = process.env.NETWORK
const exchange = process.env.EXCHANGE || "uniswap-v3"

function getAutoExitAddress() {
    return {
        "mainnet": "0xfcc46d2fde6b6eb9ab9f2c8e39802020c8ca4299",
        "polygon": "0x9210a14b2b62607246d453df6ff0860e98aea00e",
        "optimism": "0x6d55aa15e84bd5847b13bab3245c06b05917d3da",
        "arbitrum": "0xd82e0be376196690aae31372b25cc9025600ab06",
        "bnb": (exchange === "uniswap-v3" ? "0xae19eb52cca56c178d695b4d823d81b5f3829bb1" : "0x4bb7c9f44262af978f84a65bb5b13a8f946003ba"),
        "base": "0xde3dee3fbd8fd798e69f13de3745867b2b345d6a"
    }[network];
}
function getAutoRangeAddress() {
    return {
        "mainnet": "0x9b74e52ae52ef26ebd4b77aa1929dd06f187cca9",
        "polygon": "0x55d5889211e33296eb1d9087b8a8d7dd89edfbf4",
        "optimism": "0x6ee80279c057f17a3c7d5a9aa3e52ac304861e71",
        "arbitrum": "0xab6998459d767eeab2c58aa0a08b7bb5990e7f1b",
        "bnb": (exchange === "uniswap-v3" ? "0x1af7cf68f100a564325df83ae111cb61c29c54b1" : "0x52c200da4c57e3575788306ad8aafd15e8ac3e68"),
        "base": "0xca7134443f4bd65c4f7ab30983858c239d88b906"
    }[network];
}
function getAutoExitV2Address() {
    return {
        "mainnet": "0x37c25b604d7f9615c375cc392be853a272ee4e90",
        "polygon": "0x08ad36649da1271124533d36dccacb1e00e37533",
        "optimism": "0x3322ac2d080dafb4a312929d97d51d66764742b9",
        "arbitrum": "0xee1e94addc3aec46d16ab9735e262c92824165c0",
        "bnb": (exchange === "uniswap-v3" ? "0x3cac4a92c8bac93ea2986cb819a4aaf529974d93" : "0x68bb8dbcb554b95ce0fffef6846a0ac8a7fe3cb9"),
        "base": "0x5b3b61342c09c9455bd1913cf0be4c13c053d046"
    }[network];
}
function getAutoRangeV2Address() {
    return {
        "mainnet": "0x9576fc12363cbbd8aa010242f0939a4d55ce0b1a",
        "polygon": "0x54ebb4815326d922a93339f37dcbbf0d2fe2864e",
        "optimism": "0x9377ff26ea172bb61596d730ec4eeee78232ccab",
        "arbitrum": "0xa44b95e50932e2792625886d4ed3099b6932645a",
        "bnb": (exchange === "uniswap-v3" ? "0x9a515ff53f38185b1f2aed81685c22953092fb3b" : "0xd8dcdbd48ba059c288a9d654c468ebd94c27d7e4"),
        "base": "0x043e2ff28db24061d46629b999a358a24c784c69"
    }[network];
}
function getSelfCompoundorAddress() {
    return {
        "mainnet": "0xB50a397543fB2c7D08c53D5f5331AD8990D3B48f",
        "polygon": "0xad58D1DF63AFcf090Cc930475db3dD3cD8f739eA",
        "optimism": "0x3C0Fd0B42aa46F03f6cF5e305Ed9B2Ce402847eF",
        "arbitrum": "0xb43a613f0dd19af1cb1f5d03d8e8e5af04d9f0a1",
        "bnb": (exchange === "uniswap-v3" ? "0x69437b43805C9fFF78eC63394474a48C69DD8DA6" : "0x48331aEc6a59A44FE1648AAa38545CEDDbdd747c"),
        "base": "0xc5d8fa6439a5a8caa4ab24025751255296f1551a"
    }[network];
}

const tokens = {
    "mainnet": [
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "0x626e8036deb333b408be468f951bdb42433cbf18",
        "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "0x38e382f74dfb84608f3c1f10187f6bef5951de93",
        "0xb23d80f5fefcddaa212212f028021b41ded428cf",
        "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24",
        "0x046eee2cc3188071c02bfc1745a6b17c656e3f3d",
        "0x059956483753947536204e89bfaD909E1a434Cc6",
        "0x6982508145454ce325ddbe47a25d4ec3d2311933"
    ],
    "base": [
        "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4",
        "0x4ed4e862860bed51a9570b96d89af5e1b0efefed",
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        "0x4200000000000000000000000000000000000006",
        "0xAfb89a09D82FBDE58f18Ac6437B3fC81724e4dF6",
        "0x0d97F261b1e88845184f678e2d1e7a98D9FD38dE",
        "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca"
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
        "0x68f180fcce6836688e9084f035309e29bf0a2095"
    ],
    "polygon": [
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
        "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
        "0x61299774020da444af134c82fa83e3810b309991",
        "0xE261D618a959aFfFd53168Cd07D12E37B26761db",
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        "0x311434160d7537be358930def317afb606c0d737",
        "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6"  
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
        "0x539bde0d7dbd336b79148aa742883198bbf60342"
    ]
}

const receiver = "0x8cadb20a4811f363dadb863a190708bed26245f8"

async function claimAll() {
    await claim(tokens[network], getAutoExitV2Address(), receiver, exchange === "uniswap-v3" ? process.env.OPERATOR_PRIVATE_KEY : process.env.OPERATOR_PRIVATE_KEY_PANCAKE)
    await claim(tokens[network], getAutoRangeV2Address(), receiver, exchange === "uniswap-v3" ? process.env.OPERATOR_PRIVATE_KEY : process.env.OPERATOR_PRIVATE_KEY_PANCAKE)
    await claim(tokens[network], getAutoExitAddress(), receiver, exchange === "uniswap-v3" ? process.env.OPERATOR_PRIVATE_KEY : process.env.OPERATOR_PRIVATE_KEY_PANCAKE)
    await claim(tokens[network], getAutoRangeAddress(), receiver, exchange === "uniswap-v3" ? process.env.OPERATOR_PRIVATE_KEY : process.env.OPERATOR_PRIVATE_KEY_PANCAKE)
    await claim(tokens[network], getSelfCompoundorAddress(), receiver, process.env.COMPOUNDER_PRIVATE_KEY)
}   

async function claim(tokens, contractAddress, receiver, pk) {
    const signer = new ethers.Wallet(pk, provider)
    const contract = new ethers.Contract(contractAddress, ["function withdrawBalances(address[],address)"], signer)
    const gasPrice = (await provider.getGasPrice()).mul(network == "polygon" ? 1 : 1)
    const tx = await contract.withdrawBalances(tokens, receiver, { gasPrice })
    console.log(tx)
    const txre = await tx.wait()
    console.log(txre)
}

claimAll()