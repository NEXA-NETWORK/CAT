const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const elliptic = require("elliptic");
const { ZERO_BYTES32, ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

const testSigner1PK = "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";

const name = "CATERC20Test";
const symbol = "CATTEST";
const decimals = 18;
const maxSupply = "1000000000000000000000";

const wormholeChainId = "2";
const wormholeCoreContract = "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";
const finality = 1;
const nowTime = parseInt(Math.floor(new Date().getTime() / 1000));
const validTime = nowTime + 300;

describe("CATERC20", () => {
  async function deployFixture() {
    const [owner, otherAccount] = await ethers.getSigners();

    const TestTokenFactory = await ethers.getContractFactory("TestToken");
    const CATERC20Factory = await ethers.getContractFactory("CATERC20");
    const TestTokenInstance = await TestTokenFactory.deploy();
    await TestTokenInstance.deployed();
    const CATERC20Instance = await CATERC20Factory.deploy(name, symbol, decimals);
    await CATERC20Instance.deployed();

    const initialize = await CATERC20Instance.connect(owner).initialize(
      wormholeChainId,
      wormholeCoreContract,
      finality,
      maxSupply
    );
    await initialize.wait();

    return {
      owner,
      otherAccount,
      TestTokenInstance,
      CATERC20Instance,
    };
  }

  // This function is only for reference to get private keys of test accounts
  // when running the wormhole local validators. The private keys are added in the 
  // hardhat.config.js file for the evm network
  async function getPrivateKeysOfTestAccounts() {
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    const mnemonic = "myth like bonus scare over problem client lizard pioneer submit female collect";
    const path = "m/44'/60'/0'/0/";


    // Loop through the first 10 accounts generated by Ganache
    for (let i = 0; i < 10; i++) {
      const signer = provider.getSigner(i);
      const address = await signer.getAddress();
      const balance = ethers.utils.formatEther(await signer.getBalance());

      console.log(`Account ${i} Address: ${address} Balance: ${balance} ETH`);
    }
    console.log("Private Keys: \n[");
    for (let i = 0; i < 10; i++) {
      const wallet = ethers.Wallet.fromMnemonic(mnemonic, path + i);
      console.log(`"${wallet.privateKey}",`);
    }
    console.log("]");
  }

  async function makeSignature(custodian, validTill, signer) {
    let messageHash = ethers.utils.solidityKeccak256(
      ["address", "uint256"],
      [custodian, validTill]
    );

    let messageHashBinary = ethers.utils.arrayify(messageHash);
    let signature = await signer.signMessage(messageHashBinary);

    return { custodian, validTill, signature };
  }

  describe("Governance Functions", () => {
  it("registerChain", async () => {
    const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();
    const { custodian, validTill, signature } = await makeSignature(
      otherAccount.address,
      validTime,
      owner
    );
    const SignatureVerification = [custodian, validTill, signature];

    const TestTokenBytes32 = await CATERC20Instance.connect(otherAccount).addressToBytes(
      TestTokenInstance.address
    );
    await CATERC20Instance.connect(otherAccount).registerChain(
      2,
      TestTokenBytes32,
      SignatureVerification
    ).then(tx => tx.wait());


    expect(await CATERC20Instance.tokenContracts(2)).to.equal(TestTokenBytes32);
  });

  it("register multiple chains", async () => {
    const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();
    const { custodian, validTill, signature } = await makeSignature(
      otherAccount.address,
      validTime,
      owner
    );
    const SignatureVerification = [custodian, validTill, signature];
    const chaindIds = [1, 2, 3];
    const tokenAddresses = [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
      "0x0000000000000000000000000000000000000003",
    ];
    const tokenAddressesBytes32 = [];

    for (let i = 0; i < chaindIds.length; i++) {
      tokenAddressesBytes32.push(
        await CATERC20Instance.connect(otherAccount).addressToBytes(tokenAddresses[i])
      );
    }

    await CATERC20Instance.connect(otherAccount).registerChains(
      chaindIds,
      tokenAddressesBytes32,
      SignatureVerification
    ).then(tx => tx.wait());

    expect(await CATERC20Instance.tokenContracts(chaindIds[0])).to.equal(
      tokenAddressesBytes32[0]
    );
    expect(await CATERC20Instance.tokenContracts(chaindIds[1])).to.equal(
      tokenAddressesBytes32[1]
    );
    expect(await CATERC20Instance.tokenContracts(chaindIds[2])).to.equal(
      tokenAddressesBytes32[2]
    );
  });

    it("update finality", async () => {
      const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();
      const { custodian, validTill, signature } = await makeSignature(
        otherAccount.address,
        validTime,
        owner
      );
      const SignatureVerification = [custodian, validTill, signature];
      const newFinality = 15;

      await CATERC20Instance.connect(otherAccount).updateFinality(
        newFinality,
        SignatureVerification
      ).then(tx => tx.wait());

      expect(await CATERC20Instance.finality()).to.equal(newFinality);

      // Cannot replay same signatures
      await expect(
        CATERC20Instance.connect(otherAccount).updateFinality(
          newFinality,
          SignatureVerification
        )
      ).to.be.reverted;

    });
  });

  describe("Encoding and Decoding Transfers", () => {
    it("encode and decode data to transfer", async () => {
      const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();

      const data = {
        amount: 100,
        tokenAddress: await CATERC20Instance.addressToBytes(TestTokenInstance.address),
        tokenChain: 1,
        toAddress: await CATERC20Instance.addressToBytes(otherAccount.address),
        toChain: 2,
        tokenDecimals: await CATERC20Instance.decimals()
      };

      const encoded = await CATERC20Instance.encodeTransfer(data);
      const decoded = await CATERC20Instance.decodeTransfer(encoded);

      expect(decoded.amount).to.equal(data.amount);
      expect(decoded.tokenAddress).to.equal(data.tokenAddress);
      expect(decoded.tokenChain).to.equal(data.tokenChain);
      expect(decoded.toAddress).to.equal(data.toAddress);
      expect(decoded.toChain).to.equal(data.toChain);
      expect(decoded.tokenDecimals).to.equal(data.tokenDecimals);
    });
  });

  describe("Minting New Tokens", () => {
    it("Should Mint new tokens only by owner", async () => {
      const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();
      const amountToMint = "1000000000";

      await CATERC20Instance.connect(owner).mint(owner.address, amountToMint).then(tx => tx.wait());
      expect(await CATERC20Instance.connect(owner).balanceOf(owner.address)).to.equal(amountToMint);

      await expect(CATERC20Instance.connect(otherAccount).mint(otherAccount.address, amountToMint))
        .to.be.reverted;
    });
  });

  describe("Cross Chain Transfers", () => {
    it("bridgeOut", async () => {
      const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();

      const { custodian, validTill, signature } = await makeSignature(
        otherAccount.address,
        validTime,
        owner
      );
      const SignatureVerification = [custodian, validTill, signature];

      const TestTokenBytes32 = await CATERC20Instance.connect(otherAccount).addressToBytes(
        TestTokenInstance.address
      );
      await CATERC20Instance.connect(otherAccount).registerChain(
        wormholeChainId,
        TestTokenBytes32,
        SignatureVerification
      ).then(tx => tx.wait());

      const amountToMint = "100000000000000000000";

      await CATERC20Instance.mint(owner.address, amountToMint).then(tx => tx.wait());
      await CATERC20Instance.bridgeOut(
        amountToMint,
        wormholeChainId,
        await CATERC20Instance.addressToBytes(owner.address),
        0
      ).then(tx => tx.wait());

      expect(await CATERC20Instance.mintedSupply()).to.be.equal(amountToMint);
      expect(await CATERC20Instance.totalSupply()).to.be.equal(0);
      await CATERC20Instance.mint(owner.address, amountToMint).then(tx => tx.wait());
      expect(await CATERC20Instance.totalSupply()).to.be.equal(amountToMint);
      expect(await CATERC20Instance.mintedSupply()).to.be.equal("200000000000000000000");

    });

    it("bridgeIn", async () => {
      const { owner, otherAccount, TestTokenInstance, CATERC20Instance } = await deployFixture();

      // const amountToMint = "100000000000";
      // const foreignDecimals = 9;

      // const data = {
      //   amount: amountToMint,
      //   tokenAddress: await CATERC20Instance.addressToBytes(CATERC20Instance.address),
      //   tokenChain: 2,
      //   toAddress: await CATERC20Instance.addressToBytes(owner.address),
      //   toChain: 2,
      //   tokenDecimals: foreignDecimals
      // };

      // const payload = await CATERC20Instance.encodeTransfer(data);
      // const vaa = await signAndEncodeVM(
      //   1,
      //   1,
      //   wormholeChainId,
      //   await CATERC20Instance.addressToBytes(CATERC20Instance.address),
      //   0,
      //   payload,
      //   [testSigner1PK],
      //   0,
      //   finality
      // );
      
      // VAA generated from Solana 
      const vaa = Buffer.from("AQAAAAABAAgM5FR1owkWIPXomuugyIyge67qPS0ijBLzIHNzeJu8dNX7VNhhld13JDX5ozBPGkHSy/PU7bYLRlRnxmC9fh0AZK6SYQAAAAAAAQSpf6TaFnXPGoN1DtzBdulW/jf8D/2NuH7v9sx469UbAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////OnfHk6JgIlJBinJY+zVYTx/yLXRjFoIwoho8hzYDk6gEAAAAAAAAAAAAAAAAAkPi/akefMg6tB0QRpLDnlE6oycECAAk=", "base64");
      console.log("VAA: ", vaa);
      // Balance will be a BigNumber
      let balance = await CATERC20Instance.balanceOf(owner.address);
      console.log("Balance Before", balance.toString())
      const receipts = await CATERC20Instance.bridgeIn(vaa).then(tx => tx.wait());
      balance = await CATERC20Instance.balanceOf(owner.address);
      console.log("Balance After", balance.toString())
      receipts.events.forEach(event => { 
        console.log(event.args)
      });
    });
  });
});

const signAndEncodeVM = async function (
  timestamp,
  nonce,
  emitterChainId,
  emitterAddress,
  sequence,
  data,
  signers,
  guardianSetIndex,
  consistencyLevel
) {
  const body = [
    web3.eth.abi.encodeParameter("uint32", timestamp).substring(2 + (64 - 8)),
    web3.eth.abi.encodeParameter("uint32", nonce).substring(2 + (64 - 8)),
    web3.eth.abi.encodeParameter("uint16", emitterChainId).substring(2 + (64 - 4)),
    web3.eth.abi.encodeParameter("bytes32", emitterAddress).substring(2),
    web3.eth.abi.encodeParameter("uint64", sequence).substring(2 + (64 - 16)),
    web3.eth.abi.encodeParameter("uint8", consistencyLevel).substring(2 + (64 - 2)),
    data.substr(2),
  ];

  const hash = web3.utils.soliditySha3(web3.utils.soliditySha3("0x" + body.join("")));

  let signatures = "";

  for (let i in signers) {
    const ec = new elliptic.ec("secp256k1");
    const key = ec.keyFromPrivate(signers[i]);
    const signature = key.sign(hash.substr(2), { canonical: true });

    const packSig = [
      web3.eth.abi.encodeParameter("uint8", i).substring(2 + (64 - 2)),
      zeroPadBytes(signature.r.toString(16), 32),
      zeroPadBytes(signature.s.toString(16), 32),
      web3.eth.abi.encodeParameter("uint8", signature.recoveryParam).substr(2 + (64 - 2)),
    ];

    signatures += packSig.join("");
  }

  const vm = [
    web3.eth.abi.encodeParameter("uint8", 1).substring(2 + (64 - 2)),
    web3.eth.abi.encodeParameter("uint32", guardianSetIndex).substring(2 + (64 - 8)),
    web3.eth.abi.encodeParameter("uint8", signers.length).substring(2 + (64 - 2)),

    signatures,
    body.join(""),
  ].join("");

  return vm;
};

function zeroPadBytes(value, length) {
  while (value.length < 2 * length) {
    value = "0" + value;
  }
  return value;
}
