import './ToggleSwitch.css'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  id?: string
}

export function ToggleSwitch({ checked, onChange, disabled = false, size = 'md', id }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      className={`toggle-switch toggle-switch--${size} ${checked ? 'toggle-switch--on' : 'toggle-switch--off'}`}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="toggle-switch-thumb" />
    </button>
  )
}

export default ToggleSwitch
