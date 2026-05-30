import { createRef } from 'react'
import NoteListPage from '@/pages/primary/NoteListPage'
import ExplorePage from '@/pages/primary/ExplorePage'
import ListsPage from '@/pages/primary/ListsPage'
import LiveStreamsPage from '@/pages/primary/LiveStreamsPage'
import MePage from '@/pages/primary/MePage'
import NotificationListPage from '@/pages/primary/NotificationListPage'
import ProfilePage from '@/pages/primary/ProfilePage'
import ReadsPage from '@/pages/primary/ReadsPage'
import RelayPage from '@/pages/primary/RelayPage'
import SearchPage from '@/pages/primary/SearchPage'
import { type TPageRef } from '@/types'

export const PRIMARY_PAGE_REF_MAP = {
  home: createRef<TPageRef>(),
  reads: createRef<TPageRef>(),
  lists: createRef<TPageRef>(),
  explore: createRef<TPageRef>(),
  notifications: createRef<TPageRef>(),
  livestreams: createRef<TPageRef>(),
  me: createRef<TPageRef>(),
  profile: createRef<TPageRef>(),
  relay: createRef<TPageRef>(),
  search: createRef<TPageRef>()
}

export const PRIMARY_PAGE_MAP = {
  home: <NoteListPage ref={PRIMARY_PAGE_REF_MAP.home} />,
  reads: <ReadsPage ref={PRIMARY_PAGE_REF_MAP.reads} />,
  lists: <ListsPage ref={PRIMARY_PAGE_REF_MAP.lists} />,
  explore: <ExplorePage ref={PRIMARY_PAGE_REF_MAP.explore} />,
  notifications: <NotificationListPage ref={PRIMARY_PAGE_REF_MAP.notifications} />,
  livestreams: <LiveStreamsPage ref={PRIMARY_PAGE_REF_MAP.livestreams} />,
  me: <MePage ref={PRIMARY_PAGE_REF_MAP.me} />,
  profile: <ProfilePage ref={PRIMARY_PAGE_REF_MAP.profile} />,
  relay: <RelayPage ref={PRIMARY_PAGE_REF_MAP.relay} />,
  search: <SearchPage ref={PRIMARY_PAGE_REF_MAP.search} />
}

export type TPrimaryPageName = keyof typeof PRIMARY_PAGE_MAP
