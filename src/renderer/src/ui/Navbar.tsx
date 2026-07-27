import React, { ComponentProps } from 'react'
import { Card } from './Card'
import { cn } from '@renderer/utils/utils'

export const NavbarItem = ({
  className,
  children,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  return (
    <Card className={cn( 'p-3 px-6 w-fit shrink-0 whitespace-nowrap text-center opacity-50 hover:opacity-100 transition-all cursor-pointer',className)} {...props}>
      {children}
    </Card>
  )
}

export const Navbar = ({
  className,
  children,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  return (
    <Card className={cn('flex w-fit max-w-[92vw] gap-2 items-center p-3 px-4 overflow-x-auto',className)} {...props}>
      {children}
    </Card>
  )
}
