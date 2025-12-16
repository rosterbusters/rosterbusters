import { Button } from "@chakra-ui/react/button"
import { IconButton as ChakraIconButton } from "@chakra-ui/react"
import * as React from "react"
import { LuX } from "react-icons/lu"

type Props = React.ComponentProps<typeof Button>

export type CloseButtonProps = Props

export const CloseButton = React.forwardRef<
  HTMLButtonElement,
  CloseButtonProps
>(function CloseButton(props, ref) {
  return (
    <ChakraIconButton variant="ghost" aria-label="Close" ref={ref} {...props}>
      {props.children ?? <LuX />}
    </ChakraIconButton>
  )
})
