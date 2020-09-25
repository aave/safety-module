import rawBRE from '@nomiclabs/buidler';
import {Signer, ethers} from 'ethers';

import {getEthersSigners, insertContractAddressInDb} from '../helpers/contracts-helpers';

import {initializeMakeSuite} from './helpers/make-suite';
import {
  deployAaveIncentivesController,
  deployStakedAave,
  deployMintableErc20,
  deployInitializableAdminUpgradeabilityProxy,
  deployMockTransferHook,
  deployATokenMock,
} from '../helpers/contracts-accessors';
import {
  PSM_STAKER_PREMIUM,
  COOLDOWN_SECONDS,
  UNSTAKE_WINDOW,
  MAX_UINT_AMOUNT,
  STAKED_AAVE_NAME,
  STAKED_AAVE_SYMBOL,
  STAKED_AAVE_DECIMALS,
} from '../helpers/constants';
import {waitForTx} from '../helpers/misc-utils';
import {eContractid} from '../helpers/types';
import {MintableErc20} from '../types/MintableErc20';

const topUpWalletsWithAave = async (
  wallets: Signer[],
  aaveToken: MintableErc20,
  amount: string
) => {
  for (const wallet of wallets) {
    await waitForTx(await aaveToken.connect(wallet).mint(amount));
  }
};

const buildTestEnv = async (deployer: Signer, vaultOfRewards: Signer, restWallets: Signer[]) => {
  console.time('setup');
  const proxyAdmin = await restWallets[0].getAddress();
  const emissionManager = await deployer.getAddress();

  const aaveToken = await deployMintableErc20(['Aave', 'aave', 18]);

  await waitForTx(await aaveToken.connect(vaultOfRewards).mint(ethers.utils.parseEther('1000000')));
  await topUpWalletsWithAave(
    [
      restWallets[0],
      restWallets[1],
      restWallets[2],
      restWallets[3],
      restWallets[4],
      restWallets[5],
    ],
    aaveToken,
    ethers.utils.parseEther('100').toString()
  );

  const stakedToken = aaveToken.address;
  const rewardsToken = aaveToken.address;

  const vaultOfRewardsAddress = await vaultOfRewards.getAddress();

  const aaveIncentivesControllerProxy = await deployInitializableAdminUpgradeabilityProxy();
  const stakedAaveProxy = await deployInitializableAdminUpgradeabilityProxy();

  const aaveIncentivesControllerImplementation = await deployAaveIncentivesController([
    aaveToken.address,
    vaultOfRewardsAddress,
    stakedAaveProxy.address,
    PSM_STAKER_PREMIUM,
    emissionManager,
    (1000 * 60 * 60).toString(),
  ]);

  const stakedAaveImpl = await deployStakedAave([
    stakedToken,
    rewardsToken,
    COOLDOWN_SECONDS,
    UNSTAKE_WINDOW,
    vaultOfRewardsAddress,
    emissionManager,
    (1000 * 60 * 60).toString(),
  ]);

  const mockTransferHook = await deployMockTransferHook();

  const stakedAaveEncodedInitialize = stakedAaveImpl.interface.encodeFunctionData('initialize', [
    mockTransferHook.address,
    STAKED_AAVE_NAME,
    STAKED_AAVE_SYMBOL,
    STAKED_AAVE_DECIMALS,
  ]);
  await stakedAaveProxy['initialize(address,address,bytes)'](
    stakedAaveImpl.address,
    proxyAdmin,
    stakedAaveEncodedInitialize
  );
  await waitForTx(
    await aaveToken.connect(vaultOfRewards).approve(stakedAaveProxy.address, MAX_UINT_AMOUNT)
  );
  await insertContractAddressInDb(eContractid.StakedAave, stakedAaveProxy.address);

  const peiEncodedInitialize = aaveIncentivesControllerImplementation.interface.encodeFunctionData(
    'initialize'
  );
  await aaveIncentivesControllerProxy['initialize(address,address,bytes)'](
    aaveIncentivesControllerImplementation.address,
    proxyAdmin,
    peiEncodedInitialize
  );
  await waitForTx(
    await aaveToken
      .connect(vaultOfRewards)
      .approve(aaveIncentivesControllerProxy.address, MAX_UINT_AMOUNT)
  );
  await insertContractAddressInDb(
    eContractid.AaveIncentivesController,
    aaveIncentivesControllerProxy.address
  );

  await deployATokenMock(aaveIncentivesControllerProxy.address, 'aDai');
  await deployATokenMock(aaveIncentivesControllerProxy.address, 'aWeth');

  console.timeEnd('setup');
};

before(async () => {
  await rawBRE.run('set-bre');
  const [deployer, rewardsVault, ...restWallets] = await getEthersSigners();
  console.log('-> Deploying test environment...');
  await buildTestEnv(deployer, rewardsVault, restWallets);
  await initializeMakeSuite();
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
