import { Toaster as Sonner, type ToasterProps } from "sonner"
import { IconCircleCheck, IconInfoCircle, IconAlertTriangle, IconCircleX, IconLoader2 } from "@tabler/icons-react"

const Toaster = ({ theme = "system", ...props }: ToasterProps) => {

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <IconCircleCheck aria-hidden="true" className="size-4" />
        ),
        info: (
          <IconInfoCircle aria-hidden="true" className="size-4" />
        ),
        warning: (
          <IconAlertTriangle aria-hidden="true" className="size-4" />
        ),
        error: (
          <IconCircleX aria-hidden="true" className="size-4" />
        ),
        loading: (
          <IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
