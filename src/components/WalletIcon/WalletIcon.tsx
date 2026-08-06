import React from 'react'
import { CategoryIcon, type CategoryIconProps } from '../CategoryIcon'

export type WalletIconProps = CategoryIconProps

export const WalletIcon: React.FC<WalletIconProps> = (props) => {
  const name = props.name?.trim() ? props.name : 'Wallet'

  return <CategoryIcon {...props} name={name} />
}
