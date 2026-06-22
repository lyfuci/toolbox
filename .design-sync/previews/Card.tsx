import * as React from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
  Input,
  Label,
} from 'toolbox'

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

export function Basic() {
  return (
    <Frame>
      <Card style={{ width: 360 }}>
        <CardHeader>
          <CardTitle>Project settings</CardTitle>
          <CardDescription>Manage how your project is built and deployed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label htmlFor="proj">Name</Label>
            <Input id="proj" defaultValue="toolbox" />
          </div>
        </CardContent>
        <CardFooter style={{ justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="outline">Cancel</Button>
          <Button>Save</Button>
        </CardFooter>
      </Card>
    </Frame>
  )
}

export function WithAction() {
  return (
    <Frame>
      <Card style={{ width: 360 }}>
        <CardHeader>
          <CardTitle>Deployment</CardTitle>
          <CardDescription>Last shipped 2 minutes ago.</CardDescription>
          <CardAction>
            <Button size="sm" variant="outline">
              View
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
            Static build deployed to the edge. All checks passed and the site is live.
          </p>
        </CardContent>
      </Card>
    </Frame>
  )
}

export function Stat() {
  return (
    <Frame>
      <Card style={{ width: 220 }}>
        <CardHeader>
          <CardDescription>Total visits</CardDescription>
          <CardTitle style={{ fontSize: 30 }}>48,217</CardTitle>
          <CardAction>
            <span style={{ fontSize: 13, color: 'var(--primary)' }}>+12.5%</span>
          </CardAction>
        </CardHeader>
        <CardFooter>
          <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>vs. last month</span>
        </CardFooter>
      </Card>
    </Frame>
  )
}
