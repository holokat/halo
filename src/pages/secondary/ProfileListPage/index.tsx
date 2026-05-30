import { ProfileListBySearch } from '@/components/ProfileListBySearch'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const ProfileListPage = forwardRef(({ index }: { index?: number }, ref) => {
  const { t } = useTranslation()
  const [title, setTitle] = useState<React.ReactNode>()
  const [data, setData] = useState<{
    type: 'search'
    id: string
  } | null>(null)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const search = searchParams.get('s')
    if (search) {
      setTitle(`${t('Search')}: ${search}`)
      setData({ type: 'search', id: search })
      return
    }
  }, [])

  let content: React.ReactNode = null
  if (data?.type === 'search') {
    content = <ProfileListBySearch search={data.id} />
  }

  return (
    <SecondaryPageLayout ref={ref} index={index} title={title} displayScrollToTopButton>
      {content}
    </SecondaryPageLayout>
  )
})
ProfileListPage.displayName = 'ProfileListPage'
export default ProfileListPage
