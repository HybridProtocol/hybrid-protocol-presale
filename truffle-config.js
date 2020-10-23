require("@babel/preset-env");
require("@babel/polyfill");

const HDWalletProvider = require("truffle-hdwallet-provider");
require('dotenv').config()

module.exports = {
    networks: {
        development: {
            host: 'localhost', // Localhost (default: none)
            port: 8545, // Standard Ethereum port (default: none)
            network_id: '*', // Any network (default: none)
            gas: 10000000,
        },
        coverage: {
            host: 'localhost',
            network_id: '*',
            port: 8555,
            gas: 0xfffffffffff,
            gasPrice: 0x01,
        },
        rinkeby: {
            provider: () => new HDWalletProvider(process.env.MNEMONIC_OR_PRIVATE_KEY, "https://rinkeby.infura.io/v3/" + process.env.INFURA_API_KEY),
            network_id: 4,
            gas: 7989018,
            gasPrice: 200000000000
        },
        ropsten: {
            provider: () => new HDWalletProvider(process.env.MNEMONIC_OR_PRIVATE_KEY, "https://ropsten.infura.io/v3/" + process.env.INFURA_API_KEY),
            network_id: 3,
            gas: 7989018,
            gasPrice: 180000000000
        },
    },
    // Configure your compilers
    compilers: {
        solc: {
            version: '0.6.12',
            settings: { // See the solidity docs for advice about optimization and evmVersion
                optimizer: {
                    enabled: true,
                    runs: 200,
                },
                evmVersion: 'istanbul',
            },
        },
    },
};
