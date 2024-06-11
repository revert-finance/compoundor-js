const ethers = require("ethers");
const BigNumber = ethers.BigNumber;

const nativeTokenAddresses = {
    "mainnet": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "polygon": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
    "optimism": "0x4200000000000000000000000000000000000006",
    "arbitrum": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    "bnb": "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    "evmos": "0xd4949664cd82660aae99bedc034a0dea8a0bd517",
    "base": "0x4200000000000000000000000000000000000006",
}
const wethAddresses = {
    "mainnet": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "polygon": "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    "optimism": "0x4200000000000000000000000000000000000006",
    "arbitrum": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    "bnb": "0x2170ed0880ac9a755fd29b2688956bd959f933f8"
}
const usdcAddresses = {
    "mainnet": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "polygon": "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    "optimism": "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
    "arbitrum": "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    "bnb": "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
}
const usdtAddresses = {
    "mainnet": "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "polygon": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    "optimism": "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    "arbitrum": "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    "bnb": "0x55d398326f99059ff775485246999027b3197955"
}
const daiAddresses = {
    "mainnet": "0x6b175474e89094c44da98b954eedeac495271d0f",
    "polygon": "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
    "optimism": "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    "arbitrum": "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    "bnb": "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3"
}
const txWaitMs = {
    "mainnet": 20000,
    "polygon": 5000,
    "optimism": 3000,
    "arbitrum": 3000,
    "bnb" : 5000,
    "evmos" : 5000,
    "base": 3000
}
const lowAlertBalances = {
    "mainnet": BigNumber.from("100000000000000000"),  // 0.1 ETH
    "polygon": BigNumber.from("10000000000000000000"), // 10 MATIC
    "optimism": BigNumber.from("10000000000000000"), // 0.01 ETH
    "arbitrum": BigNumber.from("10000000000000000"),  // 0.01 ETH
    "bnb": BigNumber.from("50000000000000000"),  // 0.05 BNB
    "evmos": BigNumber.from("10000000000000000000"),  // 10 EVMOS
    "base": BigNumber.from("10000000000000000"), // 0.01 ETH
}

const config = {
    "global": {
        "mainnet": {
            "nativeToken": nativeTokenAddresses["mainnet"],
            "nativeTokenSymbol": "ETH",
            "weth": wethAddresses["mainnet"],
            "usdc": usdcAddresses["mainnet"],
            "usdt": usdtAddresses["mainnet"],
            "dai": daiAddresses["mainnet"],
            "txWaitMs": txWaitMs["mainnet"],
            "lowAlertBalance": lowAlertBalances["mainnet"]
        },
        "polygon": {
            "nativeToken": nativeTokenAddresses["polygon"],
            "nativeTokenSymbol": "MATIC",
            "weth": wethAddresses["polygon"],
            "usdc": usdcAddresses["polygon"],
            "usdt": usdtAddresses["polygon"],
            "dai": daiAddresses["polygon"],
            "txWaitMs": txWaitMs["polygon"],
            "lowAlertBalance": lowAlertBalances["polygon"]
        },
        "optimism": {
            "nativeToken": nativeTokenAddresses["optimism"],
            "nativeTokenSymbol": "ETH",
            "weth": wethAddresses["optimism"],
            "usdc": usdcAddresses["optimism"],
            "usdt": usdtAddresses["optimism"],
            "dai": daiAddresses["optimism"],
            "txWaitMs": txWaitMs["optimism"],
            "lowAlertBalance": lowAlertBalances["optimism"]
        },
        "arbitrum": {
            "nativeToken": nativeTokenAddresses["arbitrum"],
            "nativeTokenSymbol": "ETH",
            "weth": wethAddresses["arbitrum"],
            "usdc": usdcAddresses["arbitrum"],
            "usdt": usdtAddresses["arbitrum"],
            "dai": daiAddresses["arbitrum"],
            "txWaitMs": txWaitMs["arbitrum"],
            "lowAlertBalance": lowAlertBalances["arbitrum"]
        },
        "bnb": {
            "nativeToken": nativeTokenAddresses["bnb"],
            "nativeTokenSymbol": "BNB",
            "weth": wethAddresses["bnb"],
            "usdc": usdcAddresses["bnb"],
            "usdt": usdtAddresses["bnb"],
            "dai": daiAddresses["bnb"],
            "txWaitMs": txWaitMs["bnb"],
            "lowAlertBalance": lowAlertBalances["bnb"]
        },
        "base": {
            "nativeToken": nativeTokenAddresses["base"],
            "nativeTokenSymbol": "ETH",
            "weth": wethAddresses["base"],
            "usdc": usdcAddresses["base"],
            "usdt": usdtAddresses["base"],
            "dai": daiAddresses["base"],
            "txWaitMs": txWaitMs["base"],
            "lowAlertBalance": lowAlertBalances["base"]
        },
        "evmos": {
            "nativeToken": nativeTokenAddresses["evmos"],
            "nativeTokenSymbol": "EVMOS",
            "weth": null,
            "usdc": null,
            "usdt": null,
            "dai": null,
            "txWaitMs": txWaitMs["evmos"],
            "lowAlertBalance": lowAlertBalances["evmos"]
        }
    },
    "uniswap-v3": {
        "mainnet": {
            "factoryAddress": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            "npmAddress": "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
            "contractAddress": "0x5411894842e610c4d0f6ed4c232da689400f94a1",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/8e4dRt4P4WHXnKbEq7STaQfU2g99WZ5S4w39f2PcUTjD`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/9a4tXnJu1v5KFnJUinVBvGoE7bAE9pPW8hUC5myE5v3t`
        },
        "polygon": {
            "factoryAddress": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            "npmAddress": "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
            "contractAddress": "0x5411894842e610c4d0f6ed4c232da689400f94a1",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/HMcqgvDY6f4MpnRSJqUUsBPHePj8Hq3AxiDBfDUrWs15`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/BsZnuQqE5CEmbfkD1HdcDoB9k7sR7jEZ63qM3CF3TDew`
        },
        "optimism": {
            "factoryAddress": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            "npmAddress": "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
            "contractAddress": "0x5411894842e610c4d0f6ed4c232da689400f94a1",
            "multiCompoundorAddress": "0xbDd1D443118554fEb151406622a3B586992b49D3",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/AUpZ47RTWDBpco7YTTffGyRkBJ2i26Ms8dQSkUdxPHGc`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/GPm81PyNJkSx8oiQFm1UppW4tBHHXtNhNQQfhUmC4f54`
        },
        "arbitrum": {
            "factoryAddress": "0x1F98431c8aD98523631AE4a59f267346ea31F984",
            "npmAddress": "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
            "contractAddress": "0x5411894842e610c4d0f6ed4c232da689400f94a1",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/3V7ZY6muhxaQL5qvntX1CFXJ32W7BxXZTGTwmpH5J4t3`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/AAHFozW6KF553DsmqZkY7SRNLngP3vgrTMig2oxmfmfh`
        },
        "bnb": {
            "factoryAddress": "0xdb1d10011ad0ff90774d0c6bb92e5c5c8b4461f7",
            "npmAddress": "0x7b8a01b39d58278b5de7e48c8449c9f4f5170613",
            "contractAddress": "0x98eC492942090364AC0736Ef1A741AE6C92ec790",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/G5MUbSBM7Nsrm9tH2tGQUiAF4SZDGf2qeo1xPLYjKr7K`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/3LAyKe1ULM4nA3cUFRgWzY3U8wSMXSMyAHZLxzxrTZ2c`
        },
        "base": {
            "factoryAddress": "0x33128a8fc17869897dce68ed026d694621f6fdfd",
            "npmAddress": "0x03a520b32c04bf3beef7beb72e919cf822ed34f1",
            "contractAddress": "0x4a8c2bdf0d8d2473b985f869815d9caa36a57ee4",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/BbDEjMEp1gnWZpojp5B52HMG9ktaz4NbZzDq5sQ47VYQ`
        },
        "evmos": {
            "factoryAddress": "0xf544365e7065966f190155f629ce0182fc68eaa2",
            "npmAddress": "0x5fe5daaa011673289847da4f76d63246ddb2965d",
            "contractAddress": "0x013573fa9faf879db49855addf10653f46903419",
            "subgraph": `https://subgraph.satsuma-prod.com/${process.env.SATSUMA_KEY}/revertfinance/uniswap-v3-evmos/api`,
            "compoundor-subgraph": `https://subgraph.satsuma-prod.com/${process.env.SATSUMA_KEY}/revertfinance/compoundor-evmos/api`
        }
    },
    "pancakeswap-v3": {
        "bnb": {
            "factoryAddress": "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
            "npmAddress": "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
            "contractAddress": "0x317202b11add82232d06bc13892cd22e38d505d3",
            "subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/A1fvJWQLBeUAggX2WQTMm3FKjXTekNXo77ZySun4YN2m`,
            "compoundor-subgraph": `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_API_KEY}/subgraphs/id/9WeMybf9o5fGpbKWFzrZz9dQi3YZ5VWrF5v3UyrWN4VP`
        }
    }
}

exports.getConfig = function(exchange, network, key) {
    return config["global"][network][key] || config[exchange][network][key]
}