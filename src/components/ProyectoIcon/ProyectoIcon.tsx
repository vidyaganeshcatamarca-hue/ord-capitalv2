import React from 'react';
import { CategoryIcon } from '../CategoryIcon';

export interface ProyectoIconProps {
  name?: string | null;
  size?: number;
  className?: string;
}

export const ProyectoIcon: React.FC<ProyectoIconProps> = (props) => {
  let name: string;

  if (!props.name || props.name.trim() === '') {
    name = 'FolderKanban';
  } else {
    name = props.name;
  }

  return <CategoryIcon name={name} size={props.size} className={props.className} />;
};
