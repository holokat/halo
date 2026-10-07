import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { IconAirplane } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconAirplane'
import { IconClock } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconClock'
import { IconCrossLarge } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconCrossLarge'
import { IconEmojiSmile } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconEmojiSmile'
import { IconFlag1 } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconFlag1'
import { IconForkKnife } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconForkKnife'
import { IconLightBulb } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconLightbulb'
import { IconMagnifyingGlass } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconMagnifyingGlass'
import { IconPets } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconPets'
import { IconPlusSmall } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconPlusSmall'
import { IconShapesPlusXSquareCircle } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconShapesPlusXSquareCircle'
import { IconSparklesThree } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconSparklesThree'
import { IconTrophy } from '@central-icons-react/round-outlined-radius-2-stroke-1.5/IconTrophy'

const outputDirectory = resolve(process.cwd(), 'public/generated/central-icons')

const icons = {
  'suggested-clock': IconClock,
  'smileys-people': IconEmojiSmile,
  'animals-nature': IconPets,
  'food-drink': IconForkKnife,
  'travel-places': IconAirplane,
  activities: IconTrophy,
  objects: IconLightBulb,
  symbols: IconShapesPlusXSquareCircle,
  flags: IconFlag1,
  custom: IconSparklesThree,
  search: IconMagnifyingGlass,
  clear: IconCrossLarge,
  plus: IconPlusSmall
}

await mkdir(outputDirectory, { recursive: true })

await Promise.all(
  Object.entries(icons).map(async ([name, Icon]) => {
    const svg = renderToStaticMarkup(
      React.createElement(Icon, { mode: 'raw', color: 'black', ariaHidden: true })
    )
    await writeFile(resolve(outputDirectory, `${name}.svg`), svg)
  })
)

console.log(`Generated ${Object.keys(icons).length} Central icon assets in ${outputDirectory}`)
