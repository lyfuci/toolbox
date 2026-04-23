import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'secondary'}
      onClick={onClick}
      className="justify-start"
    >
      {icon}
      {label}
    </Button>
  )
}
