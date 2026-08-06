import React from 'react'
import { CategoryIcon, type CategoryIconProps } from '../CategoryIcon'

export type ProyectoIconProps = CategoryIconProps

export const ProyectoIcon: React.FC<ProyectoIconProps> = (props) => {
  const name = props.name?.trim() ? props.name : 'FolderKanban'

  return <CategoryIcon {...props} name={name} />
}
