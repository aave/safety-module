import {Contract, Signer, utils} from 'ethers';

import {BRE, getDb} from './misc-utils';
import {eContractid, tEthereumAddress} from './types';
import {Artifact} from '@nomiclabs/buidler/types';

export const registerContractInJsonDb = async (contractId: string, contractInstance: Contract) => {
  const currentNetwork = BRE.network.name;
  if (currentNetwork !== 'buidlerevm' && currentNetwork !== 'soliditycoverage') {
    console.log(`*** ${contractId} ***\n`);
    console.log(`Network: ${currentNetwork}`);
    console.log(`tx: ${contractInstance.deployTransaction.hash}`);
    console.log(`contract address: ${contractInstance.address}`);
    console.log(`deployer address: ${contractInstance.deployTransaction.from}`);
    console.log(`gas price: ${contractInstance.deployTransaction.gasPrice}`);
    console.log(`gas used: ${contractInstance.deployTransaction.gasLimit}`);
    console.log(`\n******`);
    console.log();
  }

  await getDb()
    .set(`${contractId}.${currentNetwork}`, {
      address: contractInstance.address,
      deployer: contractInstance.deployTransaction.from,
    })
    .write();
};

export const insertContractAddressInDb = async (id: eContractid, address: tEthereumAddress) =>
  await getDb()
    .set(`${id}.${BRE.network.name}`, {
      address,
    })
    .write();

export const getEthersSigners = async (): Promise<Signer[]> =>
  await Promise.all(await BRE.ethers.getSigners());

export const getEthersSignersAddresses = async (): Promise<tEthereumAddress[]> =>
  await Promise.all((await BRE.ethers.getSigners()).map((signer) => signer.getAddress()));

export const getCurrentBlock = async () => {
  return BRE.ethers.provider.getBlockNumber();
};

export const getBlockTimestamp = async (blockNumber?: number): Promise<number> => {
  if (!blockNumber) {
    throw new Error('No block number passed');
  }
  const block = await BRE.ethers.provider.getBlock(blockNumber);
  return block.timestamp;
};

export const decodeAbiNumber = (data: string): number =>
  parseInt(utils.defaultAbiCoder.decode(['uint256'], data).toString());

export const deployContract = async <ContractType extends Contract>(
  contractName: string,
  args: any[],
  slug: string = ''
): Promise<ContractType> => {
  const contract = (await (await BRE.ethers.getContractFactory(contractName)).deploy(
    ...args
  )) as ContractType;

  await registerContractInJsonDb(<eContractid>`${contractName}${slug ? `-${slug}` : ''}`, contract);
  return contract;
};

type ContractGetter = {address?: string; slug?: string};
export const getContractFactory = <ContractType extends Contract>(
  contractName: eContractid
) => async (contractGetter?: ContractGetter): Promise<ContractType> => {
  let deployedContract = '';
  if (!contractGetter?.address) {
    try {
      deployedContract = (
        await getDb()
          .get(
            `${contractName}${contractGetter?.slug ? `-${contractGetter.slug}` : ''}.${
              BRE.network.name
            }`
          )
          .value()
      ).address;
    } catch (e) {
      throw new Error(
        `Contract ${contractName} was not deployed on ${BRE.network.name} or not stored in DB`
      );
    }
  }
  return (await BRE.ethers.getContractAt(
    contractName,
    contractGetter?.address || deployedContract
  )) as ContractType;
};

const linkBytecode = (artifact: Artifact, libraries: any) => {
  let bytecode = artifact.bytecode;

  for (const [fileName, fileReferences] of Object.entries(artifact.linkReferences)) {
    for (const [libName, fixups] of Object.entries(fileReferences)) {
      const addr = libraries[libName];

      if (addr === undefined) {
        continue;
      }

      for (const fixup of fixups) {
        bytecode =
          bytecode.substr(0, 2 + fixup.start * 2) +
          addr.substr(2) +
          bytecode.substr(2 + (fixup.start + fixup.length) * 2);
      }
    }
  }

  return bytecode;
};

export const getContract = async <ContractType extends Contract>(
  contractName: string,
  address: string
): Promise<ContractType> => (await BRE.ethers.getContractAt(contractName, address)) as ContractType;
