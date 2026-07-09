import { useState, useEffect, useRef } from 'react'
import './CalculatorKeypad.css'

import { safeEval } from '@/utils/math'

// Set para O(1) lookup en lugar de [].includes() que itera el array en cada keystroke
const OP_CHARS = new Set(['+', '-', '*', '/'])

interface CalculatorKeypadProps {
  value: string
  onChange: (val: string) => void
  onClose?: () => void
}

export function CalculatorKeypad({ value, onChange, onClose }: CalculatorKeypadProps) {
  const [expr, setExpr] = useState<string>(value === '0' ? '' : value)

  const evaluateExpression = (expression: string): string => {
    try {
      const result = safeEval(expression)
      if (isNaN(result) || !isFinite(result)) return '0'
      // Redondear a 2 decimales si es necesario
      return parseFloat(result.toFixed(2)).toString()
    } catch {
      return expression // Si falla, mantener la expresión
    }
  }

  const handlePress = (char: string) => {
    // Si la expresión es '0', limpiar al escribir un número
    let newExpr = expr
    if (expr === '0' && /[0-9]/.test(char)) {
      newExpr = ''
    }

    if (char === 'C') {
      newExpr = '0'
    } else if (char === '←') {
      newExpr = expr.slice(0, -1)
      if (newExpr === '') newExpr = '0'
    } else if (char === '=') {
      newExpr = evaluateExpression(expr)
    } else {
      // Evitar múltiples operadores seguidos
      const lastChar = expr.slice(-1)
      if (['+', '-', '*', '/'].includes(lastChar) && ['+', '-', '*', '/'].includes(char)) {
        newExpr = expr.slice(0, -1) + char
      } else {
        newExpr = expr === '0' && char !== '.' ? char : expr + char
      }
    }

    setExpr(newExpr)
    
    // Si es un número final o se presionó '=', propagar el valor evaluado
    if (char === '=') {
      const finalVal = evaluateExpression(expr)
      onChange(finalVal)
    } else {
      // Propagar el string literal para que el input muestre la operación temporal
      onChange(newExpr)
    }
  }

  // Ref siempre apuntando al expr actual — evita recrear el listener en cada keystroke
  const exprRef = useRef(expr)
  exprRef.current = expr

  // Soporte para teclado físico (PC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el foco está en un input que no sea el de importe
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        const isMontoInput = activeEl.classList.contains('font-mono') || activeEl.getAttribute('id') === 'monto-input'
        if (!isMontoInput) {
          return
        }
      }

      const key = e.key
      if (/[0-9]/.test(key)) {
        e.preventDefault()
        handlePress(key)
      } else if (key === '.' || key === ',') {
        e.preventDefault()
        handlePress('.')
      } else if (OP_CHARS.has(key)) {
        e.preventDefault()
        handlePress(key)
      } else if (key === 'Backspace') {
        e.preventDefault()
        handlePress('←')
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault()
        handlePress('=')
      } else if (key === 'Escape') {
        e.preventDefault()
        if (onClose) onClose()
      } else if (key.toLowerCase() === 'c') {
        e.preventDefault()
        handlePress('C')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, []) // sin dependencias — handlePress lee exprRef.current

  const handleApply = () => {
    const finalVal = evaluateExpression(expr)
    onChange(finalVal)
    if (onClose) onClose()
  }

  return (
    <div className="calculator-keypad-container">
      <div className="calc-display-expr">{expr || '0'}</div>
      <div className="calc-buttons-grid">
        <button type="button" className="calc-btn clear" onClick={() => handlePress('C')}>C</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('←')}>←</button>
        <button type="button" className="calc-btn operator" onClick={() => handlePress('/')}>/</button>
        <button type="button" className="calc-btn operator" onClick={() => handlePress('*')}>*</button>

        <button type="button" className="calc-btn" onClick={() => handlePress('7')}>7</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('8')}>8</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('9')}>9</button>
        <button type="button" className="calc-btn operator" onClick={() => handlePress('-')}>-</button>

        <button type="button" className="calc-btn" onClick={() => handlePress('4')}>4</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('5')}>5</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('6')}>6</button>
        <button type="button" className="calc-btn operator" onClick={() => handlePress('+')}>+</button>

        <button type="button" className="calc-btn" onClick={() => handlePress('1')}>1</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('2')}>2</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('3')}>3</button>
        <button type="button" className="calc-btn equals" onClick={() => handlePress('=')}>=</button>

        <button type="button" className="calc-btn" style={{ gridColumn: 'span 2' }} onClick={() => handlePress('0')}>0</button>
        <button type="button" className="calc-btn" onClick={() => handlePress('.')}>.</button>
        <button type="button" className="calc-btn" style={{ background: 'rgba(78, 205, 196, 0.1)', color: 'var(--mint)', borderColor: 'rgba(78, 205, 196, 0.3)' }} onClick={handleApply}>✓ OK</button>
      </div>
    </div>
  )
}
