import * as React from 'react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from 'toolbox'
import {
  CalendarIcon,
  SmileIcon,
  CalculatorIcon,
  UserIcon,
  CreditCardIcon,
  SettingsIcon,
} from 'lucide-react'

export function Palette() {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
      }}
    >
      <Command
        style={{
          width: 400,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem>
              <CalendarIcon /> Calendar
            </CommandItem>
            <CommandItem>
              <SmileIcon /> Search Emoji
            </CommandItem>
            <CommandItem>
              <CalculatorIcon /> Calculator
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem>
              <UserIcon /> Profile
              <CommandShortcut>⌘P</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <CreditCardIcon /> Billing
              <CommandShortcut>⌘B</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <SettingsIcon /> Settings
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}
