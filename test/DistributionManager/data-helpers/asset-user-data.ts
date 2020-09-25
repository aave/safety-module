import {BigNumber} from 'ethers';
import {DistributionManager} from '../../../types/DistributionManager';
import {StakedAave} from '../../../types/StakedAave';
import {AaveIncentivesController} from '../../../types/AaveIncentivesController';

export type UserStakeInput = {
  underlyingAsset: string;
  stakedByUser: string;
  totalStaked: string;
};

export type UserPositionUpdate = UserStakeInput & {
  user: string;
};
export async function getUserIndex(
  distributionManager: DistributionManager | AaveIncentivesController | StakedAave,
  user: string,
  asset: string
): Promise<BigNumber> {
  return await distributionManager.getUserAssetData(user, asset);
}
