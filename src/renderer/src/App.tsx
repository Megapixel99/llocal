import { Chat, RootLayout, Settings, Sidebar } from './components/AppLayout'
import { ArtifactPanel } from './components/Chat/ArtifactPanel'
import { InputForm } from './components/Chat/InputForm'
import { Messages } from './components/Chat/Messages'
import { ChatList } from './components/Sidebar/ChatList'
import { NewChat } from './components/Sidebar/NewChat'
import { SidebarTabs } from './components/Sidebar/SidebarTabs'
import { Separator } from './ui/Separator'
import { CommandCentre } from './components/Sidebar/CommandCentre'
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react'
import { backgroundImageAtom, isOllamaInstalledAtom, languageAtom, transparencyModeAtom } from './store/mocks'
import { Toaster } from 'sonner'
import { useEffect, useState } from 'react'
import { ollamaServe } from './utils/ollama'
import { Categories } from './components/Settings/Categories'
import { GetVersion } from './components/Settings/GetVersion'
import { TitleBar } from './components/TitleBar/Titlebar'
import { Theme, ThemeProvider } from './ui/ThemeProvider'

function App(): JSX.Element {
  const [platform, setPlatform] = useState("")
  const [backgroundImage] = useAtom(backgroundImageAtom)
  const setIsOllamaInstalled = useSetAtom(isOllamaInstalledAtom)

  // Ensuring the state update according to preference
  const theme = localStorage.getItem('darkMode') as Theme
  const language = useAtomValue(languageAtom)

  // Ensuring transparency mode preference
  const transparencyMode = useAtomValue(transparencyModeAtom)
  // Serving ollama, if not present, then downloading ollama
  useEffect(() => {
    async function getPlatform(): Promise<void> {
      setPlatform(await window.api.checkPlatform())
    }
    getPlatform()
    ollamaServe(setIsOllamaInstalled)
  }, [])


  // need to re-renderer all the children whenever the langauge changes
  useEffect(() => {
  }, [language])

  return (
    <ThemeProvider defaultTheme='dark' storageKey='darkMode'>
      <RootLayout
        className={`${transparencyMode ? 'bg-transparent' : 'bg-[#DDDDDD] dark:bg-[#2c2c2c]'} relative font-poppins scrollbar scrollbar-thumb-thin dark:text-foreground bg-cover w-full h-screen overflow-hidden`}
        style={{
          backgroundImage: `url("${backgroundImage}")`,
        }}
      >
        {platform == "win32" && <TitleBar />}
        {/* macOS/Linux have no custom TitleBar; add a slim draggable strip so the frameless window
            can still be moved. Sits in the top padding above the sidebar tabs / chat content. */}
        {platform !== "win32" && (
          <div className="draggable absolute top-0 inset-x-0 h-5 z-50" aria-hidden="true" />
        )}
        <Toaster className='font-poppins text-base' richColors theme={theme} />
        {/* justify-start keeps the tab bar at a constant top position across pages (justify-between
            vertically centered the content, so the tabs jumped as each page's height changed);
            mt-auto keeps the version pinned to the bottom. */}
        <Settings className="justify-start items-center gap-14 overflow-y-scroll">
          <Categories />
          <GetVersion className='pt-20 lg:p-0 mt-auto' />
        </Settings>
        <Sidebar className="bg-foreground bg-opacity-20 dark:bg-background dark:bg-opacity-20 backdrop-blur-lg flex flex-col gap-5">
          <SidebarTabs />
          <NewChat />
          <Separator />
          <h1 className="">Your chats</h1>
          <div className="h-3/4 overflow-y-auto">
            <ChatList />
          </div>
          <CommandCentre className="" />
        </Sidebar>
        <Chat className="flex flex-col justify-between items-center">
          <Messages className="" />
          <InputForm className="justify-self-end" />
        </Chat>
        <ArtifactPanel />
      </RootLayout >
    </ThemeProvider>
  )
}

export default App
