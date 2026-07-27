import { Card } from '@renderer/ui/Card'
import { BreadCrumb } from '@renderer/ui/BreadCrumb'
import { cn } from '@renderer/utils/utils'
import type { Command } from '@renderer/utils/commands'
import React, { ComponentProps } from 'react'

interface CommandPaletteProps extends ComponentProps<'div'> {
  commands: Command[]
  onSelectCommand: (command: Command) => void
}

/**
 * Slash-command picker shown while the user types `/…` in the chat input.
 * Selecting a command inserts its invocation; arguments (if any) are typed
 * after it and substituted into the command's template on submit.
 */
export const CommandPalette = ({
  className,
  commands,
  onSelectCommand,
  ...props
}: CommandPaletteProps): React.ReactElement => {
  return (
    <Card
      className={cn(
        className,
        'flex flex-col gap-1 w-full max-w-96 max-h-52 p-2 overflow-y-auto'
      )}
      {...props}
    >
      {commands.map((command, index) => {
        // Show only the leaf name in the title; the namespace is a chip.
        const leaf = command.name.includes(':')
          ? command.name.slice(command.name.lastIndexOf(':') + 1)
          : command.name
        return (
          <div
            key={index}
            onClick={() => onSelectCommand(command)}
            className="flex flex-col gap-0.5 px-2 py-1.5 rounded-lg opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-sm font-medium truncate">
                /{leaf}
                {command.argumentHint && (
                  <span className="ml-1 opacity-50 font-normal">{command.argumentHint}</span>
                )}
              </h1>
              {command.namespace && (
                <BreadCrumb className="text-indigo-400 shrink-0">{command.namespace}</BreadCrumb>
              )}
            </div>
            {command.description && (
              <p className="text-xs opacity-60 truncate">{command.description}</p>
            )}
          </div>
        )
      })}
    </Card>
  )
}
