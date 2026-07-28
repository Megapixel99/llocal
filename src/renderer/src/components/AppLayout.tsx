import { ComponentProps, useState, DragEvent } from 'react'
import { twMerge } from 'tailwind-merge'
import { IoIosArrowForward, IoIosArrowBack } from 'react-icons/io'
import { IoMenu } from 'react-icons/io5'
import { AiFillCloseCircle } from 'react-icons/ai'
import { fileDropAtom, settingsToggleAtom } from '@renderer/store/mocks'
import { useAtom, useSetAtom } from 'jotai'
import { cn, t } from '@renderer/utils/utils'
import { useFileDrop } from '@renderer/hooks/useFileDrop'

export const RootLayout = ({
  className,
  children,
  ...props
}: ComponentProps<'main'>): React.ReactElement => {
  return (
    <main className={twMerge('h-full w-full flex flex-row', className)} {...props}>
      {children}
    </main>
  )
}

export const Settings = ({
  className,
  children,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  const [settingsToggle, setSettingsToggle] = useAtom(settingsToggleAtom)
  function handleClick(): void {
    setSettingsToggle((preValue) => !preValue)
  }
  return (
    <>
      {settingsToggle && (
        <div
          className={twMerge(
            `dark:bg-black dark:bg-opacity-50 bg-foreground bg-opacity-50 absolute z-50 flex flex-col justify-center items-center w-full h-screen backdrop-blur p-5 overflow-y-scroll overflow-x-hidden`,
            className
          )}
          {...props}
        >
          {/* Normal top row (not sticky) so it doesn't collide with the sticky tab bar below it. */}
          <div className="w-full max-w-[92vw] lg:max-w-none">
            <div
              onClick={handleClick}
              className="flex opacity-50 gap-1 cursor-pointer hover:opacity-100 transition-all w-fit"
            >
              <AiFillCloseCircle className="text-2xl " />
              <h1 className="">{t("Close")}</h1>
            </div>
          </div>
          {children}
        </div>
      )}
    </>
  )
}

export const ModelConfiguration = ({
  className,
  children,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  return (
    <div className={twMerge('', className)} {...props}>
      {children}
    </div>
  )
}

export const Sidebar = ({
  className,
  children,
  ...props
}: ComponentProps<'aside'>): React.ReactElement => {
  // Open by default on large screens; a slide-in drawer (closed) on small ones.
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024
  )
  return (
    <>
      {/* Hamburger to open the drawer — mobile only, shown when closed. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          // Top-right: clear of the macOS window traffic-lights (top-left) in a narrow desktop
          // window, and clear of the iOS status bar's left side on mobile.
          className="fixed top-3 right-3 z-40 p-2 rounded-xl bg-background/30 backdrop-blur-lg shadow-lg lg:hidden"
        >
          <IoMenu className="text-2xl" />
        </button>
      )}
      {/* Dimmed backdrop behind the drawer — mobile only. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      )}
      <div className="flex gap-2 items-center justify-center bg-transparent">
        <aside
          className={twMerge(
            `fixed lg:static top-0 left-0 z-40 h-screen p-5 overflow-hidden transition-all duration-300
             w-[82vw] max-w-[300px] lg:max-w-none
             ${open ? 'translate-x-0 lg:w-[250px]' : '-translate-x-full lg:w-0 lg:p-0'}
             lg:translate-x-0`,
            className
          )}
          {...props}
        >
          {/* Close affordance — a collapse handle on the drawer's right edge (mobile only), kept
              clear of the Chat/Code tabs at the top. */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden absolute top-1/2 right-0 -translate-y-1/2 z-10 rounded-full bg-foreground/10 dark:bg-background/40 p-1 backdrop-blur opacity-70 hover:opacity-100"
          >
            <IoIosArrowBack className="text-2xl" />
          </button>
          {children}
        </aside>
        {/* Desktop collapse toggle. */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Toggle sidebar"
          className="hidden lg:block cursor-pointer opacity-50 hover:opacity-100"
        >
          {open ? (
            <IoIosArrowBack className="text-2xl" />
          ) : (
            <IoIosArrowForward className="text-2xl" />
          )}
        </button>
      </div>
    </>
  )
}

export const Chat = ({
  className,
  children,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  const setFileDrop = useSetAtom(fileDropAtom)
  const { handleDrop } = useFileDrop()
  function handleEvent(e: DragEvent, val: boolean) {
    e.preventDefault()
    setFileDrop(val)
  }
  return (
    <aside onDrop={handleDrop} onDragOver={(e) => handleEvent(e, true)} onDragLeave={(e) => handleEvent(e, false)} className={twMerge('flex-1 overflow-hidden pt-10 pb-6 px-8 lg:pt-8', className)} {...props}>
      {children}
    </aside>
  )
}

export const TitleBarLayout = ({ className, children, ...props }: ComponentProps<'div'>): React.ReactElement => {
  return <div className={cn("", className)} {...props}>
    {children}
  </div>
}
