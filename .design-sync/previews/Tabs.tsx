import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from 'toolbox'

function Frame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="dark"
      style={{
        background: 'var(--background)',
        color: 'var(--foreground)',
        colorScheme: 'dark',
        padding: 24,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

const body: React.CSSProperties = { fontSize: 14, color: 'var(--muted-foreground)', margin: '12px 0 0' }

export function Default() {
  return (
    <Frame>
      <Tabs defaultValue="account" style={{ width: 400 }}>
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <p style={body}>Make changes to your account. Click save when you're done.</p>
        </TabsContent>
        <TabsContent value="password">
          <p style={body}>Change your password here.</p>
        </TabsContent>
      </Tabs>
    </Frame>
  )
}

export function Line() {
  return (
    <Frame>
      <Tabs defaultValue="overview" style={{ width: 400 }}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <p style={body}>A high-level summary of your workspace.</p>
        </TabsContent>
      </Tabs>
    </Frame>
  )
}
