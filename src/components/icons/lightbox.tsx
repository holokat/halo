import './lightbox.css'

import { IconChevronLeft } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconChevronLeft'
import { IconChevronRight } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconChevronRight'
import { IconCrossLarge } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCrossLarge'
import { IconExclamationTriangle } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconExclamationTriangle'
import { IconLoadingCircle } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconLoadingCircle'
import { IconZoomIn } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconZoomIn'
import { IconZoomOut } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconZoomOut'

export const lightboxRender = {
  iconPrev: () => <IconChevronLeft className="yarl__icon" aria-hidden="true" />,
  iconNext: () => <IconChevronRight className="yarl__icon" aria-hidden="true" />,
  iconZoomIn: () => <IconZoomIn className="yarl__icon" aria-hidden="true" />,
  iconZoomOut: () => <IconZoomOut className="yarl__icon" aria-hidden="true" />,
  iconClose: () => <IconCrossLarge className="yarl__icon" aria-hidden="true" />,
  iconLoading: () => <IconLoadingCircle className="yarl__icon animate-spin" aria-hidden="true" />,
  iconError: () => <IconExclamationTriangle className="yarl__icon" aria-hidden="true" />
}
