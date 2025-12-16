import { createFileRoute } from '@tanstack/react-router'
import { Button, Menu, Portal } from "@chakra-ui/react"
export const Route = createFileRoute('/wardStaff/test')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
  <>
  <div>Hello "/wardStaff/test"!</div>
  <Button variant="ghost">Button</Button>
  <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="outline" size="sm">
          Open
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.Item value="new-txt-a">
              New Text File <Menu.ItemCommand>⌘E</Menu.ItemCommand>
            </Menu.Item>
            <Menu.Item value="new-file-a">
              New File... <Menu.ItemCommand>⌘N</Menu.ItemCommand>
            </Menu.Item>
            <Menu.Item value="new-win-a">
              New Window <Menu.ItemCommand>⌘W</Menu.ItemCommand>
            </Menu.Item>
            <Menu.Item value="open-file-a">
              Open File... <Menu.ItemCommand>⌘O</Menu.ItemCommand>
            </Menu.Item>
            <Menu.Item value="export-a">
              Export <Menu.ItemCommand>⌘S</Menu.ItemCommand>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  </>
  )
}
