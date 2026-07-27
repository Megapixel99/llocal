import { useLocal } from "@renderer/hooks/useLocal";
import { notificationPrefsAtom, suggestionsAtom, transparencyModeAtom } from "@renderer/store/mocks";
import { BreadCrumb } from "@renderer/ui/BreadCrumb";
import { Checkbox } from "@renderer/ui/Checkbox";
import { cn, t } from "@renderer/utils/utils";
import { useAtomValue } from "jotai";
import { ComponentProps } from "react";
import { toast } from "sonner";
import { NOTIFICATION_EVENTS, NOTIFICATION_EVENT_LABELS } from "../../../../shared/notifications";

export default function Preferences({ className, ...props }: ComponentProps<'div'>): React.ReactElement {
  // Defining the the hooks at the top of the function
  const suggestions = useAtomValue(suggestionsAtom)
  const transparencyMode = useAtomValue(transparencyModeAtom)
  const notificationPrefs = useAtomValue(notificationPrefsAtom)
  const { setShowSuggestion, setTransparency, setNotificationsEnabled, setNotificationEvent } = useLocal()

  // Handles multiple preferences
  function handleClick(state: boolean, setState: (pref: boolean) => void, preference: string): void {
    // this shit is so hard to read, because this is the toggle AAAAAAAH
    toast.info(!state ? t('preferenceOn', { preference }) : t('preferenceOff', { preference }))
    setState(!state)
  }
  return <div className={cn('flex flex-col gap-3', className)} {...props}>
    <div className="flex gap-2">
      <BreadCrumb className="flex justify-center items-center gap-2" onClick={() => handleClick(suggestions.show, setShowSuggestion, 'Suggestions')}>
        <Checkbox isExternalState={true} externalState={suggestions.show} className="text-sm" />
        {t("Suggestions ( Experimental )")}
      </BreadCrumb>
      <BreadCrumb className="flex justify-center items-center gap-2" onClick={() => handleClick(transparencyMode, setTransparency, 'Transparency Mode')}>
        <Checkbox isExternalState={true} externalState={transparencyMode} className="text-sm" />
        {t("Transparency Mode")}
      </BreadCrumb>
    </div>

    {/* Native OS notifications: a global switch plus a per-event-type toggle map. */}
    <div className="flex flex-col gap-2">
      <span className="text-sm opacity-70">{t("Notifications")}</span>
      <BreadCrumb className="flex justify-center items-center gap-2" onClick={() => handleClick(notificationPrefs.enabled, setNotificationsEnabled, 'Notifications')}>
        <Checkbox isExternalState={true} externalState={notificationPrefs.enabled} className="text-sm" />
        {t("Enable notifications")}
      </BreadCrumb>
      {notificationPrefs.enabled && (
        <div className="flex flex-wrap gap-2 pl-2">
          {NOTIFICATION_EVENTS.map((event) => (
            <BreadCrumb
              key={event}
              className="flex justify-center items-center gap-2"
              onClick={() => handleClick(notificationPrefs.events[event], (pref) => setNotificationEvent(event, pref), NOTIFICATION_EVENT_LABELS[event])}
            >
              <Checkbox isExternalState={true} externalState={notificationPrefs.events[event]} className="text-sm" />
              {t(NOTIFICATION_EVENT_LABELS[event])}
            </BreadCrumb>
          ))}
        </div>
      )}
    </div>
  </div>
}
