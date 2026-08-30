import 'yet-another-react-lightbox/styles.css'
import './index.css'

import { Toaster } from '@/components/ui/sonner'
import { BookmarksProvider } from '@/providers/BookmarksProvider'
import { ButtonRadiusProvider } from '@/providers/ButtonRadiusProvider'
import { CardRadiusProvider } from '@/providers/CardRadiusProvider'
import { MediaRadiusProvider } from '@/providers/MediaRadiusProvider'
import { CompactSidebarProvider } from '@/providers/CompactSidebarProvider'
import { LogoStyleProvider } from '@/providers/LogoStyleProvider'
import { LogoFontSizeProvider } from '@/providers/LogoFontSizeProvider'
import { WidgetSidebarTitleProvider } from '@/providers/WidgetSidebarTitleProvider'
import { ContentPolicyProvider } from '@/providers/ContentPolicyProvider'
import { DeckViewProvider } from '@/providers/DeckViewProvider'
import { CustomFeedsProvider } from '@/providers/CustomFeedsProvider'
import { DeletedEventProvider } from '@/providers/DeletedEventProvider'
import { DistractionFreeModeProvider } from '@/providers/DistractionFreeModeProvider'
import { FavoriteRelaysProvider } from '@/providers/FavoriteRelaysProvider'
import { FeedProvider } from '@/providers/FeedProvider'
import { FollowListProvider } from '@/providers/FollowListProvider'
import { FontFamilyProvider } from '@/providers/FontFamilyProvider'
import { FontSizeProvider } from '@/providers/FontSizeProvider'
import { TitleFontSizeProvider } from '@/providers/TitleFontSizeProvider'
import { KindFilterProvider } from '@/providers/KindFilterProvider'
import { LayoutModeProvider } from '@/providers/LayoutModeProvider'
import { MediaOnlyProvider } from '@/providers/MediaOnlyProvider'
import { MediaStyleProvider } from '@/providers/MediaStyleProvider'
import { MediaUploadServiceProvider } from '@/providers/MediaUploadServiceProvider'
import { MuteListProvider } from '@/providers/MuteListProvider'
import { NostrProvider } from '@/providers/NostrProvider'
import { PageThemeProvider } from '@/providers/PageThemeProvider'
import { PinListProvider } from '@/providers/PinListProvider'
import { PinnedRepliesProvider } from '@/providers/PinnedRepliesProvider'
import { PostButtonStyleProvider } from '@/providers/PostButtonStyleProvider'
import { PrimaryColorProvider } from '@/providers/PrimaryColorProvider'
import { ReadsVisibilityProvider } from '@/providers/ReadsVisibilityProvider'
import { ListsVisibilityProvider } from '@/providers/ListsVisibilityProvider'
import { ListsProvider } from '@/providers/ListsProvider'
import { MenuItemsProvider } from '@/providers/MenuItemsProvider'
import { ReplyProvider } from '@/providers/ReplyProvider'
import { ScreenSizeProvider } from '@/providers/ScreenSizeProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { ColorPaletteProvider } from '@/providers/ColorPaletteProvider'
import { TrendingNotesDismissedProvider } from '@/providers/TrendingNotesDismissedProvider'
import { UserPreferencesProvider } from '@/providers/UserPreferencesProvider'
import { UserTrustProvider } from '@/providers/UserTrustProvider'
import { WidgetsProvider } from '@/providers/WidgetsProvider'
import { WidgetSidebarDismissedProvider } from '@/providers/WidgetSidebarDismissedProvider'
import { RTLProvider } from '@/providers/RTLProvider'
import { NoteExpirationProvider } from '@/providers/NoteExpirationProvider'
import { TextOnlyModeProvider } from '@/providers/TextOnlyModeProvider'
import { LowBandwidthModeProvider } from '@/providers/LowBandwidthModeProvider'
import { DisableAvatarAnimationsProvider } from '@/providers/DisableAvatarAnimationsProvider'
import { DefaultReactionEmojisProvider } from '@/providers/DefaultReactionEmojisProvider'
import { CollapseLongNotesProvider } from '@/providers/CollapseLongNotesProvider'
import { AlwaysShowFullMediaProvider } from '@/providers/AlwaysShowFullMediaProvider'
import { LiveStreamPopoutProvider } from '@/providers/LiveStreamPopoutProvider'
import { LiveReactionFountainProvider } from '@/providers/LiveReactionFountainProvider'
import { SpamFilterProvider } from '@/providers/SpamFilterProvider'

import { AppWithListPreview } from './components/AppWithListPreview'

export default function App(): JSX.Element {
  return (
    <ThemeProvider>
      <ColorPaletteProvider>
        <PageThemeProvider>
          <PrimaryColorProvider>
            <FontSizeProvider>
              <TitleFontSizeProvider>
                <FontFamilyProvider>
                  <RTLProvider>
                    <ButtonRadiusProvider>
                      <PostButtonStyleProvider>
                        <CardRadiusProvider>
                          <MediaRadiusProvider>
                            <LayoutModeProvider>
                              <MediaStyleProvider>
                                <DeckViewProvider>
                                  <CompactSidebarProvider>
                                    <LogoStyleProvider>
                                      <LogoFontSizeProvider>
                                        <WidgetSidebarTitleProvider>
                                          <DistractionFreeModeProvider>
                                            <MenuItemsProvider>
                                              <ReadsVisibilityProvider>
                                                <ListsVisibilityProvider>
                                                  <ScreenSizeProvider>
                                                    <DeletedEventProvider>
                                                      <NostrProvider>
                                                        <ListsProvider>
                                                          <TextOnlyModeProvider>
                                                            <LowBandwidthModeProvider>
                                                              <DisableAvatarAnimationsProvider>
                                                                <CollapseLongNotesProvider>
                                                                  <AlwaysShowFullMediaProvider>
                                                                    <NoteExpirationProvider>
                                                                      <DefaultReactionEmojisProvider>
                                                                        <FavoriteRelaysProvider>
                                                                          <FollowListProvider>
                                                                            <SpamFilterProvider>
                                                                              <MuteListProvider>
                                                                                <UserTrustProvider>
                                                                                  <ContentPolicyProvider>
                                                                                    <BookmarksProvider>
                                                                                      <PinListProvider>
                                                                                        <PinnedRepliesProvider>
                                                                                          <CustomFeedsProvider>
                                                                                            <FeedProvider>
                                                                                              <ReplyProvider>
                                                                                                <MediaUploadServiceProvider>
                                                                                                  <KindFilterProvider>
                                                                                                    <MediaOnlyProvider>
                                                                                                      <UserPreferencesProvider>
                                                                                                        <TrendingNotesDismissedProvider>
                                                                                                          <WidgetsProvider>
                                                                                                            <WidgetSidebarDismissedProvider>
                                                                                                              <LiveStreamPopoutProvider>
                                                                                                                <LiveReactionFountainProvider>
                                                                                                                  <AppWithListPreview />
                                                                                                                  <Toaster />
                                                                                                                </LiveReactionFountainProvider>
                                                                                                              </LiveStreamPopoutProvider>
                                                                                                            </WidgetSidebarDismissedProvider>
                                                                                                          </WidgetsProvider>
                                                                                                        </TrendingNotesDismissedProvider>
                                                                                                      </UserPreferencesProvider>
                                                                                                    </MediaOnlyProvider>
                                                                                                  </KindFilterProvider>
                                                                                                </MediaUploadServiceProvider>
                                                                                              </ReplyProvider>
                                                                                            </FeedProvider>
                                                                                          </CustomFeedsProvider>
                                                                                        </PinnedRepliesProvider>
                                                                                      </PinListProvider>
                                                                                    </BookmarksProvider>
                                                                                  </ContentPolicyProvider>
                                                                                </UserTrustProvider>
                                                                              </MuteListProvider>
                                                                            </SpamFilterProvider>
                                                                          </FollowListProvider>
                                                                        </FavoriteRelaysProvider>
                                                                      </DefaultReactionEmojisProvider>
                                                                    </NoteExpirationProvider>
                                                                  </AlwaysShowFullMediaProvider>
                                                                </CollapseLongNotesProvider>
                                                              </DisableAvatarAnimationsProvider>
                                                            </LowBandwidthModeProvider>
                                                          </TextOnlyModeProvider>
                                                        </ListsProvider>
                                                      </NostrProvider>
                                                    </DeletedEventProvider>
                                                  </ScreenSizeProvider>
                                                </ListsVisibilityProvider>
                                              </ReadsVisibilityProvider>
                                            </MenuItemsProvider>
                                          </DistractionFreeModeProvider>
                                        </WidgetSidebarTitleProvider>
                                      </LogoFontSizeProvider>
                                    </LogoStyleProvider>
                                  </CompactSidebarProvider>
                                </DeckViewProvider>
                              </MediaStyleProvider>
                            </LayoutModeProvider>
                          </MediaRadiusProvider>
                        </CardRadiusProvider>
                      </PostButtonStyleProvider>
                    </ButtonRadiusProvider>
                  </RTLProvider>
                </FontFamilyProvider>
              </TitleFontSizeProvider>
            </FontSizeProvider>
          </PrimaryColorProvider>
        </PageThemeProvider>
      </ColorPaletteProvider>
    </ThemeProvider>
  )
}
