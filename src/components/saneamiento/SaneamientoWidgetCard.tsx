import { ReactNode } from 'react'

interface SaneamientoWidgetCardProps {
  title: string
  icon: ReactNode
  iconBg: string
  children: ReactNode
  onClick?: () => void
}

export function SaneamientoWidgetCard({
  title,
  icon,
  iconBg,
  children,
  onClick,
}: SaneamientoWidgetCardProps) {
  return (
    <div className="saneamiento-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="saneamiento-card-header">
        <h3 className="saneamiento-card-title">
          <span className="saneamiento-card-icon" style={{ background: iconBg }}>
            {icon}
          </span>
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}
