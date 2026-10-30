"use client";

import { FlagIcon, Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { jonas, mia, newcomer } from "@/mocks/profiles";

import { Example, Section, ThemePanels } from "./section";

export function PrimitivesSection() {
  return (
    <Section
      id="primitives"
      title="Primitives"
      description="shadcn/ui (radix-nova) restyled to the tokens. Lives in src/components/ui."
    >
      <Example title="Button" note="Variants, sizes and states.">
        <ThemePanels>
          <div className="flex flex-wrap gap-2">
            <Button>Publish</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete track</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">
              <PlusIcon /> Small
            </Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="outline" aria-label="Settings">
              <SettingsIcon />
            </Button>
            <Button disabled>Disabled</Button>
            <Button disabled>
              <Loader2Icon className="motion-safe:animate-spin" /> Sending…
            </Button>
          </div>
        </ThemePanels>
      </Example>

      <Example title="Input and Textarea" note="Normal, invalid, disabled.">
        <ThemePanels>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Title
              <Input placeholder="Night Bus (demo 4)" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Handle
              <Input
                aria-invalid
                defaultValue="admin"
                aria-describedby="design-handle-error"
              />
              <span
                id="design-handle-error"
                className="text-sm font-normal text-destructive"
              >
                That username is reserved. Try another.
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <Input disabled defaultValue="nora@example.com" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Description
              <Textarea placeholder="Anything people should know before they listen?" />
            </label>
          </div>
        </ThemePanels>
      </Example>

      <div className="grid gap-8 md:grid-cols-2">
        <Example title="Badge">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="solid">Needs ears</Badge>
            <Badge variant="secondary">Whole track</Badge>
            <Badge variant="outline">Mix</Badge>
            <Badge variant="gold">Gold</Badge>
            <Badge variant="destructive">Hidden</Badge>
          </div>
        </Example>
        <Example
          title="Avatar"
          note="Image or initials. Sizes sm, default, lg, xl."
        >
          <div className="flex items-end gap-3">
            <UserAvatar profile={jonas} size="sm" />
            <UserAvatar profile={mia} />
            <UserAvatar profile={newcomer} size="lg" />
            <UserAvatar profile={jonas} size="xl" />
          </div>
        </Example>
        <Example title="Tabs" note="Segmented and line.">
          <div className="grid gap-4">
            <Tabs defaultValue="needs">
              <TabsList aria-label="Feed, segmented">
                <TabsTrigger value="needs">Needs ears</TabsTrigger>
                <TabsTrigger value="latest">Latest</TabsTrigger>
                <TabsTrigger value="trending">Trending</TabsTrigger>
              </TabsList>
              {["needs", "latest", "trending"].map((v) => (
                <TabsContent key={v} value={v} className="sr-only">
                  {v}
                </TabsContent>
              ))}
            </Tabs>
            <Tabs defaultValue="tracks">
              <TabsList variant="line" aria-label="Profile, line">
                <TabsTrigger value="tracks">Tracks</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
              </TabsList>
              {["tracks", "comments"].map((v) => (
                <TabsContent key={v} value={v} className="sr-only">
                  {v}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </Example>
        <Example title="Skeleton">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </Example>
        <Example title="Tooltip, menu, dialog, toast">
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>
                Only the uploader can mark Helpful.
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Track</DropdownMenuLabel>
                <DropdownMenuItem>Copy link</DropdownMenuItem>
                <DropdownMenuItem>
                  <FlagIcon /> Report
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  Delete track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this track?</DialogTitle>
                  <DialogDescription>
                    The track and all its comments are gone for good.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive">Delete track</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              onClick={() => toast.success("Link copied.")}
            >
              Toast
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.error(
                  "Your comment didn't go through. Your text is still here. Try again.",
                )
              }
            >
              Error toast
            </Button>
          </div>
        </Example>
      </div>
    </Section>
  );
}
