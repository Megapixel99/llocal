import { ComponentProps } from 'react'
import { Card } from './Card'
import { cn, t } from '@renderer/utils/utils'

interface ThinkingProps extends ComponentProps<'div'> {
  label?: string
}

/**
 * A small animated placeholder shown while the model is generating but hasn't produced any
 * visible output yet (e.g. while it is still reasoning). Three dots pulse in sequence.
 * */
export const Thinking = ({ label, className, ...props }: ThinkingProps): React.ReactElement => {
  return (
    <Card className={cn('w-fit flex items-center gap-2 opacity-70', className)} {...props}>
      <span className="flex gap-1">
        <span className="size-2 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <span className="size-2 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <span className="size-2 rounded-full bg-current animate-bounce" />
      </span>
      <span className="text-sm animate-pulse">{label ?? t('Thinking')}</span>
    </Card>
  )
}
