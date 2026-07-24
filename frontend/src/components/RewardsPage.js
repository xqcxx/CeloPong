import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import WeeklyRewards from './WeeklyRewards';
import AdminRewards from './AdminRewards';
import { PONG_ESCROW_ADDRESS, PONG_ESCROW_ABI } from '../contracts/PongEscrow';
import '../styles/Rewards.css';

const RewardsPage = () => {
  const { address, isConnected } = useAccount();

  const { data: onChainOwner } = useReadContract({
    address: PONG_ESCROW_ADDRESS,
    abi: PONG_ESCROW_ABI,
    functionName: 'owner',
    enabled: Boolean(PONG_ESCROW_ADDRESS)
  });

  const isOwner = Boolean(
    isConnected &&
    address &&
    onChainOwner &&
    address.toLowerCase() === onChainOwner.toLowerCase()
  );

  return (
    <div className="rewards-page">
      <WeeklyRewards />
      {isOwner && <AdminRewards />}
    </div>
  );
};

export default RewardsPage;
