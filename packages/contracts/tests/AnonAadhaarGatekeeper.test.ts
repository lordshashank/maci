import { expect } from "chai";
import { AbiCoder, Signer, ZeroAddress } from "ethers";
import { Keypair } from "maci-domainobjs";

import { deployAnonAadhaarGatekeeper, deployContract } from "../ts/deploy";
import { getDefaultSigner, getSigners } from "../ts/utils";
import { MACI, AnonAadhaarGatekeeper, MockAnonAadhaar } from "../typechain-types";

import { STATE_TREE_DEPTH, initialVoiceCreditBalance } from "./constants";
import { deployTestContracts } from "./utils";

describe("AnonAadhaar Gatekeeper", () => {
  let AnonAadhaarGatekeeper: AnonAadhaarGatekeeper;
  let MockAnonAadhaar: MockAnonAadhaar;
  let signer: Signer;
  let signerAddress: string;
    let encodedProof: string;
    let encodedInvalidProof: string;

  const user = new Keypair();

  // set proof valid time to 3 hours
  const proofValidTime = 3 * 60 * 60;

  // Mock AnonAadhaar proof
  const mockProof = {
    pubkeyHash: '15134874015316324267425466444584014077184337590635665158241104437045239495873',
    timestamp: '1552023000',
    nullifierSeed: '1234',
    nullifier: '7946664694698614794431553425553810756961743235367295886353548733878558886762',
    signalHash: '12312509608262857804813905484150168813381936747748461339921846097696790351333',
    ageAbove18: '1',
    gender: '77',
    pincode: '110051',
    state: '452723500356',
    packedGroth16Proof: [
        '19757867243179944720834238738267624238937017363216590301996862204085073370077',
        '15866838547140654143775053590687494030688142277068337892419099059884427040092',
        '4555802325195336069548885582178217427528052061058983973646322494857979199168',
        '19583253225152225914775011708878229952422314218119654851624956484481205634415',
        '7034005479631667817825088286925826949690021547150935736475398882271635455542',
        '5321989649489023941093025172007362233502200479745929403492587546147091855329',
        '14421151446026612504821502854443907687617733388308778099763453644233525416238',
        '19349029229717752583923748865662807483610037218776928544391405148863596589642'
    ],
  };

  const invalidMockProof = {
    ...mockProof,
    nullifier: 9876n,
  };





  before(async () => {
    signer = await getDefaultSigner();
    MockAnonAadhaar = await deployContract("MockAnonAadhaar", signer, true);
    const MockAnonAadhaarAddress = await MockAnonAadhaar.getAddress();
    signerAddress = await signer.getAddress();
     encodedProof = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256", "address", "uint256[4]", "uint256[8]"],
        [
          mockProof.nullifierSeed,
          mockProof.nullifier,
          mockProof.timestamp,
          signerAddress,
          [
            mockProof.ageAbove18,
            mockProof.gender,
            mockProof.pincode,
            mockProof.state,
        ],
        mockProof.packedGroth16Proof,
        ]
      );
       encodedInvalidProof = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256", "address", "uint256[4]", "uint256[8]"],
        [
          invalidMockProof.nullifierSeed,
          invalidMockProof.nullifier,
          invalidMockProof.timestamp,
          signerAddress,
            [
                invalidMockProof.ageAbove18,
                invalidMockProof.gender,
                invalidMockProof.pincode,
                invalidMockProof.state,
            ],
            invalidMockProof.packedGroth16Proof,
        ]
      );
    AnonAadhaarGatekeeper = await deployAnonAadhaarGatekeeper(MockAnonAadhaarAddress, proofValidTime, signer, true);
  });

  describe("Deployment", () => {
    it("The gatekeeper should be deployed correctly", () => {
      expect(AnonAadhaarGatekeeper).to.not.eq(undefined);
    });
  });

  describe("Gatekeeper", () => {
    let maciContract: MACI;

    before(async () => {
      const r = await deployTestContracts({
        initialVoiceCreditBalance,
        stateTreeDepth: STATE_TREE_DEPTH,
        signer,
        gatekeeper: AnonAadhaarGatekeeper,
      });

      maciContract = r.maciContract;
    });

    it("sets MACI instance correctly", async () => {
      const maciAddress = await maciContract.getAddress();
      await AnonAadhaarGatekeeper.setMaciInstance(maciAddress).then((tx) => tx.wait());

      expect(await AnonAadhaarGatekeeper.maci()).to.eq(maciAddress);
    });

    it("should fail to set MACI instance when the caller is not the owner", async () => {
      const [, secondSigner] = await getSigners();
      await expect(
        AnonAadhaarGatekeeper.connect(secondSigner).setMaciInstance(signerAddress),
      ).to.be.revertedWithCustomError(AnonAadhaarGatekeeper, "OwnableUnauthorizedAccount");
    });

    it("should fail to set MACI instance when the MACI instance is not valid", async () => {
      await expect(AnonAadhaarGatekeeper.setMaciInstance(ZeroAddress)).to.be.revertedWithCustomError(
        AnonAadhaarGatekeeper,
        "ZeroAddress",
      );
    });

    it("should not register a user if the register function is called with invalid proof", async () => {
      await AnonAadhaarGatekeeper.setMaciInstance(await maciContract.getAddress()).then((tx) => tx.wait());

      await expect(
        maciContract.signUp(
          user.pubKey.asContractParam(),
          encodedInvalidProof,
          AbiCoder.defaultAbiCoder().encode(["uint256"], [1]),
        ),
      ).to.be.revertedWithCustomError(AnonAadhaarGatekeeper, "InvalidProof");
    });

    it("should revert if the proof is invalid (mock)", async () => {
      await MockAnonAadhaar.flipValid();
      await expect(
        maciContract.signUp(
          user.pubKey.asContractParam(),
          encodedProof,
          AbiCoder.defaultAbiCoder().encode(["uint256"], [1]),
        ),
      ).to.be.revertedWithCustomError(AnonAadhaarGatekeeper, "InvalidProof");
      await MockAnonAadhaar.flipValid();
    });

    it("should register a user if the register function is called with the valid data", async () => {
      const tx = await maciContract.signUp(
        user.pubKey.asContractParam(),
        encodedProof,
        AbiCoder.defaultAbiCoder().encode(["uint256"], [1]),
      );

      const receipt = await tx.wait();

      expect(receipt?.status).to.eq(1);
    });

    it("should prevent signing up twice", async () => {
      await expect(
        maciContract.signUp(
          user.pubKey.asContractParam(),
          encodedProof,
          AbiCoder.defaultAbiCoder().encode(["uint256"], [1]),
        ),
      ).to.be.revertedWithCustomError(AnonAadhaarGatekeeper, "AlreadyRegistered");
    });
  });
});