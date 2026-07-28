import { Menu } from '@renderer/ui/Menu'
import { Modal } from '@renderer/ui/Modal';
import { cn } from '@renderer/utils/utils';
import { ComponentProps, useState } from 'react'
import { MdDeleteForever } from 'react-icons/md';
import { TbEdit } from "react-icons/tb";
import { PiDotsThreeCircle, PiCircleFill } from "react-icons/pi";
import { LuInfo } from "react-icons/lu";
import { Button } from '@renderer/ui/Button';
import { useDb } from '@renderer/hooks/useDb';
import { z } from 'zod';
import { Input } from '@renderer/ui/Input';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useStructureOutputs } from '@renderer/hooks/useStructuredOutputs';
import { toast } from 'sonner';
import { HiMiniSparkles } from 'react-icons/hi2';
import { Card } from '@renderer/ui/Card';

interface ChatMenuProps extends ComponentProps<'div'> {
  date: string
}

export const ChatMenu = ({ className, date, ...props }: ChatMenuProps) => {
  const [open, setOpen] = useState(false)
  // stopPropagation so clicking the menu (or its items) doesn't also trigger the chat card's
  // onClick — that selected the chat and re-rendered the list, closing the menu before it showed.
  return <div onClick={(e) => e.stopPropagation()}>
    {/* Dimmed by default, full on hover; always shown on touch (no hover) so it's tappable. */}
    <div className={cn(`${open ? "opacity-100" : "opacity-50 lg:opacity-0"} group-hover:opacity-100 transition-opacity`, className)} {...props}>
      <Menu.Root onOpenChange={val => {
        // TODO: this is a bandaid fix, the css breaks intermittenly because when we switch from block -> hidden there's a 50-80ms ish
        // delay where because the Trigger itself is not any more in the DOM there is no anchor for the Menu causing it to tweak and absolutely position
        setTimeout(() => {
          setOpen(val)
        }, 150)
      }} modal={false}>
        <Menu.Trigger className="text-center h-full">
          <PiDotsThreeCircle className='text-2xl p-0' />
        </Menu.Trigger>
        <Menu.Content className={`z-[60] h-fit w-fit flex flex-col justify-center items-start gap-2`}>
          <RenameModal date={date}>
            <Menu.Item onSelect={(e) => e.preventDefault()} className='flex items-center'>
              <TbEdit className='text-2xl' />
              Rename
            </Menu.Item>
          </RenameModal>
          <MarkUnreadItem date={date} />
          <DeleteModal date={date}>
            <Menu.Item onSelect={(e) => e.preventDefault()} className='flex items-center'>
              <MdDeleteForever className='text-2xl' />
              Delete
            </Menu.Item>
          </DeleteModal>
        </Menu.Content>
      </Menu.Root>
    </div>
  </div>
}

// Direct action (no modal): flag the chat unread so its dot badge returns in the list.
const MarkUnreadItem = ({ date }: { date: string }): React.ReactElement => {
  const { markUnread } = useDb()
  return (
    <Menu.Item onSelect={() => markUnread(date)} className='flex items-center gap-1'>
      <PiCircleFill className='text-blue-500' />
      Mark as unread
    </Menu.Item>
  )
}

interface ChatListModalProps extends ChatMenuProps {
  open?: boolean
}

const DeleteModal = ({ className, date, children, ...props }: ChatListModalProps) => {
  const { deleteChat } = useDb()
  async function handleDelete(date: string) {
    await deleteChat(date)
  }
  return <Modal.Root  {...props}>
    <Modal.Overlay />
    <Modal.Trigger>{children}</Modal.Trigger>
    <Modal.Content className='gap-4'>
      <Modal.Header className='flex items-center text-center self-center gap-2 font-bold mb-2 text-md'>
        <LuInfo className='text-2xl' /> Are you sure?
      </Modal.Header>
      <Modal.Description className='w-72'>All your data is llocaly saved, once you delete this chat is gone forever!</Modal.Description>
      <div className='flex gap-2 justify-end mt-2'>
        <Modal.CancelTrigger>
          <Button variant='secondary' >Cancel</Button>
        </Modal.CancelTrigger>
        <Modal.AcceptTrigger callbackFn={() => { handleDelete(date) }}>
          <Button variant='primary' className='bg-red-950 dark:bg-red-500'>Delete</Button>
        </Modal.AcceptTrigger>
      </div>
    </Modal.Content>
  </Modal.Root>
}

type FormFields = {
  title?: string
}

const Title = z.object({
  title: z.string().trim().nonempty().min(1)
})

const RenameModal = ({ className, date, children, ...props }: ChatListModalProps) => {
  const { register, handleSubmit, reset } = useForm<FormFields>()
  const [isLoading, setLoading] = useState(false)
  const { getStructuredResponse } = useStructureOutputs()
  const { getChat, updateTitle } = useDb()

  async function handleClick() {
    const id = toast.loading("Generating a title...")
    const chat = await getChat(date)
    let response: null | FormFields
    response = await getStructuredResponse(JSON.stringify(chat), Title, "Based on the chat history give, generate an apt title. Keep concise and short.")
    if (!response) toast.error("Title could not be generated", { id })
    else {
      toast.dismiss(id)
      reset({ title: response['title'] })
    }
  }

  const onSubmit: SubmitHandler<FormFields> = async (data) => {
    reset()
    if (data.title) {
      setLoading(true)
      updateTitle(date, String(data.title))
      setLoading(false)
    }
  }

  function onError(errors, _event) {
    console.log("inside")
    console.log(errors)
  }

  return <Modal.Root {...props}>
    <Modal.Overlay />
    <Modal.Trigger>{children}</Modal.Trigger>
    <Modal.Content className='gap-4'>
      <Modal.Header className='flex items-center text-center self-center gap-2 font-bold mb-2 text-md'>
        <LuInfo className='text-2xl' /> Rename
      </Modal.Header>
      <Modal.Form className='space-y-2' onSubmit={handleSubmit(onSubmit, onError)}>
        <Input
          name="title"
          register={register}
          disabled={isLoading}
          placeholder='Enter a title'
        />
        <Card
          onClick={() => handleClick()}
          className="w-fit text-xs p-2 rounded-xl cursor-pointer opacity-50 hover:opacity-100 transition-all">
          <p className='flex justify-center items-center gap-1'>
            <HiMiniSparkles className='text-yellow-500' />
            Generate a title
          </p>
        </Card>
        <div className='flex gap-2 justify-end mt-2'>
          <Modal.CancelTrigger>
            <Button type='button' variant='secondary' >Cancel</Button>
          </Modal.CancelTrigger>
          <Modal.AcceptTrigger type='submit' variant="primary">
            Rename
          </Modal.AcceptTrigger >
        </div>
      </Modal.Form>
    </Modal.Content>
  </Modal.Root>
}
