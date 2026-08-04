import React from 'react';
import { CategoryIcon } from '../CategoryIcon';

export interface WalletIconProps {
  name?: string | null;
  size?: number;
  className?: string;
}

export const WalletIcon: React.FC<WalletIconProps> = (props) => {
  let name: string;

  if (!props.name || props.name.trim() === '') {
    name = 'Wallet';
  } else {
    name = props.name;
  }

  return <CategoryIcon name={name} size={props.size} className={props.className} />;
};
