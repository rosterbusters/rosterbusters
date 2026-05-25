import {
  Combobox,
  Portal,
  Text,
  useListCollection,
  VStack,
} from "@chakra-ui/react"
import { useEffect } from "react"

export interface SearchableNurseItem {
  value: string
  label: string
  description?: string
}

interface SearchableNurseComboboxProps {
  items: SearchableNurseItem[]
  value: string[]
  onValueChange: (value: string[]) => void
  label?: string
  placeholder?: string
  disabled?: boolean
}

export function SearchableNurseCombobox({
  items,
  value,
  onValueChange,
  label = "Nurse",
  placeholder = "Search nurse",
  disabled,
}: SearchableNurseComboboxProps) {
  const { collection, filter, set } = useListCollection<SearchableNurseItem>({
    initialItems: items,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
    filter: (itemText, filterText, item) => {
      const query = filterText.trim().toLowerCase()
      if (!query) return true

      return [itemText, item.description]
        .filter(Boolean)
        .some((text) => text?.toLowerCase().includes(query))
    },
  })

  useEffect(() => {
    set(items)
  }, [items, set])

  return (
    <Combobox.Root
      collection={collection}
      size="sm"
      value={value}
      onValueChange={(event) => onValueChange(event.value)}
      onInputValueChange={(event) => filter(event.inputValue)}
      disabled={disabled}
      openOnClick
    >
      <Combobox.Label>{label}</Combobox.Label>
      <Combobox.Control>
        <Combobox.Input placeholder={placeholder} />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger />
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content>
            <Combobox.Empty>No nurses found</Combobox.Empty>
            {collection.items.map((item) => (
              <Combobox.Item item={item} key={item.value}>
                <VStack alignItems="start" gap={0}>
                  <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  {item.description ? (
                    <Text fontSize="xs" color="gray.500">
                      {item.description}
                    </Text>
                  ) : null}
                </VStack>
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  )
}
