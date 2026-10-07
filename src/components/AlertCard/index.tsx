import { IconWarningSign as TriangleAlert } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconWarningSign'

export default function AlertCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="p-3 rounded-lg text-sm bg-amber-100/20 dark:bg-amber-950/20 border border-amber-500 text-amber-500 [&_svg]:size-4">
      <div className="flex items-center gap-2">
        <TriangleAlert />
        <div className="font-medium">{title}</div>
      </div>
      <div className="pl-6">{content}</div>
    </div>
  )
}
